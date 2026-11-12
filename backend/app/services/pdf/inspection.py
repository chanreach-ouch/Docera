import json
import subprocess
import sys
from pathlib import Path

from app.core.errors import AppError
from app.schemas import PageInfo

MESSAGES = {
    "invalid_pdf": "This file is not a supported, intact PDF. Try opening it in a trusted PDF reader first.",
    "encrypted_pdf": "Password-protected PDFs are not supported yet. Upload an authorized, unencrypted copy.",
    "page_limit": "The PDF is empty or exceeds the configured page limit.",
    "invalid_geometry": "This PDF has page dimensions or rotations that this viewer cannot safely display.",
}


def inspect_pdf(path: Path, max_pages: int, timeout: float) -> list[dict]:
    worker = Path(__file__).with_name("inspect_worker.py")
    try:
        result = subprocess.run(
            [sys.executable, "-I", str(worker), str(path), str(max_pages)],
            capture_output=True, timeout=timeout, check=False,
            creationflags=subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0,
        )
    except subprocess.TimeoutExpired as exc:
        raise AppError("inspection_timeout", "PDF inspection took too long. Try a smaller or simpler document.", 422) from exc
    try:
        if result.returncode or len(result.stdout) > 1024 * 1024:
            raise ValueError("Inspector failure")
        payload = json.loads(result.stdout)
        if "error" in payload:
            code = payload["error"]
            raise AppError(code, MESSAGES.get(code, MESSAGES["invalid_pdf"]), 422)
        return [PageInfo.model_validate(page).model_dump() for page in payload["pages"]]
    except (ValueError, KeyError, TypeError) as exc:
        raise AppError("invalid_pdf", MESSAGES["invalid_pdf"], 422) from exc
