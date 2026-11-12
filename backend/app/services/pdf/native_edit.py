import io
import re

import pikepdf

from app.core.errors import AppError

SUPPORTED_SIMPLE_ENCODINGS = {"/WinAnsiEncoding", "/StandardEncoding", "/MacRomanEncoding"}
SUBSET_PREFIX_RE = re.compile(r"^/[A-Z]{6}\+")


def _codec_for_encoding(encoding_name: str | None) -> str:
    if encoding_name == "/MacRomanEncoding":
        return "mac_roman"
    return "cp1252"


def _decode_pdf_text(obj, codec: str = "cp1252") -> str | None:
    if isinstance(obj, pikepdf.String):
        try:
            raw = bytes(obj)
            # Check UTF-16BE BOM
            if raw.startswith(b"\xfe\xff"):
                return raw[2:].decode("utf-16-be", errors="strict")
            return raw.decode(codec, errors="replace")
        except Exception:
            return None
    if isinstance(obj, pikepdf.Array):
        parts: list[str] = []
        for item in obj:
            if isinstance(item, pikepdf.String):
                decoded = _decode_pdf_text(item, codec=codec)
                if decoded is None:
                    return None
                parts.append(decoded)
        return "".join(parts)
    return None


def _font_support_info(resources: pikepdf.Object | None, font_name: str | None) -> tuple[bool, str | None, str]:
    if not isinstance(resources, pikepdf.Dictionary) or not font_name:
        return False, "Missing font resource", "cp1252"
    fonts = resources.get("/Font")
    if not isinstance(fonts, pikepdf.Dictionary) or font_name not in fonts:
        return False, "Font not declared on page", "cp1252"
    font_obj = fonts[font_name]
    if not isinstance(font_obj, pikepdf.Dictionary):
        return False, "Invalid font dictionary", "cp1252"
    subtype = str(font_obj.get("/Subtype", ""))
    if subtype == "/Type0":
        return False, "CID/Type0 subset font (glyph mapping not safely editable in stream)", "cp1252"
    base_font = str(font_obj.get("/BaseFont", ""))
    descriptor = font_obj.get("/FontDescriptor")
    has_embedded_stream = isinstance(descriptor, pikepdf.Dictionary) and any(
        k in descriptor for k in ("/FontFile", "/FontFile2", "/FontFile3")
    )
    if SUBSET_PREFIX_RE.match(base_font) and has_embedded_stream:
        return False, f"Embedded subset font ({base_font.lstrip('/')}) may lack replacement glyphs", "cp1252"
    encoding = font_obj.get("/Encoding")
    if encoding is None:
        # Built-in Standard 14 fonts (Helvetica/Times/Courier) often omit /Encoding
        return True, None, "cp1252"
    if isinstance(encoding, pikepdf.Name) and str(encoding) in SUPPORTED_SIMPLE_ENCODINGS:
        return True, None, _codec_for_encoding(str(encoding))
    return False, f"Custom font encoding ({encoding}) is not safely editable", "cp1252"


def inspect_native_content(pdf_bytes: bytes, page_number: int) -> dict:
    """
    Inspect existing PDF content stream operators on a 1-based page.
    Reports which text runs and embedded image XObjects can be safely modified or removed
    directly in the content stream without fake white-box masking.
    """
    with pikepdf.open(io.BytesIO(pdf_bytes)) as pdf:
        if page_number < 1 or page_number > len(pdf.pages):
            raise AppError("invalid_request", f"Page {page_number} is out of bounds.", 422)
        page = pdf.pages[page_number - 1]
        resources = page.get("/Resources")
        instructions = pikepdf.parse_content_stream(page)

        current_font: str | None = None
        current_size: float = 12.0
        text_runs: list[dict] = []
        images: list[dict] = []
        form_xobject_count = 0

        for idx, (operands, operator) in enumerate(instructions):
            op = str(operator)
            if op == "Tf" and len(operands) >= 2:
                current_font = str(operands[0])
                try:
                    current_size = float(operands[1])
                except Exception:
                    current_size = 12.0
            elif op in ("Tj", "TJ") and operands:
                editable, reason, codec = _font_support_info(resources, current_font)
                decoded = _decode_pdf_text(operands[0], codec=codec)
                if decoded is None or not decoded.strip():
                    editable = False
                    reason = reason or "Non-printable or empty text operand"
                text_runs.append({
                    "op_index": idx,
                    "operator": op,
                    "text": decoded or "",
                    "font": current_font,
                    "font_size": current_size,
                    "editable": editable,
                    "reason": reason,
                })
            elif op == "Do" and operands:
                xobj_name = str(operands[0])
                xobjects = resources.get("/XObject") if isinstance(resources, pikepdf.Dictionary) else None
                if isinstance(xobjects, pikepdf.Dictionary) and xobj_name in xobjects:
                    xobj = xobjects[xobj_name]
                    if isinstance(xobj, pikepdf.Stream) and xobj.get("/Subtype") == pikepdf.Name("/Image"):
                        images.append({
                            "op_index": idx,
                            "name": xobj_name,
                            "width": int(xobj.get("/Width", 0)),
                            "height": int(xobj.get("/Height", 0)),
                            "removable": True,
                        })
                    elif isinstance(xobj, pikepdf.Stream) and xobj.get("/Subtype") == pikepdf.Name("/Form"):
                        form_xobject_count += 1

        return {
            "page": page_number,
            "text_runs": text_runs,
            "images": images,
            "form_xobject_count": form_xobject_count,
        }


def replace_native_text(pdf_bytes: bytes, page_number: int, op_index: int, new_text: str) -> bytes:
    """
    Replace a supported existing PDF text operator directly in the page's content stream.
    The previous text string is removed from the content stream (not hidden behind an overlay).
    """
    with pikepdf.open(io.BytesIO(pdf_bytes)) as pdf:
        if page_number < 1 or page_number > len(pdf.pages):
            raise AppError("invalid_request", f"Page {page_number} is out of bounds.", 422)
        page = pdf.pages[page_number - 1]
        resources = page.get("/Resources")
        instructions = list(pikepdf.parse_content_stream(page))

        if op_index < 0 or op_index >= len(instructions):
            raise AppError("invalid_request", "Target content stream operator index is invalid.", 422)

        current_font: str | None = None
        for idx, (operands, operator) in enumerate(instructions):
            if str(operator) == "Tf" and len(operands) >= 2:
                current_font = str(operands[0])
            if idx == op_index:
                op = str(operator)
                if op not in ("Tj", "TJ"):
                    raise AppError("invalid_request", "Selected operator is not a text operator.", 422)
                editable, reason, codec = _font_support_info(resources, current_font)
                if not editable:
                    raise AppError("unsupported_native_edit", reason or "Font cannot be safely rewritten.", 422)
                try:
                    encoded = new_text.encode(codec)
                except UnicodeEncodeError as exc:
                    raise AppError(
                        "unsupported_characters",
                        f"Replacement text contains characters unsupported by this PDF font encoding ({codec}).",
                        422,
                    ) from exc
                instructions[idx] = pikepdf.ContentStreamInstruction(
                    [pikepdf.String(encoded)],
                    pikepdf.Operator("Tj"),
                )
                break

        new_stream = pikepdf.unparse_content_stream(instructions)
        page.Contents = pdf.make_stream(new_stream)
        out = io.BytesIO()
        pdf.save(out)
        return out.getvalue()


def delete_native_image(pdf_bytes: bytes, page_number: int, op_index: int) -> bytes:
    """Remove a supported embedded image XObject draw instruction ('Do') from a page content stream."""
    with pikepdf.open(io.BytesIO(pdf_bytes)) as pdf:
        if page_number < 1 or page_number > len(pdf.pages):
            raise AppError("invalid_request", f"Page {page_number} is out of bounds.", 422)
        page = pdf.pages[page_number - 1]
        instructions = list(pikepdf.parse_content_stream(page))

        if op_index < 0 or op_index >= len(instructions):
            raise AppError("invalid_request", "Target image operator index is invalid.", 422)
        _, operator = instructions[op_index]
        if str(operator) != "Do":
            raise AppError("invalid_request", "Selected operator is not an image draw instruction.", 422)

        del instructions[op_index]
        page.Contents = pdf.make_stream(pikepdf.unparse_content_stream(instructions))
        pdf.remove_unreferenced_resources()
        out = io.BytesIO()
        pdf.save(out)
        return out.getvalue()
