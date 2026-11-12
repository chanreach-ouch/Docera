import time

from pypdf import PdfReader
import io

from tests.conftest import make_indirect_rotate_pdf, make_pdf


def _start_session(client) -> None:
    res = client.post("/api/v1/session")
    assert res.status_code == 200
    assert "docera_session" in client.cookies


def test_health(client):
    res = client.get("/api/v1/health")
    assert res.status_code == 200
    assert res.json()["status"] == "ok"


def test_requires_session(client):
    res = client.get("/api/v1/files")
    assert res.status_code == 401
    assert res.json()["error"]["code"] == "session_required"


def test_upload_list_get_download_and_delete_roundtrip(client):
    _start_session(client)
    pdf_bytes = make_pdf([(612, 792, 0), (842, 595, 90)])

    up = client.post(
        "/api/v1/files/upload",
        files={"file": ("../../report<v1>.pdf", pdf_bytes, "application/pdf")},
    )
    assert up.status_code == 201, up.text
    detail = up.json()
    assert detail["filename"] == "report_v1_.pdf"
    assert detail["page_count"] == 2
    assert detail["size_bytes"] == len(pdf_bytes)
    assert detail["pages"][0]["width"] == 612
    assert detail["pages"][0]["height"] == 792
    # Page 2 has 842x595 rotated 90 deg -> swapped display dimensions
    assert detail["pages"][1]["width"] == 595
    assert detail["pages"][1]["height"] == 842
    assert detail["pages"][1]["rotation"] == 90

    listed = client.get("/api/v1/files")
    assert listed.status_code == 200
    assert len(listed.json()["files"]) == 1

    fetched = client.get(f"/api/v1/files/{detail['id']}")
    assert fetched.status_code == 200
    assert fetched.json()["id"] == detail["id"]

    dl = client.get(f"/api/v1/files/{detail['id']}/download")
    assert dl.status_code == 200
    assert dl.content == pdf_bytes
    assert dl.headers["x-content-type-options"] == "nosniff"
    assert "sandbox" in dl.headers["content-security-policy"]
    # Verify independent PDF reader accepts downloaded bytes
    reader = PdfReader(io.BytesIO(dl.content))
    assert len(reader.pages) == 2

    deleted = client.delete(f"/api/v1/files/{detail['id']}")
    assert deleted.status_code == 204
    assert client.get(f"/api/v1/files/{detail['id']}").status_code == 404


def test_indirect_rotate_object_supported(client):
    _start_session(client)
    pdf_bytes = make_indirect_rotate_pdf()
    up = client.post("/api/v1/files/upload", files={"file": ("indirect.pdf", pdf_bytes, "application/pdf")})
    assert up.status_code == 201
    assert up.json()["pages"][0]["rotation"] == 90


def test_rejects_invalid_empty_encrypted_and_page_limit_pdfs(client):
    _start_session(client)

    empty = client.post("/api/v1/files/upload", files={"file": ("empty.pdf", b"", "application/pdf")})
    assert empty.status_code == 422
    assert empty.json()["error"]["code"] == "empty_file"

    spoofed = client.post("/api/v1/files/upload", files={"file": ("fake.pdf", b"NOT A PDF", "application/pdf")})
    assert spoofed.status_code == 422
    assert spoofed.json()["error"]["code"] == "invalid_pdf"

    encrypted = client.post(
        "/api/v1/files/upload",
        files={"file": ("secret.pdf", make_pdf(encrypt_password="pass"), "application/pdf")},
    )
    assert encrypted.status_code == 422
    assert encrypted.json()["error"]["code"] == "encrypted_pdf"

    too_many = client.post(
        "/api/v1/files/upload",
        files={"file": ("many.pdf", make_pdf([(612, 792, 0)] * 11), "application/pdf")},
    )
    assert too_many.status_code == 422
    assert too_many.json()["error"]["code"] == "page_limit"


def test_session_isolation_and_csrf_protection(client, settings):
    _start_session(client)
    pdf_bytes = make_pdf()
    up = client.post("/api/v1/files/upload", files={"file": ("private.pdf", pdf_bytes, "application/pdf")})
    file_id = up.json()["id"]

    # Another browser session must not access the document
    from app.main import create_app
    from fastapi.testclient import TestClient

    with TestClient(create_app(settings)) as other:
        _start_session(other)
        assert other.get(f"/api/v1/files/{file_id}").status_code == 404
        assert other.get(f"/api/v1/files/{file_id}/download").status_code == 404
        assert other.delete(f"/api/v1/files/{file_id}").status_code == 404

    # Cross-site / untrusted Origin mutation must be denied
    bad_origin = client.post("/api/v1/session", headers={"Origin": "https://evil.example"})
    assert bad_origin.status_code == 403
    assert bad_origin.json()["error"]["code"] == "origin_denied"

    cross_site = client.delete(f"/api/v1/files/{file_id}", headers={"Sec-Fetch-Site": "cross-site"})
    assert cross_site.status_code == 403


def test_expiry_and_orphan_cleanup(client, settings):
    _start_session(client)
    up = client.post("/api/v1/files/upload", files={"file": ("temp.pdf", make_pdf(), "application/pdf")})
    file_id = up.json()["id"]

    app = client.app
    # Force expiry in DB and trigger cleanup
    with app.state.repository.connection() as db:
        db.execute("UPDATE files SET expires=? WHERE id=?", (time.time() - 10, file_id))
    app.state.files.cleanup()

    assert client.get(f"/api/v1/files/{file_id}").status_code == 404
    assert not app.state.storage.directory(file_id).exists()
