import io
import json
import zipfile

import openpyxl
import pdfplumber
from docx import Document as DocxDocument
from PIL import Image
from pptx import Presentation
from pypdf import PdfReader
from reportlab.lib import colors
from reportlab.lib.pagesizes import LETTER
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas as rl_canvas
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle


def _session_upload(client, pdf_bytes: bytes, filename: str = "doc.pdf") -> str:
    client.post("/api/v1/session")
    res = client.post("/api/v1/files/upload", files={"file": (filename, pdf_bytes, "application/pdf")})
    assert res.status_code == 201, res.text
    return res.json()["id"]


def _make_text_pdf(lines: list[str], *, title: str = "Docera Secret Report") -> bytes:
    buf = io.BytesIO()
    c = rl_canvas.Canvas(buf, pagesize=LETTER)
    c.setTitle(title)
    c.setAuthor("Alice Auditor")
    c.setFont("Helvetica", 12)
    y = 740
    for line in lines:
        c.drawString(72, y, line)
        y -= 24
    c.showPage()
    c.save()
    return buf.getvalue()


def _make_table_pdf() -> bytes:
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=LETTER)
    tbl = Table([["Item", "Qty", "Price"], ["Paper", "10", "$5.00"], ["Ink", "2", "$24.00"]])
    tbl.setStyle(TableStyle([("GRID", (0, 0), (-1, -1), 1, colors.black)]))
    doc.build([tbl])
    return buf.getvalue()


def _make_image_heavy_pdf() -> bytes:
    # Uncompressed BMP/PNG embedded at high resolution so balanced/compact JPEG compression shrinks it
    img = Image.new("RGB", (900, 900))
    px = img.load()
    for y in range(900):
        for x in range(900):
            px[x, y] = ((x * 3) % 256, (y * 5) % 256, ((x + y) * 2) % 256)
    img_buf = io.BytesIO()
    img.save(img_buf, format="PNG")
    img_buf.seek(0)

    buf = io.BytesIO()
    c = rl_canvas.Canvas(buf, pagesize=LETTER)
    c.drawImage(ImageReader(img_buf), 72, 200, width=400, height=400)
    c.showPage()
    c.save()
    return buf.getvalue()


def test_rename_file(client):
    fid = _session_upload(client, _make_text_pdf(["Hello"]), "original.pdf")
    res = client.patch(f"/api/v1/files/{fid}", json={"filename": "renamed-report"})
    assert res.status_code == 200
    assert res.json()["filename"] == "renamed-report.pdf"


def test_compression_reduces_image_pdf_and_reports_honestly_on_tiny_pdf(client):
    client.post("/api/v1/session")

    heavy = _make_image_heavy_pdf()
    res = client.post(
        "/api/v1/tools/compress",
        data={"preset": "compact"},
        files={"file": ("heavy.pdf", heavy, "application/pdf")},
    )
    assert res.status_code == 200, res.text
    report = json.loads(res.headers["x-docera-report"])
    assert report["was_reduced"] is True
    assert report["compressed_bytes"] < report["original_bytes"]
    assert len(PdfReader(io.BytesIO(res.content)).pages) == 1

    tiny = _make_text_pdf(["Tiny"])
    res_tiny = client.post(
        "/api/v1/tools/compress",
        data={"preset": "lossless"},
        files={"file": ("tiny.pdf", tiny, "application/pdf")},
    )
    assert res_tiny.status_code == 200
    tiny_report = json.loads(res_tiny.headers["x-docera-report"])
    assert tiny_report["compressed_bytes"] <= tiny_report["original_bytes"]


def test_conversions_roundtrip(client):
    client.post("/api/v1/session")
    text_pdf = _make_text_pdf(["Quarterly Financial Summary", "Revenue grew 18 percent."])
    table_pdf = _make_table_pdf()

    # PDF -> PNG (single page returns PNG directly)
    img_res = client.post(
        "/api/v1/tools/convert/pdf-to-images",
        data={"fmt": "png", "dpi": "100"},
        files={"file": ("summary.pdf", text_pdf, "application/pdf")},
    )
    assert img_res.status_code == 200
    assert img_res.content[:8] == b"\x89PNG\r\n\x1a\n"
    with Image.open(io.BytesIO(img_res.content)) as im:
        assert im.width > 100 and im.height > 100

    # Images -> PDF
    png_buf = io.BytesIO()
    Image.new("RGB", (200, 150), (35, 102, 90)).save(png_buf, format="PNG")
    i2p = client.post(
        "/api/v1/tools/convert/images-to-pdf",
        data={"page_size": "a4"},
        files=[("files", ("chart.png", png_buf.getvalue(), "image/png"))],
    )
    assert i2p.status_code == 200
    assert len(PdfReader(io.BytesIO(i2p.content)).pages) == 1

    # PDF -> TXT & HTML
    txt_res = client.post(
        "/api/v1/tools/convert/pdf-to-document",
        data={"target": "txt"},
        files={"file": ("summary.pdf", text_pdf, "application/pdf")},
    )
    assert txt_res.status_code == 200
    assert "Quarterly Financial Summary" in txt_res.text

    html_res = client.post(
        "/api/v1/tools/convert/pdf-to-document",
        data={"target": "html"},
        files={"file": ("summary.pdf", text_pdf, "application/pdf")},
    )
    assert html_res.status_code == 200
    assert "<h2>Page 1</h2>" in html_res.text

    # PDF -> DOCX
    docx_res = client.post(
        "/api/v1/tools/convert/pdf-to-document",
        data={"target": "docx", "mode": "structured"},
        files={"file": ("summary.pdf", text_pdf, "application/pdf")},
    )
    assert docx_res.status_code == 200
    docx_obj = DocxDocument(io.BytesIO(docx_res.content))
    assert any("Quarterly Financial Summary" in p.text for p in docx_obj.paragraphs)

    # PDF -> XLSX
    xlsx_res = client.post(
        "/api/v1/tools/convert/pdf-to-document",
        data={"target": "xlsx"},
        files={"file": ("table.pdf", table_pdf, "application/pdf")},
    )
    assert xlsx_res.status_code == 200
    wb = openpyxl.load_workbook(io.BytesIO(xlsx_res.content))
    ws = wb.active
    assert ws.cell(1, 1).value == "Item"
    assert ws.cell(2, 1).value == "Paper"

    # PDF -> PPTX
    pptx_res = client.post(
        "/api/v1/tools/convert/pdf-to-document",
        data={"target": "pptx", "mode": "editable_text"},
        files={"file": ("summary.pdf", text_pdf, "application/pdf")},
    )
    assert pptx_res.status_code == 200
    prs = Presentation(io.BytesIO(pptx_res.content))
    assert len(prs.slides) == 1

    # DOCX -> PDF
    office_pdf = client.post(
        "/api/v1/tools/convert/office-to-pdf",
        files={"file": ("summary.docx", docx_res.content, "application/vnd.openxmlformats-officedocument.wordprocessingml.document")},
    )
    assert office_pdf.status_code == 200
    with pdfplumber.open(io.BytesIO(office_pdf.content)) as p_check:
        assert "Quarterly Financial Summary" in (p_check.pages[0].extract_text() or "")

    # HTML -> PDF (scripts stripped)
    h2p = client.post(
        "/api/v1/tools/convert/html-to-pdf",
        data={"html_content": "<h1>Project Brief</h1><script>alert(1)</script><p>Offline safe conversion.</p>"},
    )
    assert h2p.status_code == 200
    with pdfplumber.open(io.BytesIO(h2p.content)) as p_check:
        txt = p_check.pages[0].extract_text() or ""
        assert "Project Brief" in txt
        assert "alert(1)" not in txt


def test_native_content_stream_edit_replaces_underlying_text(client):
    client.post("/api/v1/session")
    pdf_bytes = _make_text_pdf(["ORIGINAL_TOKEN_123"])

    insp = client.post(
        "/api/v1/tools/native/inspect",
        data={"page": "1"},
        files={"file": ("native.pdf", pdf_bytes, "application/pdf")},
    )
    assert insp.status_code == 200
    runs = insp.json()["text_runs"]
    target = next(r for r in runs if "ORIGINAL_TOKEN_123" in r["text"])
    assert target["editable"] is True

    rep = client.post(
        "/api/v1/tools/native/replace-text",
        data={"page": "1", "op_index": str(target["op_index"]), "new_text": "UPDATED_TOKEN_999"},
        files={"file": ("native.pdf", pdf_bytes, "application/pdf")},
    )
    assert rep.status_code == 200
    with pdfplumber.open(io.BytesIO(rep.content)) as check:
        extracted = check.pages[0].extract_text() or ""
        assert "UPDATED_TOKEN_999" in extracted
        assert "ORIGINAL_TOKEN_123" not in extracted


def test_forms_create_fill_flatten_and_cryptographic_signature(client):
    client.post("/api/v1/session")
    base = _make_text_pdf(["Application Form"])

    created = client.post(
        "/api/v1/tools/forms/create",
        data={"fields_json": json.dumps([
            {"page": 1, "name": "applicant_name", "type": "text", "x": 72, "y": 140, "width": 200, "height": 24},
            {"page": 1, "name": "agree_terms", "type": "checkbox", "x": 72, "y": 180, "width": 18, "height": 18},
        ])},
        files={"file": ("form.pdf", base, "application/pdf")},
    )
    assert created.status_code == 200

    insp = client.post(
        "/api/v1/tools/forms/inspect",
        files={"file": ("form.pdf", created.content, "application/pdf")},
    )
    assert insp.status_code == 200
    names = {f["name"] for f in insp.json()["fields"]}
    assert {"applicant_name", "agree_terms"} <= names

    filled = client.post(
        "/api/v1/tools/forms/fill",
        data={"values_json": json.dumps({"applicant_name": "Sokha Chan", "agree_terms": True}), "flatten": "false"},
        files={"file": ("form.pdf", created.content, "application/pdf")},
    )
    assert filled.status_code == 200
    fields_after = PdfReader(io.BytesIO(filled.content)).get_fields()
    assert str(fields_after["applicant_name"]["/V"]) == "Sokha Chan"

    flattened = client.post(
        "/api/v1/tools/forms/fill",
        data={"values_json": json.dumps({"applicant_name": "Sokha Chan", "agree_terms": True}), "flatten": "true"},
        files={"file": ("form.pdf", created.content, "application/pdf")},
    )
    assert flattened.status_code == 200
    assert not PdfReader(io.BytesIO(flattened.content)).get_fields()

    # Cryptographic signing + independent verification
    signed = client.post(
        "/api/v1/tools/sign/cryptographic",
        data={"signer_name": "Sokha Chan", "reason": "Approved"},
        files={"file": ("contract.pdf", base, "application/pdf")},
    )
    assert signed.status_code == 200
    sign_report = json.loads(signed.headers["x-docera-report"])
    assert sign_report["self_signed"] is True

    verified = client.post(
        "/api/v1/tools/sign/verify",
        files={"file": ("signed.pdf", signed.content, "application/pdf")},
    )
    assert verified.status_code == 200
    v_data = verified.json()
    assert v_data["signature_count"] == 1
    assert v_data["signatures"][0]["intact"] is True
    assert v_data["signatures"][0]["valid"] is True


def test_security_encrypt_unlock_metadata_and_content_removing_redaction(client):
    client.post("/api/v1/session")
    sensitive_pdf = _make_text_pdf(["Public Header", "CONFIDENTIAL_SSN_999_88_7777"], title="Private File")

    # Metadata inspect & clean
    meta = client.post(
        "/api/v1/tools/security/inspect-metadata",
        files={"file": ("meta.pdf", sensitive_pdf, "application/pdf")},
    )
    assert meta.status_code == 200
    assert meta.json()["docinfo"]["Title"] == "Private File"

    cleaned = client.post(
        "/api/v1/tools/security/clean",
        data={"remove_all_metadata": "true", "sanitize_active": "true"},
        files={"file": ("meta.pdf", sensitive_pdf, "application/pdf")},
    )
    assert cleaned.status_code == 200
    assert not PdfReader(io.BytesIO(cleaned.content)).metadata

    # Encrypt & authorized unlock
    enc = client.post(
        "/api/v1/tools/security/encrypt",
        data={"user_password": "open-sesame", "allow_print": "true", "allow_copy": "false"},
        files={"file": ("secret.pdf", sensitive_pdf, "application/pdf")},
    )
    assert enc.status_code == 200
    assert PdfReader(io.BytesIO(enc.content)).is_encrypted

    bad_unlock = client.post(
        "/api/v1/tools/security/unlock",
        data={"password": "wrong-password"},
        files={"file": ("secret.pdf", enc.content, "application/pdf")},
    )
    assert bad_unlock.status_code == 422
    assert bad_unlock.json()["error"]["code"] == "invalid_password"

    good_unlock = client.post(
        "/api/v1/tools/security/unlock",
        data={"password": "open-sesame"},
        files={"file": ("secret.pdf", enc.content, "application/pdf")},
    )
    assert good_unlock.status_code == 200
    assert not PdfReader(io.BytesIO(good_unlock.content)).is_encrypted

    # True content-removing redaction over line 2 ("CONFIDENTIAL_SSN_999_88_7777")
    # Line 2 is drawn at y=716 from bottom on LETTER (792pt high) -> top ~60-90pt
    redacted = client.post(
        "/api/v1/tools/security/redact",
        data={"boxes_json": json.dumps([{"page": 1, "x": 60, "y": 55, "width": 320, "height": 40}])},
        files={"file": ("secret.pdf", sensitive_pdf, "application/pdf")},
    )
    assert redacted.status_code == 200, redacted.text
    red_report = json.loads(redacted.headers["x-docera-report"])
    assert red_report["verified_removed"] is True
    assert red_report["remaining_chars_in_boxes"] == 0
    with pdfplumber.open(io.BytesIO(redacted.content)) as check:
        full_text = check.pages[0].extract_text() or ""
        assert "CONFIDENTIAL_SSN_999_88_7777" not in full_text


def test_ocr_capabilities_and_scan_detection(client):
    client.post("/api/v1/session")
    caps = client.get("/api/v1/tools/ocr/capabilities")
    assert caps.status_code == 200
    assert "engines" in caps.json()

    scan_pdf = _make_image_heavy_pdf()
    det = client.post(
        "/api/v1/tools/ocr/detect-scans",
        files={"file": ("scan.pdf", scan_pdf, "application/pdf")},
    )
    assert det.status_code == 200
    assert det.json()["scanned_pages"] == [1]

    # Test searchable PDF generation via pluggable OCREngine interface
    from app.services.pdf.ocr import OCRPageResult, OCRWord, run_ocr_on_pdf

    class FakeOCREngine:
        id = "fake-test"
        name = "Fake Test OCR"
        def is_available(self) -> bool: return True
        def supported_languages(self): return [{"code": "eng", "label": "English"}]
        def recognize_image(self, image_bytes, img_w, img_h, page_w, page_h, lang):
            return OCRPageResult(
                text="DOCERA_OCR_VERIFIED",
                words=[OCRWord(text="DOCERA_OCR_VERIFIED", x_pt=72, y_top_pt=100, width_pt=140, height_pt=14, confidence=96.5)],
                average_confidence=96.5,
            )

    ocr_out = run_ocr_on_pdf(scan_pdf, lang="eng", engine=FakeOCREngine())
    assert ocr_out["average_confidence"] == 96.5
    with pdfplumber.open(io.BytesIO(ocr_out["bytes"])) as check:
        assert "DOCERA_OCR_VERIFIED" in (check.pages[0].extract_text() or "")


def test_batch_processing_with_partial_failure_reporting(client):
    client.post("/api/v1/session")
    valid_pdf = _make_text_pdf(["Batch Item 1"])
    res = client.post(
        "/api/v1/tools/batch",
        data={"operation": "rotate_90"},
        files=[
            ("files", ("good.pdf", valid_pdf, "application/pdf")),
            ("files", ("bad.pdf", b"not-a-pdf", "application/pdf")),
        ],
    )
    assert res.status_code == 200
    report = json.loads(res.headers["x-docera-report"])
    assert report["succeeded"] == 1
    assert report["failed"] == 1

    with zipfile.ZipFile(io.BytesIO(res.content)) as zf:
        names = zf.namelist()
        assert "01_good-rotated.pdf" in names
        assert "batch_report.json" in names
        rotated_bytes = zf.read("01_good-rotated.pdf")
        assert PdfReader(io.BytesIO(rotated_bytes)).pages[0].get("/Rotate") == 90
