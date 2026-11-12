import html
import io
import os
import shutil
import subprocess
import tempfile
from html.parser import HTMLParser
from pathlib import Path
from typing import Literal

import openpyxl
import pdfplumber
import pypdfium2 as pdfium
from docx import Document as DocxDocument
from docx.shared import Inches
from PIL import Image, ImageOps
from pptx import Presentation
from pptx.util import Inches as PptxInches
from reportlab.lib.pagesizes import A4, LETTER
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas as rl_canvas
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
from reportlab.lib import colors

from app.core.errors import AppError

Image.MAX_IMAGE_PIXELS = 40_000_000


def pdf_to_images(
    pdf_bytes: bytes,
    *,
    fmt: Literal["png", "jpeg"] = "png",
    dpi: int = 150,
    pages: list[int] | None = None,
    quality: int = 88,
) -> list[dict]:
    """Rasterize PDF pages into verified PNG or JPEG images using PDFium."""
    dpi = max(72, min(300, dpi))
    scale = dpi / 72.0
    doc = pdfium.PdfDocument(pdf_bytes)
    results: list[dict] = []
    try:
        total = len(doc)
        target_pages = pages if pages else list(range(1, total + 1))
        for p in target_pages:
            if p < 1 or p > total:
                raise AppError("invalid_request", f"Page {p} is out of bounds (1–{total}).", 422)
            page = doc[p - 1]
            bitmap = page.render(scale=scale)
            pil_img = bitmap.to_pil()
            buf = io.BytesIO()
            ext = "jpg" if fmt == "jpeg" else "png"
            if fmt == "jpeg":
                pil_img = pil_img.convert("RGB")
                pil_img.save(buf, format="JPEG", quality=max(40, min(95, quality)), optimize=True)
            else:
                pil_img.save(buf, format="PNG", optimize=True)
            results.append({
                "page": p,
                "filename": f"page-{p}.{ext}",
                "width": pil_img.width,
                "height": pil_img.height,
                "bytes": buf.getvalue(),
            })
        return results
    finally:
        doc.close()


def images_to_pdf(
    images: list[tuple[str, bytes]],
    *,
    page_size: Literal["auto", "a4", "letter"] = "auto",
    margin_pt: float = 24.0,
) -> bytes:
    """Convert uploaded PNG/JPEG/WebP images into a single valid PDF."""
    if not images:
        raise AppError("invalid_request", "Select at least one image to convert.", 422)
    margin = max(0.0, min(72.0, margin_pt))
    out = io.BytesIO()
    c: rl_canvas.Canvas | None = None

    for name, raw in images:
        try:
            with Image.open(io.BytesIO(raw)) as img:
                img = ImageOps.exif_transpose(img)
                if img.mode in ("RGBA", "LA", "P"):
                    bg = Image.new("RGB", img.size, (255, 255, 255))
                    rgba = img.convert("RGBA")
                    bg.paste(rgba, mask=rgba.split()[3])
                    img = bg
                elif img.mode != "RGB":
                    img = img.convert("RGB")
                iw, ih = img.size
                img_buf = io.BytesIO()
                img.save(img_buf, format="JPEG", quality=92)
                img_buf.seek(0)
        except Exception as exc:
            raise AppError("invalid_image", f"Could not decode image '{name}'.", 422) from exc

        if page_size == "a4":
            pw, ph = A4
        elif page_size == "letter":
            pw, ph = LETTER
        else:
            pw, ph = float(iw) * 0.75 + 2 * margin, float(ih) * 0.75 + 2 * margin
            pw = max(144.0, min(14400.0, pw))
            ph = max(144.0, min(14400.0, ph))

        if c is None:
            c = rl_canvas.Canvas(out, pagesize=(pw, ph))
        else:
            c.setPageSize((pw, ph))

        avail_w = max(36.0, pw - 2 * margin)
        avail_h = max(36.0, ph - 2 * margin)
        ratio = min(avail_w / iw, avail_h / ih)
        draw_w, draw_h = iw * ratio, ih * ratio
        x = (pw - draw_w) / 2.0
        y = (ph - draw_h) / 2.0
        c.drawImage(ImageReader(img_buf), x, y, width=draw_w, height=draw_h)
        c.showPage()

    assert c is not None
    c.save()
    return out.getvalue()


def pdf_to_text(pdf_bytes: bytes) -> dict:
    """Extract UTF-8 text per page using pdfplumber."""
    pages_text: list[dict] = []
    with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
        for idx, page in enumerate(pdf.pages, start=1):
            txt = page.extract_text() or ""
            pages_text.append({"page": idx, "text": txt})
    combined = "\n\n".join(f"--- Page {p['page']} ---\n{p['text']}" for p in pages_text)
    return {
        "text": combined,
        "pages": pages_text,
        "total_chars": sum(len(p["text"]) for p in pages_text),
    }


def pdf_to_html(pdf_bytes: bytes) -> str:
    """Convert extracted PDF text and tables into clean, escaped semantic HTML."""
    sections: list[str] = []
    with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
        for idx, page in enumerate(pdf.pages, start=1):
            parts = [f'<section data-page="{idx}"><h2>Page {idx}</h2>']
            text = (page.extract_text() or "").strip()
            for para in text.splitlines():
                line = para.strip()
                if line:
                    parts.append(f"<p>{html.escape(line)}</p>")
            tables = page.extract_tables() or []
            for table in tables:
                parts.append('<table border="1" cellspacing="0" cellpadding="4">')
                for row in table:
                    cells = "".join(f"<td>{html.escape((cell or '').strip())}</td>" for cell in row)
                    parts.append(f"<tr>{cells}</tr>")
                parts.append("</table>")
            if not text and not tables:
                parts.append("<p><em>No selectable text on this page (scanned or image-only).</em></p>")
            parts.append("</section>")
            sections.append("\n".join(parts))

    return (
        "<!doctype html>\n<html lang=\"en\">\n<head><meta charset=\"utf-8\">"
        "<title>Docera Export</title></head>\n<body>\n"
        + "\n".join(sections)
        + "\n</body>\n</html>\n"
    )


def pdf_to_docx(pdf_bytes: bytes, *, mode: Literal["structured", "page_images"] = "structured") -> dict:
    """Convert a PDF to a genuine OOXML .docx document."""
    doc = DocxDocument()
    extracted_chars = 0

    if mode == "page_images":
        imgs = pdf_to_images(pdf_bytes, fmt="png", dpi=150)
        for idx, item in enumerate(imgs):
            if idx > 0:
                doc.add_page_break()
            doc.add_picture(io.BytesIO(item["bytes"]), width=Inches(6.5))
        buf = io.BytesIO()
        doc.save(buf)
        return {
            "bytes": buf.getvalue(),
            "mode": mode,
            "limitations": "Page-image mode preserves exact visual layout as embedded images; text is not directly editable in Word.",
        }

    with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
        for idx, page in enumerate(pdf.pages, start=1):
            if idx > 1:
                doc.add_page_break()
            text = (page.extract_text() or "").strip()
            extracted_chars += len(text)
            if text:
                for line in text.splitlines():
                    if line.strip():
                        doc.add_paragraph(line.strip())
            else:
                doc.add_paragraph(f"[Page {idx}: no selectable text found; scanned content may require OCR.]")
            for table in page.extract_tables() or []:
                if not table:
                    continue
                cols = max(len(r) for r in table)
                if cols == 0:
                    continue
                tbl = doc.add_table(rows=len(table), cols=cols)
                tbl.style = "Table Grid"
                for r_i, row in enumerate(table):
                    for c_i, val in enumerate(row):
                        tbl.cell(r_i, c_i).text = (val or "").strip()

    buf = io.BytesIO()
    doc.save(buf)
    return {
        "bytes": buf.getvalue(),
        "mode": mode,
        "extracted_chars": extracted_chars,
        "limitations": "Structured text extraction prioritizes editable paragraphs and tables; multi-column positioning, custom fonts, and vector graphics are simplified.",
    }


def pdf_to_xlsx(pdf_bytes: bytes) -> dict:
    """Extract detected tables from PDF pages into a genuine .xlsx workbook."""
    wb = openpyxl.Workbook()
    # Remove default empty sheet only after adding sheets
    default_ws = wb.active
    table_count = 0

    with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
        for p_idx, page in enumerate(pdf.pages, start=1):
            tables = page.extract_tables() or []
            for t_idx, table in enumerate(tables, start=1):
                if not table:
                    continue
                table_count += 1
                ws = wb.create_sheet(title=f"P{p_idx}_T{t_idx}"[:31])
                for row in table:
                    ws.append([(cell or "").strip() for cell in row])

    if table_count == 0:
        raise AppError(
            "no_tables_found",
            "No structured tables were detected in this PDF. Try converting to Word or Text instead.",
            422,
        )

    if default_ws is not None:
        wb.remove(default_ws)
    buf = io.BytesIO()
    wb.save(buf)
    return {
        "bytes": buf.getvalue(),
        "table_count": table_count,
        "limitations": "Only bordered or grid-aligned tables are extracted into spreadsheet cells.",
    }


def pdf_to_pptx(pdf_bytes: bytes, *, mode: Literal["slide_images", "editable_text"] = "slide_images") -> dict:
    """Convert PDF pages to a genuine PowerPoint .pptx presentation."""
    prs = Presentation()
    blank_layout = prs.slide_layouts[6]

    if mode == "slide_images":
        imgs = pdf_to_images(pdf_bytes, fmt="png", dpi=150)
        if imgs:
            aspect = imgs[0]["width"] / max(1, imgs[0]["height"])
            prs.slide_height = PptxInches(7.5)
            prs.slide_width = PptxInches(min(20.0, max(4.0, 7.5 * aspect)))
        for item in imgs:
            slide = prs.slides.add_slide(blank_layout)
            slide.shapes.add_picture(
                io.BytesIO(item["bytes"]),
                PptxInches(0),
                PptxInches(0),
                width=prs.slide_width,
                height=prs.slide_height,
            )
        buf = io.BytesIO()
        prs.save(buf)
        return {
            "bytes": buf.getvalue(),
            "mode": mode,
            "slide_count": len(imgs),
            "limitations": "Slide-image mode preserves exact visual layout as slide images.",
        }

    with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
        for idx, page in enumerate(pdf.pages, start=1):
            slide = prs.slides.add_slide(blank_layout)
            box = slide.shapes.add_textbox(PptxInches(0.6), PptxInches(0.6), PptxInches(8.8), PptxInches(6.2))
            tf = box.text_frame
            tf.word_wrap = True
            text = (page.extract_text() or "").strip() or f"[Page {idx}: no selectable text]"
            lines = text.splitlines()
            tf.text = lines[0]
            for line in lines[1:]:
                p = tf.add_paragraph()
                p.text = line
        slide_count = len(pdf.pages)

    buf = io.BytesIO()
    prs.save(buf)
    return {
        "bytes": buf.getvalue(),
        "mode": mode,
        "slide_count": slide_count,
        "limitations": "Editable-text mode extracts plain text boxes per page; original slide graphics and exact styling are omitted.",
    }


class _SafeHtmlExtractor(HTMLParser):
    """Sanitized HTML-to-blocks parser that drops scripts, styles, and external resources."""

    def __init__(self):
        super().__init__()
        self.blocks: list[tuple[str, str]] = []
        self._buf: list[str] = []
        self._skip_depth = 0
        self._tag = "p"

    def handle_starttag(self, tag: str, attrs):
        tag = tag.lower()
        if tag in {"script", "style", "iframe", "object", "embed", "svg"}:
            self._skip_depth += 1
            return
        if tag in {"h1", "h2", "h3", "h4", "p", "li", "blockquote", "pre"}:
            self._flush()
            self._tag = tag
        elif tag == "br":
            self._buf.append("\n")

    def handle_endtag(self, tag: str):
        tag = tag.lower()
        if tag in {"script", "style", "iframe", "object", "embed", "svg"}:
            self._skip_depth = max(0, self._skip_depth - 1)
            return
        if tag in {"h1", "h2", "h3", "h4", "p", "li", "blockquote", "pre", "div", "section"}:
            self._flush()
            self._tag = "p"

    def handle_data(self, data: str):
        if self._skip_depth == 0:
            self._buf.append(data)

    def _flush(self):
        txt = " ".join("".join(self._buf).split()).strip()
        if txt:
            self.blocks.append((self._tag, txt))
        self._buf.clear()


def html_to_pdf(raw_html: str) -> bytes:
    """Convert constrained HTML text into PDF offline without fetching external URLs or running scripts."""
    if not raw_html.strip():
        raise AppError("invalid_request", "HTML content is empty.", 422)
    parser = _SafeHtmlExtractor()
    parser.feed(raw_html)
    parser.close()
    parser._flush()

    styles = getSampleStyleSheet()
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=48, rightMargin=48, topMargin=48, bottomMargin=48)
    story = []
    for tag, txt in parser.blocks or [("p", "Empty HTML document")]:
        safe = html.escape(txt)
        if tag == "h1":
            story.append(Paragraph(safe, styles["Heading1"]))
        elif tag in ("h2", "h3", "h4"):
            story.append(Paragraph(safe, styles["Heading2"]))
        elif tag == "li":
            story.append(Paragraph(f"• {safe}", styles["BodyText"]))
        else:
            story.append(Paragraph(safe, styles["BodyText"]))
        story.append(Spacer(1, 6))
    doc.build(story)
    return buf.getvalue()


def _find_libreoffice() -> str | None:
    for candidate in ("soffice", "libreoffice"):
        found = shutil.which(candidate)
        if found:
            return found
    return None


def office_to_pdf(file_bytes: bytes, ext: Literal["docx", "xlsx", "pptx"], filename: str) -> dict:
    """
    Convert Office documents (.docx, .xlsx, .pptx) to PDF.
    Uses isolated LibreOffice headless worker when installed; otherwise falls back to
    a pure-Python structural converter with explicit fidelity disclosures.
    """
    soffice = _find_libreoffice()
    if soffice:
        with tempfile.TemporaryDirectory() as tmpdir:
            tmp_path = Path(tmpdir)
            in_path = tmp_path / f"input.{ext}"
            in_path.write_bytes(file_bytes)
            profile_dir = tmp_path / "lo_profile"
            profile_dir.mkdir()
            cmd = [
                soffice,
                "--headless",
                "--norestore",
                "--invisible",
                "--nodefault",
                "--nolockcheck",
                f"-env:UserInstallation=file://{profile_dir.as_posix()}",
                "--convert-to",
                "pdf",
                "--outdir",
                str(tmp_path),
                str(in_path),
            ]
            try:
                proc = subprocess.run(cmd, capture_output=True, timeout=60, check=False)
                out_pdf = tmp_path / "input.pdf"
                if proc.returncode == 0 and out_pdf.is_file():
                    return {
                        "bytes": out_pdf.read_bytes(),
                        "engine": "libreoffice-headless",
                        "limitations": None,
                    }
            except subprocess.TimeoutExpired as exc:
                raise AppError("conversion_timeout", "Office conversion timed out.", 422) from exc

    # Pure-Python structural fallback (when LibreOffice is not installed on host)
    styles = getSampleStyleSheet()
    cell_style = ParagraphStyle("Cell", parent=styles["BodyText"], fontSize=9, leading=11)
    out = io.BytesIO()
    doc = SimpleDocTemplate(out, pagesize=A4, leftMargin=40, rightMargin=40, topMargin=40, bottomMargin=40)
    story = []

    try:
        if ext == "docx":
            d = DocxDocument(io.BytesIO(file_bytes))
            for para in d.paragraphs:
                txt = para.text.strip()
                if not txt:
                    continue
                style_name = (para.style.name or "").lower() if para.style else ""
                st = styles["Heading1"] if "heading 1" in style_name else styles["Heading2"] if "heading" in style_name else styles["BodyText"]
                story.append(Paragraph(html.escape(txt), st))
                story.append(Spacer(1, 5))
            for tbl in d.tables:
                rows = [[Paragraph(html.escape(c.text.strip()), cell_style) for c in row.cells] for row in tbl.rows]
                if rows:
                    t = Table(rows, repeatRows=1)
                    t.setStyle(TableStyle([("GRID", (0, 0), (-1, -1), 0.5, colors.grey), ("VALIGN", (0, 0), (-1, -1), "TOP")]))
                    story.append(t)
                    story.append(Spacer(1, 10))
        elif ext == "xlsx":
            wb = openpyxl.load_workbook(io.BytesIO(file_bytes), data_only=True, read_only=True)
            for sheet_name in wb.sheetnames:
                ws = wb[sheet_name]
                story.append(Paragraph(html.escape(f"Sheet: {sheet_name}"), styles["Heading2"]))
                rows = []
                for r_idx, row in enumerate(ws.iter_rows(values_only=True)):
                    if r_idx >= 250:
                        break
                    rows.append([Paragraph(html.escape("" if v is None else str(v)), cell_style) for v in row[:12]])
                if rows:
                    t = Table(rows)
                    t.setStyle(TableStyle([("GRID", (0, 0), (-1, -1), 0.5, colors.lightgrey)]))
                    story.append(t)
                    story.append(Spacer(1, 12))
            wb.close()
        elif ext == "pptx":
            prs = Presentation(io.BytesIO(file_bytes))
            for s_idx, slide in enumerate(prs.slides, start=1):
                story.append(Paragraph(f"Slide {s_idx}", styles["Heading2"]))
                for shape in slide.shapes:
                    if shape.has_text_frame:
                        for para in shape.text_frame.paragraphs:
                            if para.text.strip():
                                story.append(Paragraph(html.escape(para.text.strip()), styles["BodyText"]))
                                story.append(Spacer(1, 4))
                story.append(Spacer(1, 12))
    except Exception as exc:
        raise AppError("invalid_office_file", f"Could not parse '{filename}' as a valid .{ext} document.", 422) from exc

    if not story:
        story.append(Paragraph(f"Document: {html.escape(filename)} (no extractable text or table cells)", styles["BodyText"]))
    doc.build(story)
    return {
        "bytes": out.getvalue(),
        "engine": "python-structural-fallback",
        "limitations": (
            "LibreOffice is not installed on this server, so Docera used structural text/table conversion. "
            "Exact Office styling, custom fonts, charts, and floating shapes are simplified."
        ),
    }
