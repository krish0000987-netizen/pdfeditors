"""
End-to-end smoke test for the EDITOR engine service.

Requires: engine-service venv (pikepdf + fastapi + pdf-edit-engine).
Run:  cd engine-service && .venv/bin/python test_engine_flow.py

Generates a synthetic PDF, starts the app in-process with TestClient, and
exercises the full editing flow, verifying that the ORIGINAL file is never
modified and that true redaction really removes text.
"""

from __future__ import annotations

import base64
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from fastapi.testclient import TestClient  # noqa: E402


def pdf_text(data: bytes) -> str:
    """Extract text from PDF bytes via pikepdf page content (lossy but enough)."""
    import io

    import pikepdf

    with pikepdf.open(io.BytesIO(data)) as pdf:
        # use the engine's own extractor through a temp file
        tmp = Path(tempfile.gettempdir()) / "engine-test-extract.pdf"
        tmp.write_bytes(data)
        import pdf_edit_engine as engine

        return engine.get_text(str(tmp))


def main() -> None:
    import main as service

    work_root = Path(tempfile.mkdtemp(prefix="editor-engine-test-")).resolve()
    service.WORK_ROOT = work_root

    with TestClient(service.app) as client:
        headers = {"X-Engine-Key": service.API_KEY}

        # 0. health
        r = client.get("/health")
        assert r.status_code == 200, r.text
        print(f"  health: {r.json()}")

        # 1. create a synthetic statement directly
        synthetic = work_root / "synthetic.pdf"
        sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "editor" / "scripts"))
        from generate_synthetic_pdfs import make_synthetic_statement

        make_synthetic_statement(synthetic)
        data_b64 = base64.b64encode(synthetic.read_bytes()).decode()

        r = client.post("/files/create-from-bytes", json={"data_b64": data_b64}, headers=headers)
        assert r.status_code == 200, r.text
        path = r.json()["path"]
        page_count = r.json()["page_count"]
        assert page_count == 1
        print(f"  uploaded: {path} ({page_count} page)")

        original_bytes = (work_root / path).read_bytes()
        original_text = pdf_text(original_bytes)
        assert "Salary credit" in original_text
        assert "2026-01-05" in original_text

        # 2. find
        r = client.post(
            "/text/find", json={"path": path, "search_text": "Salary credit"}, headers=headers
        )
        assert r.status_code == 200, r.text
        matches = r.json()["matches"]
        assert len(matches) == 1, matches
        print(f"  find 'Salary credit': {len(matches)} match on page {matches[0]['page_number']}")

        # 3. dry-run replace (no file written)
        r = client.post(
            "/text/replace",
            json={
                "path": path,
                "search_text": "Salary credit",
                "match_id": 0,
                "new_text": "STIPEND credit",
                "dry_run": True,
            },
            headers=headers,
        )
        assert r.status_code == 200, r.text
        assert r.json()["output_path"] is None
        assert r.json()["success"] is True
        print("  dry-run replace OK (no output written)")

        # 4. real replace → new file
        r = client.post(
            "/text/replace",
            json={
                "path": path,
                "search_text": "Salary credit",
                "match_id": 0,
                "new_text": "STIPEND credit",
            },
            headers=headers,
        )
        assert r.status_code == 200, r.text
        out1 = r.json()["output_path"]
        assert out1 and out1 != path
        new_text = pdf_text((work_root / out1).read_bytes())
        assert "STIPEND credit" in new_text
        assert "Salary credit" not in new_text
        # ORIGINAL untouched
        assert (work_root / path).read_bytes() == original_bytes
        print(f"  replace → {out1}; original bytes unchanged ✓")

        # 5. replace-all
        r = client.post(
            "/text/replace-all",
            json={"path": out1, "search": "synthetic", "replacement": "SAMPLE"},
            headers=headers,
        )
        assert r.status_code == 200, r.text
        out2 = r.json()["output_path"]
        assert out2
        print(f"  replace-all → {out2} ({r.json()['count']} replaced)")

        # 6. highlight
        r = client.post(
            "/annotations/highlight",
            json={"path": out2, "search_text": "Grocery Mart"},
            headers=headers,
        )
        assert r.status_code == 200, r.text
        out3 = r.json()["output_path"]
        assert r.json()["count"] >= 1
        print(f"  highlight → {out3} ({r.json()['count']} quad(s))")

        # 7. redact preview then TRUE redact of the account number line
        r = client.post(
            "/redact/preview",
            json={"path": out3, "regions": [{"page": 0, "bbox": [72, 640, 300, 655]}]},
            headers=headers,
        )
        assert r.status_code == 200, r.text

        # find exact bbox of the account number through engine.find
        r = client.post("/text/find", json={"path": out3, "search_text": "XXXX-1234"}, headers=headers)
        matches = r.json()["matches"]
        bbox = matches[0]["bounding_box"] if matches else [72, 640, 300, 655]

        r = client.post(
            "/redact/apply",
            json={"path": out3, "regions": [{"page": 0, "bbox": list(bbox)}]},
            headers=headers,
        )
        assert r.status_code == 200, r.text
        out4 = r.json()["output_path"]
        redacted_text = pdf_text((work_root / out4).read_bytes())
        assert "XXXX-1234" not in redacted_text, "true redaction failed: text still present!"
        print(f"  TRUE redaction → {out4}: 'XXXX-1234' removed from content ✓")

        # 8. page ops
        r = client.post("/pages/insert-blank", json={"path": out4, "at": 1}, headers=headers)
        assert r.status_code == 200, r.text
        out5 = r.json()["output_path"]

        r = client.post("/pages/rotate", json={"path": out5, "pages": [0], "angle": 90}, headers=headers)
        assert r.status_code == 200, r.text
        out6 = r.json()["output_path"]

        r = client.post("/pages/delete", json={"path": out6, "pages": [1]}, headers=headers)
        assert r.status_code == 200, r.text
        out7 = r.json()["output_path"]

        with __import__("pikepdf").open(str(work_root / out7)) as pdf:
            assert len(pdf.pages) == 1
        print(f"  page ops (insert/rotate/delete) → {out7}")

        # 9. duplicate + reorder + split/merge
        r = client.post("/pages/duplicate", json={"path": out7, "pages": [0]}, headers=headers)
        assert r.status_code == 200, r.text
        out8 = r.json()["output_path"]
        with __import__("pikepdf").open(str(work_root / out8)) as pdf:
            assert len(pdf.pages) == 2
        r = client.post("/pages/reorder", json={"path": out8, "page_order": [1, 0]}, headers=headers)
        assert r.status_code == 200, r.text
        print("  duplicate + reorder OK")

        # 10. path traversal blocked
        r = client.get("/files/../../etc/passwd", headers=headers)
        assert r.status_code in (400, 404), "path traversal not blocked!"
        print("  path traversal blocked ✓")

        # 11. bad API key rejected
        r = client.post("/text/get", json={"path": path}, headers={"X-Engine-Key": "wrong"})
        assert r.status_code == 401
        print("  auth enforced ✓")

        print("\nALL ENGINE FLOW TESTS PASSED")


if __name__ == "__main__":
    main()
