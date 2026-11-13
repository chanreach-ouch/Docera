import io
import os
from pathlib import Path
import re

import pikepdf
import pymupdf
import uharfbuzz as hb

from app.core.errors import AppError
from app.services.pdf.layout_engine import (
    LayoutResult,
    is_khmer_text,
    resolve_font_path,
    shape_text_layout,
)

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
        return True, None, "cp1252"
    if isinstance(encoding, pikepdf.Name) and str(encoding) in SUPPORTED_SIMPLE_ENCODINGS:
        return True, None, _codec_for_encoding(str(encoding))
    return False, f"Custom font encoding ({encoding}) is not safely editable", "cp1252"


def font_to_standard(font_name: str, flags: int = 0) -> str:
    """Normalize arbitrary PDF font names into standard PDF font names supported by Docera."""
    fn = font_name.lower().replace("+", "-")
    if "-" in fn:
        parts = fn.split("-")
        fn = parts[-1] if len(parts) > 1 else parts[0]

    # Specific Khmer OpenType fonts
    if "battambang" in fn:
        return "KhmerOSBattambang"
    if "muol" in fn or "moul" in fn:
        return "KhmerOSMuol"
    if "khmer" in fn:
        if "serif" in fn:
            return "Noto Serif Khmer"
        if "noto" in fn or "sans" in fn:
            return "Noto Sans Khmer"
        return "KhmerOS"

    is_bold = bool(flags & 16) or any(k in fn for k in ("bold", "black", "heavy", "medium", "semibold"))
    is_italic = bool(flags & 2) or any(k in fn for k in ("italic", "oblique", "slanted"))

    if any(k in fn for k in ("times", "roman", "serif", "cambria", "georgia", "garamond", "minion")):
        if is_bold and is_italic:
            return "times-bolditalic"
        if is_bold:
            return "times-bold"
        if is_italic:
            return "times-italic"
        return "times-roman"
    if any(k in fn for k in ("courier", "mono", "consolas", "menlo", "typewriter", "code")):
        if is_bold and is_italic:
            return "courier-boldoblique"
        if is_bold:
            return "courier-bold"
        if is_italic:
            return "courier-oblique"
        return "courier"
    # Default to Helvetica family
    if is_bold and is_italic:
        return "helv-boldoblique"
    if is_bold:
        return "helv-bold"
    if is_italic:
        return "helv-oblique"
    return "helv"


def int_to_hex(color_int: int) -> str:
    """Convert PyMuPDF integer color (0xRRGGBB) to hex string #RRGGBB."""
    r = (color_int >> 16) & 255
    g = (color_int >> 8) & 255
    b = color_int & 255
    return f"#{r:02x}{g:02x}{b:02x}"


def hex_to_rgb(hex_str: str) -> tuple[float, float, float]:
    """Convert #RRGGBB string to 0.0-1.0 RGB tuple for PyMuPDF."""
    h = (hex_str or "#000000").lstrip("#").strip()
    if len(h) == 3:
        h = "".join(c * 2 for c in h)
    if len(h) == 6:
        try:
            return (
                int(h[0:2], 16) / 255.0,
                int(h[2:4], 16) / 255.0,
                int(h[4:6], 16) / 255.0,
            )
        except ValueError:
            pass
    return (0.0, 0.0, 0.0)


def has_khmer(text: str) -> bool:
    """Check if string contains any characters in the Khmer Unicode range (U+1780 to U+17FF)."""
    return any(0x1780 <= ord(c) <= 0x17FF for c in text)


def resolve_khmer_font(font_name: str | None = None) -> tuple[str, str]:
    """
    Resolve the best available Khmer TrueType font path and canonical family name.
    Prioritizes exact match for KhmerOSBattambang, KhmerOSMuol, KhmerOS, NotoSansKhmer, NotoSerifKhmer.
    Falls back gracefully to full OpenType Khmer fonts with complete GSUB/GPOS tables.
    """
    return resolve_font_path(font_name, is_khmer=True)


def shape_text_runs(
    text: str,
    font_path: str,
    font_size: float,
    script: str = "Khmr",
    language: str = "km",
) -> tuple[list[dict], float, float]:
    """
    Shape complex text using HarfBuzz (uharfbuzz).
    Applies OpenType GSUB (consonant clusters, subscripts, ligatures, pre-base vowels)
    and GPOS (combining marks, vertical & horizontal offsets).
    """
    with open(font_path, "rb") as f:
        font_data = f.read()

    face = hb.Face(font_data)
    font = hb.Font(face)
    upem = float(face.upem)
    scale = font_size / upem

    buf = hb.Buffer()
    buf.add_str(text)
    buf.guess_segment_properties()
    if script:
        buf.script = script
    if language:
        buf.language = language

    hb.shape(font, buf)

    glyphs = []
    total_width = 0.0
    for info, pos in zip(buf.glyph_infos, buf.glyph_positions):
        x_adv = pos.x_advance * scale
        y_adv = pos.y_advance * scale
        x_off = pos.x_offset * scale
        y_off = pos.y_offset * scale
        glyphs.append({
            "gid": info.codepoint,
            "cluster": info.cluster,
            "x_advance": x_adv,
            "y_advance": y_adv,
            "x_offset": x_off,
            "y_offset": y_off,
        })
        total_width += x_adv

    return glyphs, total_width, upem


def extract_text_spans(pdf_bytes: bytes, page_number: int) -> dict:
    """
    Extract structured text spans from a PDF page using PyMuPDF.
    Provides precise coordinates (bbox and origin), fonts, sizes, and colors
    for interactive on-canvas selection and in-place editing.
    """
    try:
        doc = pymupdf.open(stream=pdf_bytes, filetype="pdf")
    except Exception as exc:
        raise AppError("invalid_pdf", "Failed to parse PDF document for text inspection.", 422) from exc

    if page_number < 1 or page_number > len(doc):
        raise AppError("invalid_request", f"Page {page_number} is out of bounds (1-{len(doc)}).", 422)

    page = doc[page_number - 1]
    rect = page.rect
    d = page.get_text("dict")
    spans: list[dict] = []

    for b_idx, block in enumerate(d.get("blocks", [])):
        if block.get("type") != 0:
            continue
        for l_idx, line in enumerate(block.get("lines", [])):
            for s_idx, span in enumerate(line.get("spans", [])):
                text = span.get("text", "")
                if not text.strip():
                    continue
                font_name = span.get("font", "Helvetica")
                flags = span.get("flags", 0)
                color_int = span.get("color", 0)
                is_khmer_span = has_khmer(text) or any(k in font_name.lower() for k in ("khmer", "battambang", "moul", "muol"))
                std_font = font_to_standard(font_name, flags)
                if is_khmer_span and std_font.startswith("helv"):
                    std_font = "KhmerOSBattambang"

                spans.append({
                    "id": f"p{page_number}-b{b_idx}-l{l_idx}-s{s_idx}",
                    "bbox": [round(float(c), 2) for c in span["bbox"]],
                    "origin": [round(float(c), 2) for c in span["origin"]],
                    "text": text,
                    "font": font_name,
                    "standard_font": std_font,
                    "font_size": round(float(span.get("size", 12.0)), 1),
                    "color": int_to_hex(color_int),
                    "flags": flags,
                    "ascender": round(float(span.get("ascender", 0.8)), 3),
                    "descender": round(float(span.get("descender", -0.2)), 3),
                    "is_subset": "+" in font_name,
                    "page": page_number,
                })

    return {
        "page": page_number,
        "width": round(rect.width, 2),
        "height": round(rect.height, 2),
        "spans": spans,
        "total_spans": len(spans),
    }


def apply_native_text_edits(pdf_bytes: bytes, edits: list[dict]) -> bytes:
    """
    Apply genuine text replacements into the PDF.
    Uses Strategy B (genuine stream redaction without white masking + high-fidelity text reconstruction)
    with HarfBuzz complex-script shaping for Khmer and accurate baseline placement.
    """
    if not edits:
        return pdf_bytes

    try:
        doc = pymupdf.open(stream=pdf_bytes, filetype="pdf")
    except Exception as exc:
        raise AppError("invalid_pdf", "Failed to parse PDF document for editing.", 422) from exc

    page_edits: dict[int, list[dict]] = {}
    for e in edits:
        p = int(e.get("page", 1))
        page_edits.setdefault(p, []).append(e)

    has_complex_edits = False

    for page_num, p_edits in page_edits.items():
        if page_num < 1 or page_num > len(doc):
            continue
        page = doc[page_num - 1]

        # Step 1: Add redaction annotations to genuinely purge old text from content stream
        for e in p_edits:
            bbox = e.get("bbox")
            if bbox and len(bbox) == 4:
                # Add 0.5pt padding to ensure full anti-aliased glyph removal
                r = pymupdf.Rect(bbox[0] - 0.5, bbox[1] - 0.5, bbox[2] + 0.5, bbox[3] + 0.5)
                page.add_redact_annot(r, fill=False)

        page.apply_redactions(images=pymupdf.PDF_REDACT_IMAGE_NONE)

        # Step 2: Handle font registration and simple text insertions
        for idx, e in enumerate(p_edits):
            origin = e.get("origin")
            new_text = str(e.get("new_text", ""))
            if not origin or len(origin) != 2:
                continue
            font_size = float(e.get("font_size", 12.0))
            color_hex = str(e.get("color", "#000000"))
            rgb_color = hex_to_rgb(color_hex)
            font_name = str(e.get("font_name") or e.get("font") or "")
            flags = int(e.get("flags", 0))

            if has_khmer(new_text) or has_khmer(str(e.get("original_text", ""))):
                has_complex_edits = True
                font_path, font_family = resolve_khmer_font(font_name)
                alias = f"DoceraKhmer_{page_num}_{idx}"
                page.insert_font(fontfile=font_path, fontname=alias)
                # Write an off-page dummy space to ensure font descriptor and resources are committed by MuPDF
                page.insert_text((-100, -100), " ", fontname=alias, fontsize=font_size)
                e["_font_alias"] = alias
                e["_font_path"] = font_path
            else:
                # Standard Latin text insertion
                std_font = font_to_standard(font_name, flags)
                try:
                    page.insert_text(origin, new_text, fontsize=font_size, fontname=std_font, color=rgb_color)
                except Exception:
                    page.insert_text(origin, new_text, fontsize=font_size, fontname="helv", color=rgb_color)

    intermediate_pdf = doc.tobytes(garbage=3, deflate=True)

    if not has_complex_edits:
        return intermediate_pdf

    # Step 3: Inject HarfBuzz shaped glyph instructions into PDF content streams using pikepdf
    with pikepdf.open(io.BytesIO(intermediate_pdf)) as pdf:
        for page_num, p_edits in page_edits.items():
            if page_num < 1 or page_num > len(pdf.pages):
                continue
            pg = pdf.pages[page_num - 1]
            page_height = float(pg.MediaBox[3])

            stream_parts = []
            for e in p_edits:
                new_text = str(e.get("new_text", ""))
                origin = e.get("origin")
                if not origin or len(origin) != 2 or "_font_path" not in e:
                    continue

                font_path = e["_font_path"]
                alias = e["_font_alias"]
                font_size = float(e.get("font_size", 12.0))
                color_hex = str(e.get("color", "#000000"))
                r, g, b = hex_to_rgb(color_hex)

                layout = shape_text_layout(
                    text=new_text,
                    font_name=e.get("font_name") or e.get("font"),
                    font_size=font_size,
                )

                # Inject custom ToUnicode CMap into the page's font dictionary
                font_key = f"/{alias}"
                if "/Resources" in pg and "/Font" in pg["/Resources"] and font_key in pg["/Resources"]["/Font"]:
                    font_obj = pg["/Resources"]["/Font"][font_key]
                    font_obj["/ToUnicode"] = pdf.make_stream(layout.tounicode_cmap.encode("latin1"))

                cur_x = float(origin[0])
                cur_y = page_height - float(origin[1])

                stream_parts.append(f"q\n{r:.3f} {g:.3f} {b:.3f} rg\nBT\n/{alias} {font_size:.2f} Tf\n")
                for g_info in layout.glyphs:
                    gx = cur_x + g_info.x_offset
                    gy = cur_y + g_info.y_offset
                    stream_parts.append(f"1 0 0 1 {gx:.2f} {gy:.2f} Tm <{g_info.gid:04X}> Tj\n")
                    cur_x += g_info.x_advance
                    cur_y += g_info.y_advance
                stream_parts.append("ET\nQ\n")

            if stream_parts:
                new_stream_bytes = "".join(stream_parts).encode("latin1")
                new_stream_obj = pdf.make_stream(new_stream_bytes)
                if isinstance(pg.Contents, pikepdf.Array):
                    pg.Contents.append(new_stream_obj)
                elif pg.Contents is not None:
                    pg.Contents = pikepdf.Array([pg.Contents, new_stream_obj])
                else:
                    pg.Contents = new_stream_obj

        out = io.BytesIO()
        pdf.save(out)
        return out.getvalue()


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
