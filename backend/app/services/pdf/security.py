import io
from typing import Iterable

import pdfplumber
import pikepdf
import pypdfium2 as pdfium
from PIL import ImageDraw
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas as rl_canvas

from app.core.errors import AppError

ACTIVE_CATALOG_KEYS = ("/OpenAction", "/AA", "/JavaScript", "/JS")
ACTIVE_PAGE_KEYS = ("/AA",)
ACTIVE_ACTION_TYPES = {"/JavaScript", "/Launch", "/RichMedia", "/GoToR"}


def encrypt_pdf(
    pdf_bytes: bytes,
    *,
    user_password: str,
    owner_password: str | None = None,
    allow_print: bool = True,
    allow_copy: bool = True,
    allow_modify: bool = False,
    allow_annotate: bool = True,
) -> bytes:
    """Encrypt a PDF with AES-256 via pikepdf/QPDF."""
    if not user_password and not owner_password:
        raise AppError("password_required", "Provide a user or owner password to protect this PDF.", 422)
    owner = owner_password or user_password
    with pikepdf.open(io.BytesIO(pdf_bytes)) as pdf:
        perms = pikepdf.Permissions(
            accessibility=True,
            extract=allow_copy,
            modify_annotation=allow_annotate,
            modify_assembly=allow_modify,
            modify_form=allow_modify or allow_annotate,
            modify_other=allow_modify,
            print_lowres=allow_print,
            print_highres=allow_print,
        )
        out = io.BytesIO()
        pdf.save(
            out,
            encryption=pikepdf.Encryption(user=user_password, owner=owner, allow=perms, R=6),
        )
        return out.getvalue()


def unlock_pdf(pdf_bytes: bytes, password: str) -> bytes:
    """Decrypt a password-protected PDF using an authorized password."""
    if not password:
        raise AppError("password_required", "Enter the document password to unlock it.", 422)
    try:
        with pikepdf.open(io.BytesIO(pdf_bytes), password=password) as pdf:
            out = io.BytesIO()
            pdf.save(out)
            return out.getvalue()
    except pikepdf.PasswordError as exc:
        raise AppError("invalid_password", "The provided password is incorrect.", 422) from exc
    except Exception as exc:
        raise AppError("invalid_pdf", "Could not unlock this PDF.", 422) from exc


def inspect_metadata(pdf_bytes: bytes) -> dict:
    """Inspect DocInfo keys, XMP presence, and active-content indicators."""
    with pikepdf.open(io.BytesIO(pdf_bytes)) as pdf:
        docinfo = {str(k).lstrip("/"): str(v) for k, v in pdf.docinfo.items()}
        has_xmp = "/Metadata" in pdf.Root
        active_items: list[str] = []
        for k in ACTIVE_CATALOG_KEYS:
            if k in pdf.Root:
                active_items.append(f"Catalog {k}")
        names = pdf.Root.get("/Names")
        if isinstance(names, pikepdf.Dictionary):
            if "/JavaScript" in names:
                active_items.append("Names /JavaScript")
            if "/EmbeddedFiles" in names:
                active_items.append("Names /EmbeddedFiles")
        for idx, page in enumerate(pdf.pages):
            for k in ACTIVE_PAGE_KEYS:
                if k in page:
                    active_items.append(f"Page {idx + 1} {k}")
            annots = page.get("/Annots")
            if isinstance(annots, pikepdf.Array):
                for annot in annots:
                    if isinstance(annot, pikepdf.Dictionary):
                        action = annot.get("/A")
                        if isinstance(action, pikepdf.Dictionary) and str(action.get("/S", "")) in ACTIVE_ACTION_TYPES:
                            active_items.append(f"Page {idx + 1} annotation action {action.get('/S')}")
        return {
            "docinfo": docinfo,
            "has_xmp": has_xmp,
            "active_content": active_items,
            "is_encrypted": pdf.is_encrypted,
            "page_count": len(pdf.pages),
        }


def clean_metadata_and_sanitize(
    pdf_bytes: bytes,
    *,
    remove_keys: Iterable[str] | None = None,
    remove_all_metadata: bool = True,
    sanitize_active: bool = True,
) -> dict:
    """Strip selected or all metadata and optionally remove active PDF actions/JavaScript."""
    removed_keys: list[str] = []
    removed_active: list[str] = []

    with pikepdf.open(io.BytesIO(pdf_bytes)) as pdf:
        if remove_all_metadata:
            for key in list(pdf.docinfo.keys()):
                removed_keys.append(str(key).lstrip("/"))
                del pdf.docinfo[key]
            if "/Metadata" in pdf.Root:
                del pdf.Root["/Metadata"]
                removed_keys.append("XMP")
        elif remove_keys:
            targets = {k if k.startswith("/") else f"/{k}" for k in remove_keys}
            for key in list(pdf.docinfo.keys()):
                if str(key) in targets:
                    removed_keys.append(str(key).lstrip("/"))
                    del pdf.docinfo[key]
            if "/XMP" in targets and "/Metadata" in pdf.Root:
                del pdf.Root["/Metadata"]
                removed_keys.append("XMP")

        if sanitize_active:
            for key in ACTIVE_CATALOG_KEYS:
                if key in pdf.Root:
                    del pdf.Root[key]
                    removed_active.append(f"Catalog {key}")
            names = pdf.Root.get("/Names")
            if isinstance(names, pikepdf.Dictionary):
                for key in ("/JavaScript", "/EmbeddedFiles"):
                    if key in names:
                        del names[key]
                        removed_active.append(f"Names {key}")
            for idx, page in enumerate(pdf.pages):
                for key in ACTIVE_PAGE_KEYS:
                    if key in page:
                        del page[key]
                        removed_active.append(f"Page {idx + 1} {key}")
                annots = page.get("/Annots")
                if isinstance(annots, pikepdf.Array):
                    for annot in annots:
                        if isinstance(annot, pikepdf.Dictionary):
                            action = annot.get("/A")
                            if isinstance(action, pikepdf.Dictionary) and str(action.get("/S", "")) in ACTIVE_ACTION_TYPES:
                                del annot["/A"]
                                removed_active.append(f"Page {idx + 1} annotation action")

        out = io.BytesIO()
        pdf.save(out)
        return {
            "bytes": out.getvalue(),
            "removed_metadata_keys": removed_keys,
            "removed_active_items": removed_active,
        }


def redact_pdf(
    pdf_bytes: bytes,
    boxes: list[dict],
    *,
    dpi: int = 200,
) -> dict:
    """
    Irreversibly remove sensitive content under redaction boxes.

    For each page containing redaction boxes:
    1. Inspects extractable text inside the target rectangles before redaction.
    2. Renders that page to an image, permanently paints opaque black boxes over the target
       rectangles, and replaces the page with the flattened image stream (destroying all
       underlying text operators, vector graphics, form widgets, and annotations on that page).
    3. Non-redacted pages keep their original vector/text structure untouched.
    4. Re-opens the exported PDF with pdfplumber to verify zero text remains in the redacted boxes.
    """
    if not boxes:
        raise AppError("redaction_empty", "Select at least one area to redact.", 422)

    by_page: dict[int, list[dict]] = {}
    for box in boxes:
        p = int(box["page"])
        if p < 1:
            raise AppError("invalid_request", "Redaction page index must be >= 1.", 422)
        by_page.setdefault(p, []).append(box)

    removed_snippets: list[str] = []
    with pdfplumber.open(io.BytesIO(pdf_bytes)) as plumber:
        total_pages = len(plumber.pages)
        for p_num, p_boxes in by_page.items():
            if p_num > total_pages:
                raise AppError("invalid_request", f"Page {p_num} exceeds document page count ({total_pages}).", 422)
            p_page = plumber.pages[p_num - 1]
            for b in p_boxes:
                crop_box = (
                    max(0.0, float(b["x"])),
                    max(0.0, float(b["y"])),
                    min(float(p_page.width), float(b["x"]) + float(b["width"])),
                    min(float(p_page.height), float(b["y"]) + float(b["height"])),
                )
                if crop_box[2] > crop_box[0] and crop_box[3] > crop_box[1]:
                    cropped = p_page.crop(crop_box)
                    text = (cropped.extract_text() or "").strip()
                    if text:
                        removed_snippets.append(text)

    # Render only pages that have redactions and replace them cleanly in pikepdf
    pdfium_doc = pdfium.PdfDocument(pdf_bytes)
    scale = dpi / 72.0
    replacement_pages: dict[int, bytes] = {}
    try:
        for p_num, p_boxes in by_page.items():
            f_page = pdfium_doc[p_num - 1]
            width_pt, height_pt = f_page.get_size()
            bitmap = f_page.render(scale=scale)
            pil_img = bitmap.to_pil().convert("RGB")
            draw = ImageDraw.Draw(pil_img)

            for b in p_boxes:
                x0 = int(round(float(b["x"]) * scale))
                y0 = int(round(float(b["y"]) * scale))
                x1 = int(round((float(b["x"]) + float(b["width"])) * scale))
                y1 = int(round((float(b["y"]) + float(b["height"])) * scale))
                draw.rectangle([x0, y0, x1, y1], fill=(0, 0, 0))

            img_buf = io.BytesIO()
            pil_img.save(img_buf, format="PNG")
            img_buf.seek(0)

            page_pdf_buf = io.BytesIO()
            c = rl_canvas.Canvas(page_pdf_buf, pagesize=(width_pt, height_pt))
            c.drawImage(ImageReader(img_buf), 0, 0, width=width_pt, height=height_pt)
            c.showPage()
            c.save()
            replacement_pages[p_num] = page_pdf_buf.getvalue()
    finally:
        pdfium_doc.close()

    with pikepdf.open(io.BytesIO(pdf_bytes)) as base_pdf:
        for p_num, rep_bytes in replacement_pages.items():
            with pikepdf.open(io.BytesIO(rep_bytes)) as rep_pdf:
                base_pdf.pages[p_num - 1] = rep_pdf.pages[0]
        out_buf = io.BytesIO()
        base_pdf.save(out_buf)
        redacted_bytes = out_buf.getvalue()

    # Post-redaction verification via independent extractor
    remaining_chars = 0
    with pdfplumber.open(io.BytesIO(redacted_bytes)) as verify_plumber:
        for p_num, p_boxes in by_page.items():
            v_page = verify_plumber.pages[p_num - 1]
            for b in p_boxes:
                crop_box = (
                    max(0.0, float(b["x"])),
                    max(0.0, float(b["y"])),
                    min(float(v_page.width), float(b["x"]) + float(b["width"])),
                    min(float(v_page.height), float(b["y"]) + float(b["height"])),
                )
                if crop_box[2] > crop_box[0] and crop_box[3] > crop_box[1]:
                    leftover = (v_page.crop(crop_box).extract_text() or "").strip()
                    remaining_chars += len(leftover)

    return {
        "bytes": redacted_bytes,
        "redacted_pages": sorted(by_page.keys()),
        "removed_snippets_count": len(removed_snippets),
        "verified_removed": remaining_chars == 0,
        "remaining_chars_in_boxes": remaining_chars,
    }
