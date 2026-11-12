import hashlib
import io
from typing import Literal

import pikepdf
from PIL import Image, ImageOps

CompressionPreset = Literal["lossless", "balanced", "compact"]

PRESET_CONFIG: dict[CompressionPreset, dict] = {
    "lossless": {"max_dpi": None, "jpeg_quality": None, "strip_metadata": False},
    "balanced": {"max_dpi": 150, "jpeg_quality": 78, "strip_metadata": False},
    "compact": {"max_dpi": 96, "jpeg_quality": 60, "strip_metadata": True},
}


def _deduplicate_images(pdf: pikepdf.Pdf) -> int:
    """Replace identical image XObjects across pages with a shared stream reference."""
    seen: dict[tuple[int, int, str, bytes], pikepdf.Object] = {}
    deduped = 0
    for page in pdf.pages:
        resources = page.get("/Resources")
        if not isinstance(resources, pikepdf.Dictionary):
            continue
        xobjects = resources.get("/XObject")
        if not isinstance(xobjects, pikepdf.Dictionary):
            continue
        for key in list(xobjects.keys()):
            obj = xobjects[key]
            if not isinstance(obj, pikepdf.Stream):
                continue
            if obj.get("/Subtype") != pikepdf.Name("/Image"):
                continue
            try:
                raw = obj.read_raw_bytes()
            except Exception:
                continue
            sig = (
                int(obj.get("/Width", 0)),
                int(obj.get("/Height", 0)),
                str(obj.get("/ColorSpace", "")),
                hashlib.sha256(raw).digest(),
            )
            if sig in seen and seen[sig].objgen != obj.objgen:
                xobjects[key] = seen[sig]
                deduped += 1
            else:
                seen[sig] = obj
    return deduped


def _recompress_page_images(pdf: pikepdf.Pdf, max_dpi: int, jpeg_quality: int) -> int:
    """Downsample and JPEG-recompress eligible raster images inside PDF pages."""
    recompressed = 0
    processed_objgens: set[tuple[int, int]] = set()
    # Cap target pixel dimension conservatively (assume max ~11 in page side -> max_dpi * 12 px)
    max_dim = max(300, max_dpi * 11)

    for page in pdf.pages:
        resources = page.get("/Resources")
        if not isinstance(resources, pikepdf.Dictionary):
            continue
        xobjects = resources.get("/XObject")
        if not isinstance(xobjects, pikepdf.Dictionary):
            continue
        for key in list(xobjects.keys()):
            obj = xobjects[key]
            if not isinstance(obj, pikepdf.Stream):
                continue
            if obj.get("/Subtype") != pikepdf.Name("/Image"):
                continue
            if obj.objgen in processed_objgens:
                continue
            processed_objgens.add(obj.objgen)

            # Skip soft-masked / stencil / tiny icon images to preserve transparency and crisp UI marks
            if "/SMask" in obj or "/Mask" in obj or obj.get("/ImageMask") is True:
                continue
            try:
                width = int(obj.get("/Width", 0))
                height = int(obj.get("/Height", 0))
                if width < 96 or height < 96:
                    continue
                pdf_image = pikepdf.PdfImage(obj)
                pil_img = pdf_image.as_pil_image()
            except Exception:
                continue

            if pil_img.mode not in ("RGB", "L", "CMYK"):
                if "A" in pil_img.mode:
                    continue
                pil_img = pil_img.convert("RGB")
            elif pil_img.mode == "CMYK":
                pil_img = pil_img.convert("RGB")

            if max(pil_img.width, pil_img.height) > max_dim:
                pil_img = ImageOps.contain(pil_img, (max_dim, max_dim), Image.Resampling.LANCZOS)

            buf = io.BytesIO()
            pil_img.save(buf, format="JPEG", quality=jpeg_quality, optimize=True)
            jpeg_bytes = buf.getvalue()
            try:
                orig_raw_len = len(obj.read_raw_bytes())
            except Exception:
                orig_raw_len = 0
            if orig_raw_len and len(jpeg_bytes) >= orig_raw_len:
                continue

            color_space = pikepdf.Name("/DeviceGray") if pil_img.mode == "L" else pikepdf.Name("/DeviceRGB")
            obj.write(jpeg_bytes, filter=pikepdf.Name("/DCTDecode"))
            obj[pikepdf.Name("/Width")] = pil_img.width
            obj[pikepdf.Name("/Height")] = pil_img.height
            obj[pikepdf.Name("/BitsPerComponent")] = 8
            obj[pikepdf.Name("/ColorSpace")] = color_space
            if "/DecodeParms" in obj:
                del obj["/DecodeParms"]
            recompressed += 1

    return recompressed


def compress_pdf(
    pdf_bytes: bytes,
    preset: CompressionPreset = "balanced",
    *,
    strip_metadata: bool | None = None,
    jpeg_quality: int | None = None,
    max_dpi: int | None = None,
) -> dict:
    """Optimize a PDF and report real before/after byte metrics without falsifying reductions."""
    cfg = PRESET_CONFIG[preset]
    effective_strip = cfg["strip_metadata"] if strip_metadata is None else strip_metadata
    effective_dpi = cfg["max_dpi"] if max_dpi is None else max_dpi
    effective_quality = cfg["jpeg_quality"] if jpeg_quality is None else jpeg_quality

    original_bytes = len(pdf_bytes)
    with pikepdf.open(io.BytesIO(pdf_bytes)) as pdf:
        deduped = _deduplicate_images(pdf)
        recompressed = 0
        if effective_dpi and effective_quality:
            recompressed = _recompress_page_images(pdf, effective_dpi, effective_quality)

        if effective_strip:
            for key in list(pdf.docinfo.keys()):
                del pdf.docinfo[key]
            if "/Metadata" in pdf.Root:
                del pdf.Root["/Metadata"]

        pdf.remove_unreferenced_resources()
        out = io.BytesIO()
        pdf.save(
            out,
            compress_streams=True,
            object_stream_mode=pikepdf.ObjectStreamMode.generate,
            recompress_flate=True,
        )
        candidate = out.getvalue()

    candidate_size = len(candidate)
    if candidate_size >= original_bytes:
        return {
            "bytes": pdf_bytes,
            "original_bytes": original_bytes,
            "compressed_bytes": original_bytes,
            "saved_bytes": 0,
            "percent_change": 0.0,
            "was_reduced": False,
            "deduped_images": deduped,
            "recompressed_images": recompressed,
            "warning": (
                f"This PDF could not be reduced further with the '{preset}' preset "
                f"(candidate output was {candidate_size:,} bytes vs {original_bytes:,} original bytes). "
                "The original file is returned unchanged."
            ),
        }

    saved = original_bytes - candidate_size
    pct = round((saved / original_bytes) * 100, 2)
    warning = None
    if preset == "compact" and recompressed > 0:
        warning = "Compact mode downsampled embedded raster images to 96 DPI; inspect zoomed pages for quality."

    return {
        "bytes": candidate,
        "original_bytes": original_bytes,
        "compressed_bytes": candidate_size,
        "saved_bytes": saved,
        "percent_change": -pct,
        "was_reduced": True,
        "deduped_images": deduped,
        "recompressed_images": recompressed,
        "warning": warning,
    }
