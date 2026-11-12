import csv
import io
import os
import shutil
import subprocess
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Protocol

import pdfplumber
import pikepdf
import pypdfium2 as pdfium
from reportlab.pdfgen import canvas as rl_canvas

from app.core.errors import AppError


@dataclass
class OCRWord:
    text: str
    x_pt: float
    y_top_pt: float
    width_pt: float
    height_pt: float
    confidence: float


@dataclass
class OCRPageResult:
    text: str
    words: list[OCRWord]
    average_confidence: float | None


class OCREngine(Protocol):
    id: str
    name: str

    def is_available(self) -> bool: ...
    def supported_languages(self) -> list[dict]: ...
    def recognize_image(
        self,
        image_bytes: bytes,
        img_width_px: int,
        img_height_px: int,
        page_width_pt: float,
        page_height_pt: float,
        lang: str,
    ) -> OCRPageResult: ...


class TesseractOCREngine:
    id = "tesseract"
    name = "Tesseract OCR"

    def _binary(self) -> str | None:
        return shutil.which("tesseract")

    def is_available(self) -> bool:
        return self._binary() is not None

    def supported_languages(self) -> list[dict]:
        binary = self._binary()
        if not binary:
            return []
        try:
            proc = subprocess.run([binary, "--list-langs"], capture_output=True, text=True, timeout=10, check=False)
            langs = []
            for line in proc.stdout.splitlines()[1:]:
                code = line.strip()
                if code:
                    langs.append({"code": code, "label": code.upper()})
            return langs
        except Exception:
            return []

    def recognize_image(
        self,
        image_bytes: bytes,
        img_width_px: int,
        img_height_px: int,
        page_width_pt: float,
        page_height_pt: float,
        lang: str,
    ) -> OCRPageResult:
        binary = self._binary()
        if not binary:
            raise AppError("ocr_engine_unavailable", "Tesseract OCR is not installed on this host.", 503)

        available_codes = {item["code"] for item in self.supported_languages()}
        if available_codes and lang not in available_codes:
            raise AppError("ocr_language_unavailable", f"OCR language '{lang}' is not installed in Tesseract.", 422)

        with tempfile.TemporaryDirectory() as tmpdir:
            img_path = Path(tmpdir) / "page.png"
            img_path.write_bytes(image_bytes)
            try:
                proc = subprocess.run(
                    [binary, str(img_path), "stdout", "-l", lang, "tsv"],
                    capture_output=True,
                    text=True,
                    encoding="utf-8",
                    timeout=60,
                    check=False,
                )
            except subprocess.TimeoutExpired as exc:
                raise AppError("ocr_timeout", "OCR timed out on this page.", 422) from exc

            if proc.returncode != 0:
                raise AppError("ocr_failed", "Tesseract could not process this page.", 422)

            words: list[OCRWord] = []
            confs: list[float] = []
            lines_map: dict[tuple[str, str, str, str], list[str]] = {}
            sx = page_width_pt / max(1, img_width_px)
            sy = page_height_pt / max(1, img_height_px)

            reader = csv.DictReader(io.StringIO(proc.stdout), delimiter="\t")
            for row in reader:
                txt = (row.get("text") or "").strip()
                if not txt:
                    continue
                try:
                    conf = float(row.get("conf", "-1"))
                    left = float(row.get("left", "0")) * sx
                    top = float(row.get("top", "0")) * sy
                    w = float(row.get("width", "0")) * sx
                    h = float(row.get("height", "0")) * sy
                except ValueError:
                    continue
                if conf >= 0:
                    confs.append(conf)
                words.append(OCRWord(text=txt, x_pt=left, y_top_pt=top, width_pt=w, height_pt=h, confidence=conf))
                line_key = (
                    row.get("page_num", "1"),
                    row.get("block_num", "0"),
                    row.get("par_num", "0"),
                    row.get("line_num", "0"),
                )
                lines_map.setdefault(line_key, []).append(txt)

            full_text = "\n".join(" ".join(tokens) for tokens in lines_map.values())
            avg_conf = round(sum(confs) / len(confs), 2) if confs else None
            return OCRPageResult(text=full_text, words=words, average_confidence=avg_conf)


class KhmerOCRAdapter:
    """
    Pluggable adapter seam for custom Khmer OCR models (e.g., DOCERA_KHMER_OCR_CMD or Tesseract 'khm').
    Reports actual runtime availability without fabricating multilingual support.
    """

    id = "khmer-adapter"
    name = "Khmer OCR Adapter"

    def __init__(self, tesseract: TesseractOCREngine):
        self.tesseract = tesseract

    def is_available(self) -> bool:
        custom_cmd = os.environ.get("DOCERA_KHMER_OCR_CMD", "").strip()
        if custom_cmd and shutil.which(custom_cmd):
            return True
        return any(lang["code"] == "khm" for lang in self.tesseract.supported_languages())

    def supported_languages(self) -> list[dict]:
        return [{"code": "khm", "label": "Khmer (khm)"}] if self.is_available() else []


def ocr_capabilities() -> dict:
    """Report installed OCR engines and verified supported languages."""
    tess = TesseractOCREngine()
    khmer = KhmerOCRAdapter(tess)
    engines = [
        {
            "id": tess.id,
            "name": tess.name,
            "available": tess.is_available(),
            "languages": tess.supported_languages(),
        },
        {
            "id": khmer.id,
            "name": khmer.name,
            "available": khmer.is_available(),
            "languages": khmer.supported_languages(),
            "note": "Configure Tesseract 'khm' traineddata or DOCERA_KHMER_OCR_CMD to enable Khmer OCR.",
        },
    ]
    return {
        "available": any(e["available"] for e in engines),
        "engines": engines,
    }


def detect_scanned_pages(pdf_bytes: bytes) -> dict:
    """Classify each page as having selectable text or being a scanned/image-only candidate."""
    pages_info: list[dict] = []
    with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
        for idx, page in enumerate(pdf.pages, start=1):
            text = (page.extract_text() or "").strip()
            image_count = len(page.images or [])
            needs_ocr = len(text) < 10 and image_count > 0
            pages_info.append({
                "page": idx,
                "char_count": len(text),
                "image_count": image_count,
                "needs_ocr": needs_ocr,
            })
    return {
        "page_count": len(pages_info),
        "scanned_pages": [p["page"] for p in pages_info if p["needs_ocr"]],
        "pages": pages_info,
    }


def _build_invisible_text_overlay(
    width_pt: float,
    height_pt: float,
    words: list[OCRWord],
) -> bytes:
    buf = io.BytesIO()
    c = rl_canvas.Canvas(buf, pagesize=(width_pt, height_pt))
    for w in words:
        font_size = max(6.0, min(48.0, w.height_pt or 10.0))
        y_bottom = max(0.0, height_pt - w.y_top_pt - font_size)
        txt_obj = c.beginText()
        txt_obj.setTextRenderMode(3)  # Invisible searchable text layer
        txt_obj.setFont("Helvetica", font_size)
        txt_obj.setTextOrigin(w.x_pt, y_bottom)
        txt_obj.textOut(w.text)
        c.drawText(txt_obj)
    c.showPage()
    c.save()
    return buf.getvalue()


def run_ocr_on_pdf(
    pdf_bytes: bytes,
    *,
    pages: list[int] | None = None,
    lang: str = "eng",
    dpi: int = 200,
    engine: OCREngine | None = None,
) -> dict:
    """Run OCR on selected pages and embed an invisible searchable text layer aligned to word boxes."""
    ocr_engine = engine or TesseractOCREngine()
    if not ocr_engine.is_available():
        raise AppError(
            "ocr_engine_unavailable",
            "No OCR engine binary (such as Tesseract OCR) is installed on this host. Install Tesseract to run OCR.",
            503,
        )

    pdfium_doc = pdfium.PdfDocument(pdf_bytes)
    scale = max(100, min(300, dpi)) / 72.0
    total = len(pdfium_doc)
    target_pages = pages if pages else list(range(1, total + 1))

    overlays: dict[int, bytes] = {}
    extracted_pages: list[dict] = []
    confs: list[float] = []

    try:
        for p in target_pages:
            if p < 1 or p > total:
                raise AppError("invalid_request", f"Page {p} is out of bounds (1–{total}).", 422)
            f_page = pdfium_doc[p - 1]
            width_pt, height_pt = f_page.get_size()
            pil_img = f_page.render(scale=scale).to_pil()
            img_buf = io.BytesIO()
            pil_img.save(img_buf, format="PNG")
            res = ocr_engine.recognize_image(
                img_buf.getvalue(),
                pil_img.width,
                pil_img.height,
                width_pt,
                height_pt,
                lang,
            )
            if res.average_confidence is not None:
                confs.append(res.average_confidence)
            extracted_pages.append({
                "page": p,
                "text": res.text,
                "confidence": res.average_confidence,
                "word_count": len(res.words),
            })
            if res.words:
                overlays[p] = _build_invisible_text_overlay(width_pt, height_pt, res.words)
    finally:
        pdfium_doc.close()

    with pikepdf.open(io.BytesIO(pdf_bytes)) as base_pdf:
        for p_num, ov_bytes in overlays.items():
            with pikepdf.open(io.BytesIO(ov_bytes)) as ov_pdf:
                target_page = base_pdf.pages[p_num - 1]
                mbox = [float(v) for v in target_page.mediabox]
                target_page.add_overlay(ov_pdf.pages[0], pikepdf.Rectangle(*mbox))
        out = io.BytesIO()
        base_pdf.save(out)

    combined_text = "\n\n".join(f"--- Page {item['page']} ---\n{item['text']}" for item in extracted_pages)
    return {
        "bytes": out.getvalue(),
        "engine": ocr_engine.id,
        "language": lang,
        "pages_processed": target_pages,
        "average_confidence": round(sum(confs) / len(confs), 2) if confs else None,
        "text": combined_text,
        "pages": extracted_pages,
    }
