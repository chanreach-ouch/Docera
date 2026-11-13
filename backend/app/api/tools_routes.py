import io
import json
import re
import urllib.parse
import zipfile
from typing import Annotated, Literal
from uuid import UUID

import pypdf
from fastapi import APIRouter, Depends, File, Form, Request, Response, UploadFile

from app.core.errors import AppError
from app.core.session import require_owner
from app.services.files import safe_filename
from app.services.pdf.compression import CompressionPreset, compress_pdf
from app.services.pdf.conversion import (
    html_to_pdf,
    images_to_pdf,
    office_to_pdf,
    pdf_to_docx,
    pdf_to_html,
    pdf_to_images,
    pdf_to_pptx,
    pdf_to_text,
    pdf_to_xlsx,
)
from app.services.pdf.forms_sign import (
    create_form_fields,
    fill_forms,
    inspect_forms,
    sign_pdf_cryptographic,
    verify_pdf_signatures,
)
from app.services.pdf.native_edit import (
    apply_native_text_edits,
    delete_native_image,
    extract_text_spans,
    inspect_native_content,
    replace_native_text,
)
from app.services.pdf.ocr import detect_scanned_pages, ocr_capabilities, run_ocr_on_pdf
from app.services.pdf.security import (
    clean_metadata_and_sanitize,
    encrypt_pdf,
    inspect_metadata,
    redact_pdf,
    unlock_pdf,
)

tools_router = APIRouter(prefix="/api/v1/tools")
Owner = Annotated[str, Depends(require_owner)]


def _read_source_pdf(
    request: Request,
    owner: str,
    file: UploadFile | None,
    file_id: str | None,
    *,
    allow_encrypted: bool = False,
) -> tuple[bytes, str]:
    """Load PDF bytes either from an uploaded file or an owned workspace document."""
    if file is not None:
        try:
            raw = file.file.read(request.app.state.settings.max_upload_bytes + 1)
            if len(raw) > request.app.state.settings.max_upload_bytes:
                raise AppError("file_too_large", "This file exceeds the upload size limit.", 413)
            if not raw:
                raise AppError("empty_file", "The selected file is empty.", 422)
            name = safe_filename(file.filename)
        finally:
            file.file.close()
    elif file_id:
        try:
            uid = str(UUID(file_id))
        except ValueError as exc:
            raise AppError("invalid_request", "Invalid workspace document identifier.", 422) from exc
        doc = request.app.state.files.get(uid, owner)
        raw = request.app.state.storage.source(uid).read_bytes()
        name = doc["filename"]
    else:
        raise AppError("invalid_request", "Provide a PDF file or workspace file_id.", 422)

    if not raw[:8].startswith(b"%PDF-"):
        raise AppError("invalid_pdf", "This file does not have a valid PDF header.", 422)
    if not allow_encrypted:
        try:
            reader = pypdf.PdfReader(io.BytesIO(raw), strict=False)
            if reader.is_encrypted:
                raise AppError("encrypted_pdf", "Unlock this password-protected PDF before running this tool.", 422)
        except AppError:
            raise
        except Exception as exc:
            raise AppError("invalid_pdf", "Could not parse the provided PDF.", 422) from exc
    return raw, name


def _build_content_disposition(filename: str) -> str:
    """Build an RFC 5987 / RFC 6266 compliant Content-Disposition header supporting Unicode filenames."""
    clean_name = re.sub(r"[\r\n\t]+", " ", filename).strip()
    if not clean_name:
        clean_name = "document.pdf"

    # ASCII-safe fallback for older clients or strict ASCII headers
    ascii_clean = re.sub(r"[^\x20-\x7E]", "", clean_name).replace('"', "").replace("\\", "").replace(";", "").strip()
    if not ascii_clean:
        ascii_clean = "document-edited.pdf" if clean_name.lower().endswith(".pdf") else "document"
    elif clean_name.lower().endswith(".pdf") and not ascii_clean.lower().endswith(".pdf"):
        ascii_clean = f"{ascii_clean}.pdf"

    # RFC 5987 UTF-8 percent-encoded filename for full Unicode (e.g. Khmer, CJK, accents)
    encoded = urllib.parse.quote(clean_name, safe="")
    return f'attachment; filename="{ascii_clean}"; filename*=UTF-8\'\'{encoded}'


def _binary_response(
    data: bytes,
    filename: str,
    media_type: str,
    report: dict | None = None,
) -> Response:
    headers = {
        "Content-Disposition": _build_content_disposition(filename),
        "Content-Security-Policy": "sandbox; default-src 'none'",
    }
    if report is not None:
        report_copy = dict(report)
        # Avoid dumping heavy raw data structures into HTTP headers (e.g. per-page OCR arrays)
        report_copy.pop("pages", None)
        # Cap text preview in header to prevent exceeding HTTP standard header boundaries
        if "text" in report_copy and isinstance(report_copy["text"], str) and len(report_copy["text"]) > 4000:
            report_copy["text"] = report_copy["text"][:4000] + "\n\n[... Text truncated for preview in report header; full searchable text is embedded in the PDF.]"
        headers["X-Docera-Report"] = json.dumps(report_copy, ensure_ascii=True)
        headers["Access-Control-Expose-Headers"] = "X-Docera-Report, Content-Disposition"
    return Response(content=data, media_type=media_type, headers=headers)


def _stem(filename: str) -> str:
    return filename[:-4] if filename.lower().endswith(".pdf") else filename


@tools_router.post("/compress")
def tool_compress(
    request: Request,
    owner: Owner,
    preset: Annotated[CompressionPreset, Form()] = "balanced",
    strip_metadata: Annotated[bool | None, Form()] = None,
    file_id: Annotated[str | None, Form()] = None,
    file: UploadFile | None = File(default=None),
):
    raw, name = _read_source_pdf(request, owner, file, file_id)
    res = compress_pdf(raw, preset=preset, strip_metadata=strip_metadata)
    out_bytes = res.pop("bytes")
    return _binary_response(out_bytes, f"{_stem(name)}-compressed.pdf", "application/pdf", res)


@tools_router.post("/convert/pdf-to-images")
def tool_pdf_to_images(
    request: Request,
    owner: Owner,
    fmt: Annotated[Literal["png", "jpeg"], Form()] = "png",
    dpi: Annotated[int, Form()] = 150,
    quality: Annotated[int, Form()] = 88,
    pages_csv: Annotated[str, Form()] = "",
    file_id: Annotated[str | None, Form()] = None,
    file: UploadFile | None = File(default=None),
):
    raw, name = _read_source_pdf(request, owner, file, file_id)
    pages = None
    if pages_csv.strip():
        try:
            pages = [int(p.strip()) for p in pages_csv.split(",") if p.strip()]
        except ValueError as exc:
            raise AppError("invalid_request", "Pages must be comma-separated page numbers.", 422) from exc
    rendered = pdf_to_images(raw, fmt=fmt, dpi=dpi, pages=pages, quality=quality)
    if len(rendered) == 1:
        item = rendered[0]
        mime = "image/jpeg" if fmt == "jpeg" else "image/png"
        return _binary_response(
            item["bytes"],
            f"{_stem(name)}-{item['filename']}",
            mime,
            {"page_count": 1, "format": fmt, "dpi": dpi, "width": item["width"], "height": item["height"]},
        )

    zip_buf = io.BytesIO()
    with zipfile.ZipFile(zip_buf, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for item in rendered:
            zf.writestr(item["filename"], item["bytes"])
    return _binary_response(
        zip_buf.getvalue(),
        f"{_stem(name)}-images.zip",
        "application/zip",
        {"page_count": len(rendered), "format": fmt, "dpi": dpi},
    )


@tools_router.post("/convert/images-to-pdf")
def tool_images_to_pdf(
    request: Request,
    owner: Owner,
    files: list[UploadFile] = File(...),
    page_size: Annotated[Literal["auto", "a4", "letter"], Form()] = "auto",
    margin_pt: Annotated[float, Form()] = 24.0,
):
    items: list[tuple[str, bytes]] = []
    for f in files:
        try:
            items.append((f.filename or "image", f.file.read()))
        finally:
            f.file.close()
    pdf_bytes = images_to_pdf(items, page_size=page_size, margin_pt=margin_pt)
    return _binary_response(
        pdf_bytes,
        "images-converted.pdf",
        "application/pdf",
        {"image_count": len(items), "page_size": page_size},
    )


@tools_router.post("/convert/pdf-to-document")
def tool_pdf_to_document(
    request: Request,
    owner: Owner,
    target: Annotated[Literal["txt", "html", "docx", "xlsx", "pptx"], Form()],
    mode: Annotated[str, Form()] = "default",
    file_id: Annotated[str | None, Form()] = None,
    file: UploadFile | None = File(default=None),
):
    raw, name = _read_source_pdf(request, owner, file, file_id)
    stem = _stem(name)
    if target == "txt":
        res = pdf_to_text(raw)
        return _binary_response(
            res["text"].encode("utf-8"),
            f"{stem}.txt",
            "text/plain; charset=utf-8",
            {"total_chars": res["total_chars"], "page_count": len(res["pages"])},
        )
    if target == "html":
        html_str = pdf_to_html(raw)
        return _binary_response(html_str.encode("utf-8"), f"{stem}.html", "text/html; charset=utf-8", {"format": "html"})
    if target == "docx":
        docx_mode: Literal["structured", "page_images"] = "page_images" if mode == "page_images" else "structured"
        res = pdf_to_docx(raw, mode=docx_mode)
        data = res.pop("bytes")
        return _binary_response(
            data,
            f"{stem}.docx",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            res,
        )
    if target == "xlsx":
        res = pdf_to_xlsx(raw)
        data = res.pop("bytes")
        return _binary_response(
            data,
            f"{stem}.xlsx",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            res,
        )
    pptx_mode: Literal["slide_images", "editable_text"] = "editable_text" if mode == "editable_text" else "slide_images"
    res = pdf_to_pptx(raw, mode=pptx_mode)
    data = res.pop("bytes")
    return _binary_response(
        data,
        f"{stem}.pptx",
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        res,
    )


@tools_router.post("/convert/office-to-pdf")
def tool_office_to_pdf(
    request: Request,
    owner: Owner,
    file: UploadFile = File(...),
):
    try:
        fname = file.filename or "document"
        ext = fname.rsplit(".", 1)[-1].lower() if "." in fname else ""
        if ext not in ("docx", "xlsx", "pptx"):
            raise AppError("unsupported_format", "Upload a .docx, .xlsx, or .pptx file.", 422)
        raw = file.file.read()
    finally:
        file.file.close()
    res = office_to_pdf(raw, ext, fname)  # type: ignore[arg-type]
    out_bytes = res.pop("bytes")
    stem = fname.rsplit(".", 1)[0]
    return _binary_response(out_bytes, f"{stem}.pdf", "application/pdf", res)


@tools_router.post("/convert/html-to-pdf")
def tool_html_to_pdf(
    request: Request,
    owner: Owner,
    html_content: Annotated[str, Form()],
):
    pdf_bytes = html_to_pdf(html_content)
    return _binary_response(pdf_bytes, "html-converted.pdf", "application/pdf", {"engine": "offline-sanitized-html"})


@tools_router.post("/native/inspect")
def tool_native_inspect(
    request: Request,
    owner: Owner,
    page: Annotated[int, Form()] = 1,
    file_id: Annotated[str | None, Form()] = None,
    file: UploadFile | None = File(default=None),
):
    raw, _ = _read_source_pdf(request, owner, file, file_id)
    return inspect_native_content(raw, page)


@tools_router.post("/native/replace-text")
def tool_native_replace_text(
    request: Request,
    owner: Owner,
    page: Annotated[int, Form()],
    op_index: Annotated[int, Form()],
    new_text: Annotated[str, Form()],
    file_id: Annotated[str | None, Form()] = None,
    file: UploadFile | None = File(default=None),
):
    raw, name = _read_source_pdf(request, owner, file, file_id)
    updated = replace_native_text(raw, page, op_index, new_text)
    return _binary_response(updated, f"{_stem(name)}-edited.pdf", "application/pdf", {"page": page, "op_index": op_index})


@tools_router.post("/native/delete-image")
def tool_native_delete_image(
    request: Request,
    owner: Owner,
    page: Annotated[int, Form()],
    op_index: Annotated[int, Form()],
    file_id: Annotated[str | None, Form()] = None,
    file: UploadFile | None = File(default=None),
):
    raw, name = _read_source_pdf(request, owner, file, file_id)
    updated = delete_native_image(raw, page, op_index)
    return _binary_response(updated, f"{_stem(name)}-edited.pdf", "application/pdf", {"page": page, "op_index": op_index})


@tools_router.post("/native/text-spans")
def tool_native_text_spans(
    request: Request,
    owner: Owner,
    page: Annotated[int, Form()] = 1,
    file_id: Annotated[str | None, Form()] = None,
    file: UploadFile | None = File(default=None),
):
    """
    Extract structured text spans from a PDF page for interactive canvas selection and in-place editing.
    Returns bounding boxes, font metadata, sizes, and colors.
    """
    raw, _ = _read_source_pdf(request, owner, file, file_id)
    return extract_text_spans(raw, page)


@tools_router.post("/native/apply-edits")
def tool_native_apply_edits(
    request: Request,
    owner: Owner,
    edits_json: Annotated[str, Form()],
    file_id: Annotated[str | None, Form()] = None,
    file: UploadFile | None = File(default=None),
):
    """
    Apply genuine text edits to existing PDF text.
    Removes the previous text from the stream and reconstructs replacement text at the exact origin.
    """
    import json
    try:
        edits = json.loads(edits_json)
        if not isinstance(edits, list):
            raise ValueError()
    except Exception as exc:
        raise AppError("invalid_request", "Invalid edits payload; must be a JSON array.", 422) from exc
    raw, name = _read_source_pdf(request, owner, file, file_id)
    updated = apply_native_text_edits(raw, edits)
    return _binary_response(updated, f"{_stem(name)}-edited.pdf", "application/pdf", {"edits_applied": len(edits)})


@tools_router.get("/ocr/capabilities")
def tool_ocr_capabilities(owner: Owner):
    return ocr_capabilities()


@tools_router.post("/ocr/detect-scans")
def tool_ocr_detect_scans(
    request: Request,
    owner: Owner,
    file_id: Annotated[str | None, Form()] = None,
    file: UploadFile | None = File(default=None),
):
    raw, _ = _read_source_pdf(request, owner, file, file_id)
    return detect_scanned_pages(raw)


@tools_router.post("/ocr/process")
def tool_ocr_process(
    request: Request,
    owner: Owner,
    lang: Annotated[str, Form()] = "eng",
    dpi: Annotated[int, Form()] = 200,
    pages_csv: Annotated[str, Form()] = "",
    file_id: Annotated[str | None, Form()] = None,
    file: UploadFile | None = File(default=None),
):
    raw, name = _read_source_pdf(request, owner, file, file_id)
    pages = [int(p.strip()) for p in pages_csv.split(",") if p.strip()] if pages_csv.strip() else None
    res = run_ocr_on_pdf(raw, pages=pages, lang=lang, dpi=dpi)
    out_bytes = res.pop("bytes")
    return _binary_response(out_bytes, f"{_stem(name)}-searchable.pdf", "application/pdf", res)


@tools_router.post("/forms/inspect")
def tool_forms_inspect(
    request: Request,
    owner: Owner,
    file_id: Annotated[str | None, Form()] = None,
    file: UploadFile | None = File(default=None),
):
    raw, _ = _read_source_pdf(request, owner, file, file_id)
    return inspect_forms(raw)


@tools_router.post("/forms/create")
def tool_forms_create(
    request: Request,
    owner: Owner,
    fields_json: Annotated[str, Form()],
    file_id: Annotated[str | None, Form()] = None,
    file: UploadFile | None = File(default=None),
):
    raw, name = _read_source_pdf(request, owner, file, file_id)
    try:
        fields_spec = json.loads(fields_json)
    except json.JSONDecodeError as exc:
        raise AppError("invalid_request", "fields_json must be valid JSON.", 422) from exc
    out_bytes = create_form_fields(raw, fields_spec)
    return _binary_response(out_bytes, f"{_stem(name)}-form.pdf", "application/pdf", {"fields_added": len(fields_spec)})


@tools_router.post("/forms/fill")
def tool_forms_fill(
    request: Request,
    owner: Owner,
    values_json: Annotated[str, Form()],
    flatten: Annotated[bool, Form()] = False,
    file_id: Annotated[str | None, Form()] = None,
    file: UploadFile | None = File(default=None),
):
    raw, name = _read_source_pdf(request, owner, file, file_id)
    try:
        values = json.loads(values_json)
    except json.JSONDecodeError as exc:
        raise AppError("invalid_request", "values_json must be valid JSON.", 422) from exc
    out_bytes = fill_forms(raw, values, flatten=flatten)
    return _binary_response(out_bytes, f"{_stem(name)}-filled.pdf", "application/pdf", {"flattened": flatten})


@tools_router.post("/sign/cryptographic")
def tool_sign_cryptographic(
    request: Request,
    owner: Owner,
    signer_name: Annotated[str, Form()],
    reason: Annotated[str, Form()] = "Document signed with Docera",
    location: Annotated[str, Form()] = "",
    pkcs12_password: Annotated[str, Form()] = "",
    file_id: Annotated[str | None, Form()] = None,
    file: UploadFile | None = File(default=None),
    certificate: UploadFile | None = File(default=None),
):
    raw, name = _read_source_pdf(request, owner, file, file_id)
    p12_bytes = None
    if certificate is not None:
        try:
            p12_bytes = certificate.file.read()
        finally:
            certificate.file.close()
    res = sign_pdf_cryptographic(
        raw,
        signer_name=signer_name,
        reason=reason,
        location=location,
        pkcs12_bytes=p12_bytes,
        pkcs12_password=pkcs12_password,
    )
    out_bytes = res.pop("bytes")
    return _binary_response(out_bytes, f"{_stem(name)}-signed.pdf", "application/pdf", res)


@tools_router.post("/sign/verify")
def tool_sign_verify(
    request: Request,
    owner: Owner,
    file_id: Annotated[str | None, Form()] = None,
    file: UploadFile | None = File(default=None),
):
    raw, _ = _read_source_pdf(request, owner, file, file_id)
    return verify_pdf_signatures(raw)


@tools_router.post("/security/encrypt")
def tool_security_encrypt(
    request: Request,
    owner: Owner,
    user_password: Annotated[str, Form()],
    owner_password: Annotated[str, Form()] = "",
    allow_print: Annotated[bool, Form()] = True,
    allow_copy: Annotated[bool, Form()] = True,
    allow_modify: Annotated[bool, Form()] = False,
    allow_annotate: Annotated[bool, Form()] = True,
    file_id: Annotated[str | None, Form()] = None,
    file: UploadFile | None = File(default=None),
):
    raw, name = _read_source_pdf(request, owner, file, file_id)
    out_bytes = encrypt_pdf(
        raw,
        user_password=user_password,
        owner_password=owner_password or None,
        allow_print=allow_print,
        allow_copy=allow_copy,
        allow_modify=allow_modify,
        allow_annotate=allow_annotate,
    )
    return _binary_response(out_bytes, f"{_stem(name)}-protected.pdf", "application/pdf", {"encrypted": True})


@tools_router.post("/security/unlock")
def tool_security_unlock(
    request: Request,
    owner: Owner,
    password: Annotated[str, Form()],
    file: UploadFile = File(...),
):
    raw, name = _read_source_pdf(request, owner, file, None, allow_encrypted=True)
    out_bytes = unlock_pdf(raw, password)
    return _binary_response(out_bytes, f"{_stem(name)}-unlocked.pdf", "application/pdf", {"unlocked": True})


@tools_router.post("/security/inspect-metadata")
def tool_security_inspect_metadata(
    request: Request,
    owner: Owner,
    file_id: Annotated[str | None, Form()] = None,
    file: UploadFile | None = File(default=None),
):
    raw, _ = _read_source_pdf(request, owner, file, file_id)
    return inspect_metadata(raw)


@tools_router.post("/security/clean")
def tool_security_clean(
    request: Request,
    owner: Owner,
    remove_all_metadata: Annotated[bool, Form()] = True,
    sanitize_active: Annotated[bool, Form()] = True,
    remove_keys_csv: Annotated[str, Form()] = "",
    file_id: Annotated[str | None, Form()] = None,
    file: UploadFile | None = File(default=None),
):
    raw, name = _read_source_pdf(request, owner, file, file_id)
    keys = [k.strip() for k in remove_keys_csv.split(",") if k.strip()] if remove_keys_csv.strip() else None
    res = clean_metadata_and_sanitize(
        raw,
        remove_keys=keys,
        remove_all_metadata=remove_all_metadata,
        sanitize_active=sanitize_active,
    )
    out_bytes = res.pop("bytes")
    return _binary_response(out_bytes, f"{_stem(name)}-cleaned.pdf", "application/pdf", res)


@tools_router.post("/security/redact")
def tool_security_redact(
    request: Request,
    owner: Owner,
    boxes_json: Annotated[str, Form()],
    file_id: Annotated[str | None, Form()] = None,
    file: UploadFile | None = File(default=None),
):
    raw, name = _read_source_pdf(request, owner, file, file_id)
    try:
        boxes = json.loads(boxes_json)
    except json.JSONDecodeError as exc:
        raise AppError("invalid_request", "boxes_json must be valid JSON.", 422) from exc
    res = redact_pdf(raw, boxes)
    out_bytes = res.pop("bytes")
    return _binary_response(out_bytes, f"{_stem(name)}-redacted.pdf", "application/pdf", res)


@tools_router.post("/batch")
def tool_batch(
    request: Request,
    owner: Owner,
    operation: Annotated[Literal["compress", "to_png", "to_jpeg", "strip_metadata", "rotate_90"], Form()],
    files: list[UploadFile] = File(...),
):
    if not files:
        raise AppError("invalid_request", "Upload at least one PDF for batch processing.", 422)

    zip_buf = io.BytesIO()
    report_items: list[dict] = []
    with zipfile.ZipFile(zip_buf, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for idx, f in enumerate(files, start=1):
            fname = safe_filename(f.filename)
            stem = _stem(fname)
            try:
                raw = f.file.read()
                if not raw[:8].startswith(b"%PDF-"):
                    raise ValueError("Not a valid PDF file")
                if operation == "compress":
                    res = compress_pdf(raw, preset="balanced")
                    zf.writestr(f"{idx:02d}_{stem}-compressed.pdf", res["bytes"])
                    report_items.append({"file": fname, "status": "ok", "saved_bytes": res["saved_bytes"]})
                elif operation in ("to_png", "to_jpeg"):
                    fmt = "png" if operation == "to_png" else "jpeg"
                    imgs = pdf_to_images(raw, fmt=fmt, dpi=150)
                    for img in imgs:
                        zf.writestr(f"{idx:02d}_{stem}/{img['filename']}", img["bytes"])
                    report_items.append({"file": fname, "status": "ok", "pages": len(imgs)})
                elif operation == "strip_metadata":
                    res = clean_metadata_and_sanitize(raw, remove_all_metadata=True, sanitize_active=True)
                    zf.writestr(f"{idx:02d}_{stem}-cleaned.pdf", res["bytes"])
                    report_items.append({"file": fname, "status": "ok", "removed": res["removed_metadata_keys"]})
                elif operation == "rotate_90":
                    reader = pypdf.PdfReader(io.BytesIO(raw))
                    writer = pypdf.PdfWriter()
                    for page in reader.pages:
                        page.rotate(90)
                        writer.add_page(page)
                    out = io.BytesIO()
                    writer.write(out)
                    zf.writestr(f"{idx:02d}_{stem}-rotated.pdf", out.getvalue())
                    report_items.append({"file": fname, "status": "ok", "pages": len(reader.pages)})
            except Exception as exc:
                report_items.append({"file": fname, "status": "failed", "error": str(exc)})
            finally:
                f.file.close()

        zf.writestr("batch_report.json", json.dumps({"operation": operation, "items": report_items}, indent=2))

    succeeded = sum(1 for item in report_items if item["status"] == "ok")
    failed = len(report_items) - succeeded
    return _binary_response(
        zip_buf.getvalue(),
        f"docera-batch-{operation}.zip",
        "application/zip",
        {"operation": operation, "total": len(report_items), "succeeded": succeeded, "failed": failed, "items": report_items},
    )
