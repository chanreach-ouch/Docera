"""Isolated structural inspection. Receives an internal path, never a user path."""
import json
import logging
import math
import sys
from pathlib import Path


def inspect(path: Path, max_pages: int) -> dict:
    from pypdf import PdfReader

    size = path.stat().st_size
    with path.open("rb") as source:
        if not source.read(8).startswith(b"%PDF-"):
            return {"error": "invalid_pdf"}
        source.seek(max(0, size - 2048))
        if b"%%EOF" not in source.read():
            return {"error": "invalid_pdf"}
        source.seek(0)
        reader = PdfReader(source, strict=True)
        if reader.is_encrypted:
            return {"error": "encrypted_pdf"}
        count = len(reader.pages)
        if not 1 <= count <= max_pages:
            return {"error": "page_limit"}
        pages = []
        for index, page in enumerate(reader.pages):
            raw_unit = page.get("/UserUnit", 1)
            unit = float(raw_unit.get_object() if hasattr(raw_unit, "get_object") else raw_unit)
            media = [float(x) for x in page.mediabox]
            crop = [float(x) for x in page.cropbox]
            raw_rot_obj = page.get("/Rotate", 0)
            raw_rotation = float(raw_rot_obj.get_object() if hasattr(raw_rot_obj, "get_object") else raw_rot_obj)
            if not all(math.isfinite(x) for x in [*media, *crop, unit, raw_rotation]):
                return {"error": "invalid_geometry"}
            rotation = int(raw_rotation) % 360
            if raw_rotation % 90 or not 0 < unit <= 10:
                return {"error": "invalid_geometry"}
            # PDF.js displays the intersection of the crop and media boxes.
            x0, y0 = max(media[0], crop[0]), max(media[1], crop[1])
            x1, y1 = min(media[2], crop[2]), min(media[3], crop[3])
            width, height = (x1 - x0) * unit, (y1 - y0) * unit
            if not 1 <= width <= 14400 or not 1 <= height <= 14400:
                return {"error": "invalid_geometry"}
            if rotation in (90, 270):
                width, height = height, width
            pages.append(dict(index=index, width=width, height=height, rotation=rotation, user_unit=unit, media_box=media, crop_box=crop))
        return {"pages": pages}


def main():
    if sys.platform != "win32":
        import resource

        resource.setrlimit(resource.RLIMIT_AS, (384 * 1024 * 1024, 384 * 1024 * 1024))
        resource.setrlimit(resource.RLIMIT_CPU, (12, 12))
        resource.setrlimit(resource.RLIMIT_FSIZE, (1024, 1024))
    logging.disable(logging.CRITICAL)
    try:
        result = inspect(Path(sys.argv[1]), int(sys.argv[2]))
    except Exception:
        result = {"error": "invalid_pdf"}
    print(json.dumps(result, allow_nan=False))


if __name__ == "__main__":
    main()
