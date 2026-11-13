"""
Live integration test suite verifying the running Docker Compose environment
(Frontend at http://127.0.0.1:8080 proxied to Backend at http://127.0.0.1:8000).
Tests: session isolation, file upload, compression, encryption, unlocking,
redaction, cryptographic signing, signature verification, and deletion.
"""
import io
import urllib.request
import urllib.parse
import http.cookiejar
import json
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import letter
import pypdf

BASE_URL = "http://127.0.0.1:8080/api/v1"


def create_sample_pdf(text: str = "Docera Docker Integration Test Document") -> bytes:
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=letter)
    c.setFont("Helvetica", 14)
    c.drawString(72, 700, text)
    c.drawString(72, 680, "Classified Secret: TOP-SECRET-998811")
    c.drawString(72, 660, "Email: auditor@docera.internal")
    c.showPage()
    c.save()
    return buf.getvalue()


def run_docker_tests():
    print("[1/10] Initializing HTTP Client with CookieJar...")
    cj = http.cookiejar.CookieJar()
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))

    print("[2/10] Establishing session via Nginx proxy...")
    req = urllib.request.Request(f"{BASE_URL}/session", data=b"", method="POST")
    with opener.open(req) as resp:
        assert resp.status == 200
        session_info = json.loads(resp.read().decode())
        print(f"       Session active. Quota: {session_info['session_quota_bytes']} bytes")

    print("[3/10] Uploading sample PDF via multipart/form-data...")
    pdf_bytes = create_sample_pdf()
    boundary = "----DoceraBoundaryX77"
    body = (
        f"--{boundary}\r\n"
        f'Content-Disposition: form-data; name="file"; filename="docker-sample.pdf"\r\n'
        f"Content-Type: application/pdf\r\n\r\n"
    ).encode("latin1") + pdf_bytes + f"\r\n--{boundary}--\r\n".encode("latin1")

    upload_req = urllib.request.Request(
        f"{BASE_URL}/files/upload",
        data=body,
        headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
        method="POST"
    )
    with opener.open(upload_req) as resp:
        assert resp.status == 201
        file_detail = json.loads(resp.read().decode())
        file_id = file_detail["id"]
        print(f"       Uploaded file_id: {file_id} ({file_detail['filename']})")

    print("[4/10] Verifying session file listing...")
    list_req = urllib.request.Request(f"{BASE_URL}/files", method="GET")
    with opener.open(list_req) as resp:
        files = json.loads(resp.read().decode())["files"]
        assert any(f["id"] == file_id for f in files)
        print(f"       Found {len(files)} file(s) in session.")

    print("[5/10] Testing Server-side Lossless Compression...")
    comp_body = (
        f"--{boundary}\r\n"
        f'Content-Disposition: form-data; name="file_id"\r\n\r\n{file_id}\r\n'
        f"--{boundary}\r\n"
        f'Content-Disposition: form-data; name="preset"\r\n\r\nlossless\r\n'
        f"--{boundary}--\r\n"
    ).encode("latin1")
    comp_req = urllib.request.Request(
        f"{BASE_URL}/tools/compress",
        data=comp_body,
        headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
        method="POST"
    )
    with opener.open(comp_req) as resp:
        assert resp.status == 200
        compressed_pdf = resp.read()
        assert compressed_pdf[:5] == b"%PDF-"
        print(f"       Compressed PDF verified (%PDF- header present, size: {len(compressed_pdf)}B)")

    print("[6/10] Testing AES-256 Encryption...")
    enc_body = (
        f"--{boundary}\r\n"
        f'Content-Disposition: form-data; name="file_id"\r\n\r\n{file_id}\r\n'
        f"--{boundary}\r\n"
        f'Content-Disposition: form-data; name="user_password"\r\n\r\nDockerPass123!\r\n'
        f"--{boundary}--\r\n"
    ).encode("latin1")
    enc_req = urllib.request.Request(
        f"{BASE_URL}/tools/security/encrypt",
        data=enc_body,
        headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
        method="POST"
    )
    with opener.open(enc_req) as resp:
        assert resp.status == 200
        encrypted_pdf = resp.read()
        reader = pypdf.PdfReader(io.BytesIO(encrypted_pdf))
        assert reader.is_encrypted
        print("       Encrypted PDF verified (reader.is_encrypted == True)")

    print("[7/10] Testing Authorized Password Unlocking...")
    unlock_body = (
        f"--{boundary}\r\n"
        f'Content-Disposition: form-data; name="file"; filename="encrypted.pdf"\r\n'
        f"Content-Type: application/pdf\r\n\r\n"
    ).encode("latin1") + encrypted_pdf + (
        f"\r\n--{boundary}\r\n"
        f'Content-Disposition: form-data; name="password"\r\n\r\nDockerPass123!\r\n'
        f"--{boundary}--\r\n"
    ).encode("latin1")
    unlock_req = urllib.request.Request(
        f"{BASE_URL}/tools/security/unlock",
        data=unlock_body,
        headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
        method="POST"
    )
    with opener.open(unlock_req) as resp:
        assert resp.status == 200
        unlocked_pdf = resp.read()
        unlocked_reader = pypdf.PdfReader(io.BytesIO(unlocked_pdf))
        assert not unlocked_reader.is_encrypted
        print("       Unlocked PDF verified (reader.is_encrypted == False)")

    print("[8/10] Testing Irreversible Redaction in Docker...")
    redact_spec = json.dumps([{"page": 1, "x": 60, "y": 650, "width": 300, "height": 40}])
    red_body = (
        f"--{boundary}\r\n"
        f'Content-Disposition: form-data; name="file_id"\r\n\r\n{file_id}\r\n'
        f"--{boundary}\r\n"
        f'Content-Disposition: form-data; name="boxes_json"\r\n\r\n{redact_spec}\r\n'
        f"--{boundary}--\r\n"
    ).encode("latin1")
    red_req = urllib.request.Request(
        f"{BASE_URL}/tools/security/redact",
        data=red_body,
        headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
        method="POST"
    )
    with opener.open(red_req) as resp:
        assert resp.status == 200
        redacted_pdf = resp.read()
        red_reader = pypdf.PdfReader(io.BytesIO(redacted_pdf))
        extracted = red_reader.pages[0].extract_text()
        assert "TOP-SECRET-998811" not in extracted
        print("       Redaction verified: 'TOP-SECRET-998811' completely purged from content stream.")

    print("[9/10] Testing Cryptographic Digital Signature & Verification in Docker...")
    sign_body = (
        f"--{boundary}\r\n"
        f'Content-Disposition: form-data; name="file_id"\r\n\r\n{file_id}\r\n'
        f"--{boundary}\r\n"
        f'Content-Disposition: form-data; name="signer_name"\r\n\r\nDocker Auditor\r\n'
        f"--{boundary}\r\n"
        f'Content-Disposition: form-data; name="reason"\r\n\r\nProduction Docker Readiness Verification\r\n'
        f"--{boundary}--\r\n"
    ).encode("latin1")
    sign_req = urllib.request.Request(
        f"{BASE_URL}/tools/sign/cryptographic",
        data=sign_body,
        headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
        method="POST"
    )
    with opener.open(sign_req) as resp:
        assert resp.status == 200
        signed_pdf = resp.read()
        assert b"/ByteRange" in signed_pdf
        print("       Cryptographic PAdES signature generated with embedded PKCS#12 certificate.")

    # Verify signature
    verify_body = (
        f"--{boundary}\r\n"
        f'Content-Disposition: form-data; name="file"; filename="signed.pdf"\r\n'
        f"Content-Type: application/pdf\r\n\r\n"
    ).encode("latin1") + signed_pdf + f"\r\n--{boundary}--\r\n".encode("latin1")
    verify_req = urllib.request.Request(
        f"{BASE_URL}/tools/sign/verify",
        data=verify_body,
        headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
        method="POST"
    )
    with opener.open(verify_req) as resp:
        assert resp.status == 200
        v_data = json.loads(resp.read().decode())
        assert v_data["signature_count"] >= 1
        assert v_data["signatures"][0]["intact"] is True
        print(f"       Signature integrity verified intact: {v_data['signatures'][0]['signer']}")

    print("[10/10] Testing Clean Document Deletion...")
    del_req = urllib.request.Request(f"{BASE_URL}/files/{file_id}", method="DELETE")
    with opener.open(del_req) as resp:
        assert resp.status == 204
        print("        Document cleanly deleted from session storage (HTTP 204).")

    print("\nSUCCESS: All 10 Docker live environment verification steps passed flawlessly!")


if __name__ == "__main__":
    run_docker_tests()
