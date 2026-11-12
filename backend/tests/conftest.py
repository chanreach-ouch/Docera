import io
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from pypdf import PdfWriter
from pypdf.generic import DictionaryObject, NameObject, NumberObject

from app.core.config import Settings
from app.main import create_app


def make_pdf(
    pages: list[tuple[float, float, int]] | None = None,
    *,
    encrypt_password: str | None = None,
) -> bytes:
    """Create a valid PDF in memory with optional mixed sizes, rotations, or encryption."""
    writer = PdfWriter()
    for width, height, rotate in pages or [(612, 792, 0)]:
        page = writer.add_blank_page(width=width, height=height)
        if rotate:
            page[NameObject("/Rotate")] = NumberObject(rotate)
    if encrypt_password:
        writer.encrypt(encrypt_password)
    buf = io.BytesIO()
    writer.write(buf)
    return buf.getvalue()


def make_indirect_rotate_pdf() -> bytes:
    """Create a valid PDF whose /Rotate entry is an indirect object."""
    writer = PdfWriter()
    page = writer.add_blank_page(width=612, height=792)
    rot_ref = writer._add_object(NumberObject(90))
    page[NameObject("/Rotate")] = rot_ref
    buf = io.BytesIO()
    writer.write(buf)
    return buf.getvalue()


@pytest.fixture()
def settings(tmp_path: Path) -> Settings:
    return Settings(
        data_dir=tmp_path / "docera-data",
        max_upload_bytes=1024 * 1024,
        max_pages=10,
        retention_seconds=120,
        cleanup_interval_seconds=60,
        inspection_timeout_seconds=10,
        session_quota_bytes=2 * 1024 * 1024,
        total_quota_bytes=4 * 1024 * 1024,
        max_session_files=5,
    )


@pytest.fixture()
def client(settings: Settings):
    app = create_app(settings)
    with TestClient(app) as test_client:
        yield test_client
