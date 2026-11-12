import datetime
import io
from typing import Any

import pikepdf
from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.hazmat.primitives.serialization import pkcs12
from cryptography.x509.oid import NameOID
from pyhanko.pdf_utils.incremental_writer import IncrementalPdfFileWriter
from pyhanko.pdf_utils.reader import PdfFileReader as HankoPdfReader
from pyhanko.sign import fields as hanko_fields, signers as hanko_signers
from pyhanko.sign.validation import validate_pdf_signature
from pyhanko_certvalidator import ValidationContext
from pypdf import PdfReader, PdfWriter
from pypdf.generic import ArrayObject, NameObject
from reportlab.lib import colors
from reportlab.pdfgen import canvas as rl_canvas

from app.core.errors import AppError


def inspect_forms(pdf_bytes: bytes) -> dict:
    """Discover existing AcroForm fields, types, values, options, and page positions."""
    reader = PdfReader(io.BytesIO(pdf_bytes))
    raw_fields = reader.get_fields() or {}
    # Map annotation object indirect refs to (page_num, rect)
    widget_locations: dict[str, tuple[int, list[float]]] = {}
    for p_idx, page in enumerate(reader.pages, start=1):
        annots = page.get("/Annots") or []
        for annot_ref in annots:
            annot = annot_ref.get_object()
            if annot.get("/Subtype") != "/Widget":
                continue
            name = annot.get("/T")
            if not name and "/Parent" in annot:
                name = annot["/Parent"].get_object().get("/T")
            rect = [float(x) for x in annot.get("/Rect", [0, 0, 0, 0])]
            if name:
                widget_locations[str(name)] = (p_idx, rect)

    items: list[dict] = []
    for name, field in raw_fields.items():
        ft = str(field.get("/FT", ""))
        val = field.get("/V")
        if hasattr(val, "get_object"):
            val = val.get_object()
        if ft == "/Tx":
            kind = "text"
        elif ft == "/Btn":
            ff = int(field.get("/Ff", 0) or 0)
            kind = "radio" if (ff & (1 << 15)) else "checkbox"
        elif ft == "/Ch":
            kind = "choice"
        elif ft == "/Sig":
            kind = "signature"
        else:
            kind = "other"

        options: list[str] = []
        if "/Opt" in field:
            for opt in field["/Opt"]:
                if isinstance(opt, (list, ArrayObject)) and len(opt) > 0:
                    options.append(str(opt[0]))
                else:
                    options.append(str(opt))

        loc = widget_locations.get(str(name))
        items.append({
            "name": str(name),
            "type": kind,
            "value": None if val is None else str(val),
            "options": options,
            "page": loc[0] if loc else None,
            "rect": loc[1] if loc else None,
        })

    return {"field_count": len(items), "fields": items}


def create_form_fields(pdf_bytes: bytes, new_fields: list[dict]) -> bytes:
    """Add interactive AcroForm fields (text, checkbox, choice) to specified pages."""
    if not new_fields:
        raise AppError("invalid_request", "Specify at least one form field to create.", 422)

    by_page: dict[int, list[dict]] = {}
    for item in new_fields:
        p = int(item.get("page", 1))
        by_page.setdefault(p, []).append(item)

    with pikepdf.open(io.BytesIO(pdf_bytes)) as base_pdf:
        total = len(base_pdf.pages)
        for p_num, p_fields in by_page.items():
            if p_num < 1 or p_num > total:
                raise AppError("invalid_request", f"Page {p_num} is out of bounds (1–{total}).", 422)
            base_page = base_pdf.pages[p_num - 1]
            mbox = [float(x) for x in base_page.mediabox]
            pw, ph = mbox[2] - mbox[0], mbox[3] - mbox[1]

            buf = io.BytesIO()
            c = rl_canvas.Canvas(buf, pagesize=(pw, ph))
            form = c.acroForm
            for f in p_fields:
                name = str(f["name"]).strip()
                if not name:
                    raise AppError("invalid_request", "Form field name cannot be empty.", 422)
                kind = f.get("type", "text")
                x = float(f["x"])
                y_top = float(f["y"])
                w = max(12.0, float(f.get("width", 140)))
                h = max(12.0, float(f.get("height", 22)))
                y_bottom = max(0.0, ph - y_top - h)

                if kind == "checkbox":
                    form.checkbox(
                        name=name,
                        x=x,
                        y=y_bottom,
                        size=min(w, h),
                        checked=bool(f.get("checked", False)),
                        borderColor=colors.HexColor("#163f3b"),
                        fillColor=colors.white,
                        textColor=colors.HexColor("#163f3b"),
                    )
                elif kind == "choice":
                    opts = [str(o) for o in f.get("options", []) if str(o).strip()] or ["Option 1", "Option 2"]
                    form.choice(
                        name=name,
                        x=x,
                        y=y_bottom,
                        width=w,
                        height=h,
                        options=opts,
                        value=str(f.get("value") or opts[0]),
                        borderColor=colors.HexColor("#163f3b"),
                        fillColor=colors.white,
                        textColor=colors.black,
                    )
                else:
                    form.textfield(
                        name=name,
                        x=x,
                        y=y_bottom,
                        width=w,
                        height=h,
                        value=str(f.get("value", "")),
                        borderColor=colors.HexColor("#163f3b"),
                        fillColor=colors.white,
                        textColor=colors.black,
                        fontSize=float(f.get("font_size", 11)),
                    )
            c.showPage()
            c.save()

            with pikepdf.open(io.BytesIO(buf.getvalue())) as form_pdf:
                src_page = form_pdf.pages[0]
                src_annots = src_page.get("/Annots")
                if isinstance(src_annots, pikepdf.Array):
                    dest_annots = base_page.get("/Annots")
                    if not isinstance(dest_annots, pikepdf.Array):
                        dest_annots = pikepdf.Array()
                        base_page[pikepdf.Name("/Annots")] = dest_annots

                    acro = base_pdf.Root.get("/AcroForm")
                    if not isinstance(acro, pikepdf.Dictionary):
                        acro = pikepdf.Dictionary(Fields=pikepdf.Array(), NeedAppearances=True)
                        base_pdf.Root[pikepdf.Name("/AcroForm")] = acro
                    acro_fields = acro.get("/Fields")
                    if not isinstance(acro_fields, pikepdf.Array):
                        acro_fields = pikepdf.Array()
                        acro[pikepdf.Name("/Fields")] = acro_fields

                    src_acro = form_pdf.Root.get("/AcroForm")
                    if isinstance(src_acro, pikepdf.Dictionary) and "/DR" in src_acro and "/DR" not in acro:
                        dr_obj = src_acro["/DR"]
                        acro[pikepdf.Name("/DR")] = base_pdf.copy_foreign(
                            dr_obj if dr_obj.is_indirect else form_pdf.make_indirect(dr_obj)
                        )

                    for annot in src_annots:
                        src_indirect = annot if annot.is_indirect else form_pdf.make_indirect(annot)
                        copied_annot = base_pdf.copy_foreign(src_indirect)
                        copied_annot[pikepdf.Name("/P")] = base_page.obj
                        dest_annots.append(copied_annot)
                        acro_fields.append(copied_annot)

        out = io.BytesIO()
        base_pdf.save(out)
        return out.getvalue()


def _flatten_widgets(pdf_bytes: bytes) -> bytes:
    """Bake widget normal appearances (/AP /N) into page content streams and remove AcroForm widgets."""
    with pikepdf.open(io.BytesIO(pdf_bytes)) as pdf:
        for page in pdf.pages:
            annots = page.get("/Annots")
            if not isinstance(annots, pikepdf.Array):
                continue
            kept_annots = pikepdf.Array()
            extra_cmds: list[str] = []
            resources = page.get("/Resources")
            if not isinstance(resources, pikepdf.Dictionary):
                resources = pikepdf.Dictionary()
                page[pikepdf.Name("/Resources")] = resources
            xobjects = resources.get("/XObject")
            if not isinstance(xobjects, pikepdf.Dictionary):
                xobjects = pikepdf.Dictionary()
                resources[pikepdf.Name("/XObject")] = xobjects

            widget_idx = 0
            for annot in annots:
                if not isinstance(annot, pikepdf.Dictionary) or annot.get("/Subtype") != pikepdf.Name("/Widget"):
                    kept_annots.append(annot)
                    continue
                ap = annot.get("/AP")
                rect = annot.get("/Rect")
                if isinstance(ap, pikepdf.Dictionary) and "/N" in ap and isinstance(rect, pikepdf.Array) and len(rect) == 4:
                    n_obj = ap["/N"]
                    if isinstance(n_obj, pikepdf.Dictionary) and not isinstance(n_obj, pikepdf.Stream):
                        # Appearance state subdict (e.g. checkbox /Yes vs /Off)
                        state = annot.get("/AS") or annot.get("/V") or pikepdf.Name("/Off")
                        n_obj = n_obj.get(str(state)) or n_obj.get("/Off")
                    if isinstance(n_obj, pikepdf.Stream):
                        widget_idx += 1
                        name = f"/DoceraFlatW{widget_idx}"
                        while name in xobjects:
                            widget_idx += 1
                            name = f"/DoceraFlatW{widget_idx}"
                        xobjects[pikepdf.Name(name)] = n_obj
                        x0, y0, x1, y1 = [float(v) for v in rect]
                        rw = max(1.0, x1 - x0)
                        rh = max(1.0, y1 - y0)
                        bbox = n_obj.get("/BBox")
                        if isinstance(bbox, pikepdf.Array) and len(bbox) == 4:
                            bx0, by0, bx1, by1 = [float(v) for v in bbox]
                            bw = max(1.0, bx1 - bx0)
                            bh = max(1.0, by1 - by0)
                            sx, sy = rw / bw, rh / bh
                            tx, ty = x0 - bx0 * sx, y0 - by0 * sy
                        else:
                            sx, sy, tx, ty = 1.0, 1.0, x0, y0
                        extra_cmds.append(f"q {sx:.4f} 0 0 {sy:.4f} {tx:.4f} {ty:.4f} cm {name} Do Q")

            if extra_cmds:
                existing = page.Contents.read_bytes() if "/Contents" in page else b""
                if isinstance(page.get("/Contents"), pikepdf.Array):
                    existing = b"\n".join(s.read_bytes() for s in page.Contents)
                combined = existing + b"\n" + "\n".join(extra_cmds).encode("ascii")
                page.Contents = pdf.make_stream(combined)

            if len(kept_annots):
                page[pikepdf.Name("/Annots")] = kept_annots
            elif "/Annots" in page:
                del page["/Annots"]

        if "/AcroForm" in pdf.Root:
            del pdf.Root["/AcroForm"]

        out = io.BytesIO()
        pdf.save(out)
        return out.getvalue()


def fill_forms(pdf_bytes: bytes, values: dict[str, Any], *, flatten: bool = False) -> bytes:
    """Fill AcroForm fields by name and optionally flatten widget annotations into page content."""
    reader = PdfReader(io.BytesIO(pdf_bytes))
    writer = PdfWriter()
    writer.append(reader)

    normalized: dict[str, Any] = {}
    for k, v in values.items():
        if isinstance(v, bool):
            normalized[k] = NameObject("/Yes") if v else NameObject("/Off")
        else:
            normalized[k] = str(v)

    for page in writer.pages:
        writer.update_page_form_field_values(page, normalized, auto_regenerate=True)

    buf = io.BytesIO()
    writer.write(buf)
    filled = buf.getvalue()
    if flatten:
        return _flatten_widgets(filled)
    return filled


def generate_self_signed_pkcs12(common_name: str, password: str) -> bytes:
    """Create a local self-signed RSA-2048 X.509 certificate + key packaged as PKCS#12."""
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    subject = issuer = x509.Name([
        x509.NameAttribute(NameOID.COMMON_NAME, common_name[:64] or "Docera Local Signer"),
        x509.NameAttribute(NameOID.ORGANIZATION_NAME, "Docera Self-Signed Local Certificate"),
    ])
    now = datetime.datetime.now(datetime.timezone.utc)
    cert = (
        x509.CertificateBuilder()
        .subject_name(subject)
        .issuer_name(issuer)
        .public_key(key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(now - datetime.timedelta(minutes=5))
        .not_valid_after(now + datetime.timedelta(days=365))
        .add_extension(x509.BasicConstraints(ca=False, path_length=None), critical=True)
        .sign(key, hashes.SHA256())
    )
    return pkcs12.serialize_key_and_certificates(
        name=common_name.encode("utf-8"),
        key=key,
        cert=cert,
        cas=None,
        encryption_algorithm=serialization.BestAvailableEncryption(password.encode("utf-8")),
    )


def sign_pdf_cryptographic(
    pdf_bytes: bytes,
    *,
    signer_name: str,
    reason: str = "Document signed with Docera",
    location: str = "",
    pkcs12_bytes: bytes | None = None,
    pkcs12_password: str = "",
    field_name: str = "DoceraSignature1",
) -> dict:
    """
    Apply a standards-compatible CMS/PKCS#7 cryptographic digital signature using pyHanko.
    Clearly distinguishes self-signed local certificates from user-supplied PKCS#12 credentials.
    """
    used_self_signed = pkcs12_bytes is None
    if pkcs12_bytes is None:
        effective_pw = pkcs12_password or "docera-local-sign"
        p12_data = generate_self_signed_pkcs12(signer_name or "Docera Signer", effective_pw)
    else:
        p12_data = pkcs12_bytes
        effective_pw = pkcs12_password

    try:
        key, cert, cas = pkcs12.load_key_and_certificates(
            p12_data,
            effective_pw.encode("utf-8") if effective_pw else None,
        )
    except Exception as exc:
        raise AppError("invalid_certificate", "Could not unlock PKCS#12 certificate with the provided password.", 422) from exc

    if key is None or cert is None:
        raise AppError("invalid_certificate", "PKCS#12 bundle does not contain both a certificate and private key.", 422)

    from asn1crypto import keys as asn1_keys, x509 as asn1_x509
    from pyhanko_certvalidator.registry import SimpleCertificateStore

    cert_der = cert.public_bytes(serialization.Encoding.DER)
    asn1_cert = asn1_x509.Certificate.load(cert_der)
    key_der = key.private_bytes(
        serialization.Encoding.DER,
        serialization.PrivateFormat.PKCS8,
        serialization.NoEncryption(),
    )
    asn1_key = asn1_keys.PrivateKeyInfo.load(key_der)
    store = SimpleCertificateStore()
    store.register(asn1_cert)
    for ca in cas or []:
        store.register(asn1_x509.Certificate.load(ca.public_bytes(serialization.Encoding.DER)))

    signer = hanko_signers.SimpleSigner(
        signing_cert=asn1_cert,
        signing_key=asn1_key,
        cert_registry=store,
    )

    in_buf = io.BytesIO(pdf_bytes)
    writer = IncrementalPdfFileWriter(in_buf)
    unique_field = field_name
    existing = set((inspect_forms(pdf_bytes))["fields"][i]["name"] for i in range(len(inspect_forms(pdf_bytes)["fields"])))
    counter = 2
    while unique_field in existing:
        unique_field = f"{field_name}_{counter}"
        counter += 1

    meta = hanko_signers.PdfSignatureMetadata(
        field_name=unique_field,
        reason=reason,
        location=location or None,
        name=signer_name or None,
    )
    out = io.BytesIO()
    hanko_signers.sign_pdf(writer, meta, signer=signer, output=out)
    return {
        "bytes": out.getvalue(),
        "field_name": unique_field,
        "self_signed": used_self_signed,
        "certificate_subject": cert.subject.rfc4514_string(),
    }


def verify_pdf_signatures(pdf_bytes: bytes) -> dict:
    """Inspect and validate embedded cryptographic digital signatures via pyHanko."""
    reader = HankoPdfReader(io.BytesIO(pdf_bytes))
    sigs = reader.embedded_signatures
    results: list[dict] = []
    for sig in sigs:
        signer_cert = sig.signer_cert
        vc = ValidationContext(trust_roots=[signer_cert] if signer_cert else None, allow_fetching=False)
        status = validate_pdf_signature(sig, vc)
        results.append({
            "field_name": sig.field_name,
            "intact": bool(status.intact),
            "valid": bool(status.valid),
            "trusted": bool(status.trusted),
            "coverage": str(status.coverage),
            "signer": signer_cert.subject.human_friendly if signer_cert else "Unknown",
            "self_signed": bool(signer_cert and signer_cert.issuer == signer_cert.subject),
        })
    return {"signature_count": len(results), "signatures": results}
