"""EDITOR Engine Service — wraps pdf-edit-engine (unmodified) behind a REST API.

The pdf-edit-engine library is imported in-process and never modified.
This service adds:
  - REST endpoints for find/replace/structural/page/annotation/redaction ops
  - dry-run previews (engine-native)
  - true redaction (content removal + cover box) built ON TOP of the engine
  - safe temp-file handling with automatic cleanup
"""

from __future__ import annotations

import os
import shutil
import tempfile
import uuid
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any, Literal

import pikepdf
from fastapi import Depends, FastAPI, File, HTTPException, UploadFile
from fastapi.security import APIKeyHeader

import pdf_edit_engine as engine
from pdf_edit_engine import Edit, TextMatch
from pdf_edit_engine.errors import PDFEditError
from pdf_edit_engine.models import Degradation

API_KEY = os.environ.get("ENGINE_API_KEY", "dev-engine-secret-local")
# Resolve once: the engine refuses output paths under symlinked directories
# (e.g. macOS /tmp -> /private/tmp), so the work root must be a real path.
WORK_ROOT = Path(
    os.environ.get("ENGINE_WORK_ROOT") or (Path(tempfile.gettempdir()) / "editor-engine-work")
).resolve()

security = APIKeyHeader(name="X-Engine-Key", auto_error=False)


def require_key(key: str | None = Depends(security)) -> None:
    if key != API_KEY:
        raise HTTPException(status_code=401, detail="Invalid engine API key")


@asynccontextmanager
async def lifespan(_: FastAPI):
    WORK_ROOT.mkdir(parents=True, exist_ok=True)
    yield
    if WORK_ROOT.exists():
        shutil.rmtree(WORK_ROOT, ignore_errors=True)


app = FastAPI(
    title="EDITOR Engine Service",
    version="1.0.0",
    description="REST wrapper around pdf-edit-engine. All edits are file-in/file-out; "
    "the caller supplies an input path and receives an output path within the shared work root.",
    lifespan=lifespan,
)


# ---------------------------------------------------------------- helpers


def _resolve(path: str) -> Path:
    """Resolve a path inside the shared work root; block traversal.

    Returns the RESOLVED path. The engine refuses output paths whose
    string form crosses a symlink (realpath != abspath), so every path
    handed to the engine must already be symlink-free — i.e. fully
    resolved. On macOS this matters because /tmp -> /private/tmp.
    """
    root = WORK_ROOT.resolve()
    p = (root / path).resolve()
    if root != p and root not in p.parents:
        raise HTTPException(status_code=400, detail="Path outside work root")
    return p


def _exists(p: Path) -> None:
    if not p.exists():
        raise HTTPException(status_code=404, detail=f"No such file: {p.name}")


def _degradations_to_dicts(degradations: list[Degradation]) -> list[dict[str, Any]]:
    return [
        {"kind": d.kind.value if hasattr(d.kind, "value") else str(d.kind),
         "severity": d.severity, "detail": d.detail}
        for d in degradations
    ]


def _fidelity_to_dict(report: Any) -> dict[str, Any]:
    return {
        "font_substituted": report.font_substituted,
        "font_preserved": report.font_preserved,
        "overflow_detected": report.overflow_detected,
        "reflow_applied": report.reflow_applied,
        "glyphs_missing": list(report.glyphs_missing),
        "degradations": _degradations_to_dicts(report.degradations),
    }


def _edit_result_to_dict(r: Any) -> dict[str, Any]:
    return {
        "success": r.success,
        "original_text": r.original_text,
        "new_text": r.new_text,
        "font_action": r.font_action,
        "warnings": list(r.warnings),
        "fidelity_report": _fidelity_to_dict(r.fidelity_report),
    }


def _engine_error(e: PDFEditError) -> HTTPException:
    return HTTPException(status_code=422, detail={"error_type": type(e).__name__,
                                                  "message": str(e)})


# ---------------------------------------------------------------- file mgmt


@app.post("/files/upload", dependencies=[Depends(require_key)])
async def upload_file(file: UploadFile = File(...)) -> dict[str, Any]:
    """Upload a working PDF into the engine work root. Returns relative path."""
    fid = uuid.uuid4().hex
    dest_dir = WORK_ROOT / "inbox" / fid
    dest_dir.mkdir(parents=True, exist_ok=True)
    dest = dest_dir / "input.pdf"
    data = await file.read()
    if not data.startswith(b"%PDF"):
        raise HTTPException(status_code=400, detail="Not a valid PDF (bad signature)")
    dest.write_bytes(data)
    # page count
    try:
        with pikepdf.open(dest) as pdf:
            pages = len(pdf.pages)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Unopenable PDF: {type(e).__name__}")
    rel = str(dest.resolve().relative_to(WORK_ROOT))
    return {"path": rel, "page_count": pages, "size": len(data)}


@app.post("/files/create-from-bytes", dependencies=[Depends(require_key)])
async def create_from_bytes(payload: dict[str, Any]) -> dict[str, Any]:
    """Create a working PDF from base64 bytes (used by the Next.js server)."""
    import base64

    b64 = payload.get("data_b64", "")
    try:
        data = base64.b64decode(b64, validate=True)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid base64")
    if not data.startswith(b"%PDF"):
        raise HTTPException(status_code=400, detail="Not a valid PDF (bad signature)")
    fid = uuid.uuid4().hex
    dest_dir = WORK_ROOT / "inbox" / fid
    dest_dir.mkdir(parents=True, exist_ok=True)
    dest = dest_dir / "input.pdf"
    dest.write_bytes(data)
    try:
        with pikepdf.open(dest) as pdf:
            pages = len(pdf.pages)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Unopenable PDF: {type(e).__name__}")
    return {"path": str(dest.resolve().relative_to(WORK_ROOT)), "page_count": pages, "size": len(data)}


@app.get("/files/{file_path:path}", dependencies=[Depends(require_key)])
async def download_file(file_path: str) -> dict[str, Any]:
    import base64

    p = _resolve(file_path)
    _exists(p)
    return {"data_b64": base64.b64encode(p.read_bytes()).decode(), "size": p.stat().st_size}


@app.delete("/files/{file_path:path}", dependencies=[Depends(require_key)])
async def delete_file(file_path: str) -> dict[str, Any]:
    p = _resolve(file_path)
    if p.is_dir():
        shutil.rmtree(p, ignore_errors=True)
    elif p.exists():
        p.unlink()
    return {"deleted": True}


# ---------------------------------------------------------------- text ops


@app.post("/text/get", dependencies=[Depends(require_key)])
async def get_text(payload: dict[str, Any]) -> dict[str, Any]:
    """Extract text. page: 0-indexed or null for all pages."""
    p = _resolve(payload["path"])
    _exists(p)
    page = payload.get("page")
    try:
        text = engine.get_text(str(p), page=page)
    except PDFEditError as e:
        raise _engine_error(e)
    return {"text": text, "page": page}


@app.post("/text/layout", dependencies=[Depends(require_key)])
async def get_layout(payload: dict[str, Any]) -> dict[str, Any]:
    """Positioned text blocks (TextBlock list)."""
    p = _resolve(payload["path"])
    _exists(p)
    page = payload.get("page")
    try:
        blocks = engine.get_text_layout(str(p), page)
    except PDFEditError as e:
        raise _engine_error(e)
    return {"blocks": [
        {"text": b.text, "x": b.x, "y": b.y, "width": b.width, "height": b.height,
         "font_name": b.font_name, "font_size": b.font_size, "page": b.page}
        for b in blocks
    ]}


@app.post("/text/find", dependencies=[Depends(require_key)])
async def find_text(payload: dict[str, Any]) -> dict[str, Any]:
    """Find literal text. Returns serializable matches (match_id is the index)."""
    p = _resolve(payload["path"])
    _exists(p)
    try:
        matches = engine.find(
            str(p), payload["search_text"],
            page=payload.get("page"),
            case_sensitive=payload.get("case_sensitive", True),
        )
    except PDFEditError as e:
        raise _engine_error(e)
    out = []
    for i, m in enumerate(matches):
        out.append({
            "match_id": i,
            "matched_text": m.matched_text,
            "page_number": m.page_number,
            "bounding_box": list(m.bounding_box),
            "font_name": m.font_info.name,
            "font_size": m.characters[0].font_size if m.characters else None,
        })
    return {"matches": out, "count": len(out)}


@app.post("/text/extract-bbox", dependencies=[Depends(require_key)])
async def extract_bbox(payload: dict[str, Any]) -> dict[str, Any]:
    p = _resolve(payload["path"])
    _exists(p)
    try:
        text = engine.extract_bbox_text(
            str(p),
            bbox=tuple(payload["bbox"]),
            page=payload["page"],
            tolerance=payload.get("tolerance", 2.0),
        )
    except PDFEditError as e:
        raise _engine_error(e)
    return {"text": text}


def _match_from_find(pdf_path: str, search_text: str, match_id: int,
                    page: int | None, case_sensitive: bool) -> TextMatch:
    """Re-locate a match by index — matches are not serializable across processes."""
    matches = engine.find(pdf_path, search_text, page=page, case_sensitive=case_sensitive)
    if match_id < 0 or match_id >= len(matches):
        raise HTTPException(status_code=410,
                            detail="Stale match — re-run find (document changed)")
    return matches[match_id]


@app.post("/text/replace", dependencies=[Depends(require_key)])
async def replace_text(payload: dict[str, Any]) -> dict[str, Any]:
    """Replace ONE match (by re-finding). dry_run returns fidelity preview without writing."""
    p = _resolve(payload["path"])
    _exists(p)
    dry_run = bool(payload.get("dry_run", False))
    out_rel = payload.get("output_path") or f"outbox/{uuid.uuid4().hex}.pdf"
    out = _resolve(out_rel)
    out.parent.mkdir(parents=True, exist_ok=True)
    try:
        match = _match_from_find(
            str(p), payload["search_text"], int(payload["match_id"]),
            payload.get("page"), payload.get("case_sensitive", True),
        )
        result = engine.replace(str(p), match, payload["new_text"], str(out),
                                dry_run=dry_run)
    except HTTPException:
        raise
    except PDFEditError as e:
        raise _engine_error(e)
    resp = _edit_result_to_dict(result)
    resp.update({"output_path": None if dry_run else out_rel, "dry_run": dry_run})
    return resp


@app.post("/text/replace-all", dependencies=[Depends(require_key)])
async def replace_all(payload: dict[str, Any]) -> dict[str, Any]:
    p = _resolve(payload["path"])
    _exists(p)
    dry_run = bool(payload.get("dry_run", False))
    out_rel = payload.get("output_path") or f"outbox/{uuid.uuid4().hex}.pdf"
    out = _resolve(out_rel)
    out.parent.mkdir(parents=True, exist_ok=True)
    try:
        results = engine.replace_all(str(p), payload["search"], payload["replacement"],
                                     str(out), dry_run=dry_run)
    except PDFEditError as e:
        raise _engine_error(e)
    return {
        "results": [_edit_result_to_dict(r) for r in results],
        "count": len(results),
        "output_path": None if dry_run else out_rel,
        "dry_run": dry_run,
    }


@app.post("/text/batch-replace", dependencies=[Depends(require_key)])
async def batch_replace(payload: dict[str, Any]) -> dict[str, Any]:
    p = _resolve(payload["path"])
    _exists(p)
    dry_run = bool(payload.get("dry_run", False))
    out_rel = payload.get("output_path") or f"outbox/{uuid.uuid4().hex}.pdf"
    out = _resolve(out_rel)
    out.parent.mkdir(parents=True, exist_ok=True)
    edits = [Edit(find=e["find"], replace=e["replace"]) for e in payload["edits"]]
    try:
        results = engine.batch_replace(str(p), edits, str(out), dry_run=dry_run)
    except PDFEditError as e:
        raise _engine_error(e)
    return {
        "results": [_edit_result_to_dict(r) for r in results],
        "count": len(results),
        "output_path": None if dry_run else out_rel,
        "dry_run": dry_run,
    }


@app.post("/text/delete", dependencies=[Depends(require_key)])
async def delete_text(payload: dict[str, Any]) -> dict[str, Any]:
    """Delete text by replacing it with an empty string (single match)."""
    payload["new_text"] = ""
    payload["replacement"] = ""
    return await replace_text(payload)


# ---------------------------------------------------------------- structural ops


@app.post("/structural/replace-block", dependencies=[Depends(require_key)])
async def replace_block(payload: dict[str, Any]) -> dict[str, Any]:
    p = _resolve(payload["path"])
    _exists(p)
    out_rel = payload.get("output_path") or f"outbox/{uuid.uuid4().hex}.pdf"
    out = _resolve(out_rel)
    out.parent.mkdir(parents=True, exist_ok=True)
    try:
        r = engine.replace_block(
            str(p), payload["page_number"], tuple(payload["bbox"]), payload["new_text"],
            str(out), font_name=payload.get("font_name"),
            font_size=payload.get("font_size"), line_height=payload.get("line_height"),
            fit=payload.get("fit", "none"),
        )
    except PDFEditError as e:
        raise _engine_error(e)
    resp = _edit_result_to_dict(r)
    resp["output_path"] = out_rel
    return resp


@app.post("/structural/insert-text-block", dependencies=[Depends(require_key)])
async def insert_text_block(payload: dict[str, Any]) -> dict[str, Any]:
    p = _resolve(payload["path"])
    _exists(p)
    out_rel = payload.get("output_path") or f"outbox/{uuid.uuid4().hex}.pdf"
    out = _resolve(out_rel)
    out.parent.mkdir(parents=True, exist_ok=True)
    try:
        r = engine.insert_text_block(
            str(p), payload["page_number"], payload["x"], payload["y"],
            payload["text"], str(out), font_name=payload.get("font_name"),
            font_size=payload.get("font_size", 12.0), max_width=payload.get("max_width"),
        )
    except PDFEditError as e:
        raise _engine_error(e)
    resp = _edit_result_to_dict(r)
    resp["output_path"] = out_rel
    return resp


@app.post("/structural/delete-block", dependencies=[Depends(require_key)])
async def delete_block(payload: dict[str, Any]) -> dict[str, Any]:
    p = _resolve(payload["path"])
    _exists(p)
    out_rel = payload.get("output_path") or f"outbox/{uuid.uuid4().hex}.pdf"
    out = _resolve(out_rel)
    out.parent.mkdir(parents=True, exist_ok=True)
    try:
        r = engine.delete_block(str(p), payload["page_number"], tuple(payload["bbox"]),
                                str(out), close_gap=payload.get("close_gap", True))
    except PDFEditError as e:
        raise _engine_error(e)
    resp = _edit_result_to_dict(r)
    resp["output_path"] = out_rel
    return resp


# ---------------------------------------------------------------- page ops


def _page_op(payload: dict[str, Any]) -> tuple[Path, Path]:
    p = _resolve(payload["path"])
    _exists(p)
    out_rel = payload.get("output_path") or f"outbox/{uuid.uuid4().hex}.pdf"
    out = _resolve(out_rel)
    out.parent.mkdir(parents=True, exist_ok=True)
    return p, out


@app.post("/pages/rotate", dependencies=[Depends(require_key)])
async def rotate_pages(payload: dict[str, Any]) -> dict[str, Any]:
    p, out = _page_op(payload)
    try:
        rel = engine.rotate_pages(str(p), payload["pages"], int(payload["angle"]), str(out))
    except PDFEditError as e:
        raise _engine_error(e)
    return {"output_path": str(Path(rel).resolve().relative_to(WORK_ROOT))}


@app.post("/pages/delete", dependencies=[Depends(require_key)])
async def delete_pages(payload: dict[str, Any]) -> dict[str, Any]:
    p, out = _page_op(payload)
    try:
        rel = engine.delete_pages(str(p), payload["pages"], str(out))
    except PDFEditError as e:
        raise _engine_error(e)
    return {"output_path": str(Path(rel).resolve().relative_to(WORK_ROOT))}


@app.post("/pages/duplicate", dependencies=[Depends(require_key)])
async def duplicate_pages(payload: dict[str, Any]) -> dict[str, Any]:
    """Duplicate pages: build a new order with copies (uses reorder via pikepdf)."""
    p, out = _page_op(payload)
    page_indices = payload["pages"]  # pages to duplicate, appended once at end? spec: duplicate in place
    insertion_mode = payload.get("mode", "in_place")  # in_place | append
    try:
        with pikepdf.open(str(p)) as pdf:
            total = len(pdf.pages)
            for i in page_indices:
                if i < 0 or i >= total:
                    raise HTTPException(status_code=400, detail=f"page {i} out of range")
            if insertion_mode == "append":
                order = list(range(total)) + list(page_indices)
            else:
                order = []
                for i in range(total):
                    order.append(i)
                    if i in page_indices:
                        order.append(i)
            new_pdf = pikepdf.Pdf.new()
            for i in order:
                new_pdf.pages.append(pdf.pages[i])
            new_pdf.save(str(out))
    except HTTPException:
        raise
    except PDFEditError as e:
        raise _engine_error(e)
    return {"output_path": str(out.resolve().relative_to(WORK_ROOT))}


@app.post("/pages/reorder", dependencies=[Depends(require_key)])
async def reorder_pages(payload: dict[str, Any]) -> dict[str, Any]:
    p, out = _page_op(payload)
    try:
        rel = engine.reorder_pages(str(p), payload["page_order"], str(out))
    except PDFEditError as e:
        raise _engine_error(e)
    return {"output_path": str(Path(rel).resolve().relative_to(WORK_ROOT))}


@app.post("/pages/split", dependencies=[Depends(require_key)])
async def split_pdf(payload: dict[str, Any]) -> dict[str, Any]:
    p = _resolve(payload["path"])
    _exists(p)
    out_dir_rel = payload.get("output_dir") or f"outbox/{uuid.uuid4().hex}"
    out_dir = _resolve(out_dir_rel)
    try:
        outs = engine.split_pdf(str(p), str(out_dir))
    except PDFEditError as e:
        raise _engine_error(e)
    return {"output_paths": [str(Path(o).resolve().relative_to(WORK_ROOT)) for o in outs]}


@app.post("/pages/merge", dependencies=[Depends(require_key)])
async def merge_pdfs(payload: dict[str, Any]) -> dict[str, Any]:
    paths = [_resolve(x) for x in payload["paths"]]
    for x in paths:
        _exists(x)
    out_rel = payload.get("output_path") or f"outbox/{uuid.uuid4().hex}.pdf"
    out = _resolve(out_rel)
    out.parent.mkdir(parents=True, exist_ok=True)
    try:
        rel = engine.merge_pdfs([str(x) for x in paths], str(out))
    except PDFEditError as e:
        raise _engine_error(e)
    return {"output_path": str(Path(rel).resolve().relative_to(WORK_ROOT))}


@app.post("/pages/insert-blank", dependencies=[Depends(require_key)])
async def insert_blank_page(payload: dict[str, Any]) -> dict[str, Any]:
    p, out = _page_op(payload)
    at = int(payload.get("at", 0))  # index to insert at
    try:
        with pikepdf.open(str(p)) as pdf:
            total = len(pdf.pages)
            if at < 0 or at > total:
                raise HTTPException(status_code=400, detail="insert index out of range")
            blank = pikepdf.Dictionary(
                Type=pikepdf.Name.Page,
                MediaBox=[0, 0, float(payload.get("width", 612)), float(payload.get("height", 792))],
                Resources=pikepdf.Dictionary(),
                Contents=pikepdf.Stream(pdf, b""),
            )
            pdf.pages.insert(at, pikepdf.Page(pdf.make_indirect(blank)))
            pdf.save(str(out))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=422, detail={"error_type": type(e).__name__})
    return {"output_path": str(out.resolve().relative_to(WORK_ROOT))}


@app.post("/pages/create-blank", dependencies=[Depends(require_key)])
async def create_blank_pdf(payload: dict[str, Any]) -> dict[str, Any]:
    """Create a brand-new empty PDF (used for 'New Document')."""
    pages = max(1, int(payload.get("pages", 1)))
    width = float(payload.get("width", 612))
    height = float(payload.get("height", 792))
    out_rel = payload.get("output_path") or f"outbox/{uuid.uuid4().hex}.pdf"
    out = _resolve(out_rel)
    out.parent.mkdir(parents=True, exist_ok=True)
    try:
        pdf = pikepdf.Pdf.new()
        for _ in range(pages):
            blank = pikepdf.Dictionary(
                Type=pikepdf.Name.Page,
                MediaBox=[0, 0, width, height],
                Resources=pikepdf.Dictionary(),
            )
            pdf.pages.append(blank)
        pdf.save(str(out))
    except Exception as e:
        raise HTTPException(status_code=422, detail={"error_type": type(e).__name__})
    return {"output_path": str(out.resolve().relative_to(WORK_ROOT)), "page_count": pages}


# ---------------------------------------------------------------- annotations


@app.post("/annotations/list", dependencies=[Depends(require_key)])
async def list_annotations(payload: dict[str, Any]) -> dict[str, Any]:
    p = _resolve(payload["path"])
    _exists(p)
    try:
        annots = engine.get_annotations(str(p), page=payload.get("page"))
    except PDFEditError as e:
        raise _engine_error(e)
    return {"annotations": [
        {"index": a.index, "page": a.page, "subtype": a.subtype, "rect": list(a.rect),
         "uri": a.uri, "text": a.text} for a in annots
    ]}


@app.post("/annotations/highlight", dependencies=[Depends(require_key)])
async def highlight_text(payload: dict[str, Any]) -> dict[str, Any]:
    """Highlight matched text via engine.add_highlight (QuadPoints from match bboxes).

    Grouped by page; each additional page chains the output file, so multi-page
    highlights work in one call. Returns the final output path.
    """
    p = _resolve(payload["path"])
    _exists(p)
    out_rel = payload.get("output_path") or f"outbox/{uuid.uuid4().hex}.pdf"
    out = _resolve(out_rel)
    out.parent.mkdir(parents=True, exist_ok=True)
    try:
        matches = engine.find(str(p), payload["search_text"],
                             page=payload.get("page"),
                             case_sensitive=payload.get("case_sensitive", True))
        if not matches:
            raise HTTPException(status_code=404, detail="No matches to highlight")
        # QuadPoints: 8 floats per quad (ul, ur, lr, ll) in PDF coordinates
        by_page: dict[int, list[float]] = {}
        for m in matches:
            quads = by_page.setdefault(m.page_number, [])
            x0, y0, x1, y1 = m.bounding_box
            quads.extend([x0, y1, x1, y1, x1, y0, x0, y0])
        current = str(p)
        pages = sorted(by_page)
        total_quads = 0
        for i, pg in enumerate(pages):
            dest = (
                str(out)
                if i == len(pages) - 1
                else str(_resolve(f"tmp/{uuid.uuid4().hex}.pdf"))
            )
            Path(dest).parent.mkdir(parents=True, exist_ok=True)
            engine.add_highlight(current, pg, by_page[pg], dest)
            total_quads += len(by_page[pg]) // 8
            current = dest
    except HTTPException:
        raise
    except PDFEditError as e:
        raise _engine_error(e)
    return {"output_path": out_rel, "count": total_quads}


@app.post("/annotations/add", dependencies=[Depends(require_key)])
async def add_annotation(payload: dict[str, Any]) -> dict[str, Any]:
    """Add a generic annotation (built on pikepdf, engine-compatible)."""
    p = _resolve(payload["path"])
    _exists(p)
    out_rel = payload.get("output_path") or f"outbox/{uuid.uuid4().hex}.pdf"
    out = _resolve(out_rel)
    out.parent.mkdir(parents=True, exist_ok=True)
    subtype = payload["subtype"]  # Text (sticky note), Square, Circle, Ink, FreeText, Line, Underline, StrikeOut
    page = int(payload["page"])
    rect = [float(x) for x in payload["rect"]]
    data = payload.get("data", {})
    colors = {"yellow": [1, 1, 0], "red": [1, 0, 0], "green": [0, 0.8, 0],
               "blue": [0, 0.4, 1], "purple": [0.6, 0.2, 0.9], "black": [0, 0, 0]}
    color = colors.get(data.get("color", "yellow"), [1, 1, 0])
    try:
        with pikepdf.open(str(p), allow_overwriting_input=False) as pdf:
            if page < 0 or page >= len(pdf.pages):
                raise HTTPException(status_code=400, detail="page out of range")
            pg = pdf.pages[page]
            annot = pikepdf.Dictionary(
                Type=pikepdf.Name.Annot,
                Subtype=pikepdf.Name(f"/{subtype}"),
                Rect=rect,
                C=color,
                CA=float(data.get("opacity", 0.4)),
                T=(data.get("author") or "EDITOR"),
                Contents=(data.get("contents") or ""),
                M=str(payload.get("created_at", "")),
            )
            if subtype in ("Ink",) and "ink_list" in data:
                annot.InkList = [float(x) for x in data["ink_list"]]
            if subtype in ("Square", "Circle", "Line", "Underline", "StrikeOut") and data.get("quad_points"):
                annot.QuadPoints = [float(x) for x in data["quad_points"]]
            pg.Annots = pg.get("/Annots", pikepdf.Array([])) + pikepdf.Array([annot])
            pdf.save(str(out))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=422, detail={"error_type": type(e).__name__})
    return {"output_path": out_rel}


@app.post("/annotations/delete", dependencies=[Depends(require_key)])
async def delete_annotation(payload: dict[str, Any]) -> dict[str, Any]:
    p = _resolve(payload["path"])
    _exists(p)
    out_rel = payload.get("output_path") or f"outbox/{uuid.uuid4().hex}.pdf"
    out = _resolve(out_rel)
    out.parent.mkdir(parents=True, exist_ok=True)
    try:
        annots = engine.get_annotations(str(p), page=payload.get("page"))
        target = next((a for a in annots
                       if a.page == payload["page"] and a.index == payload["index"]), None)
        if target is None:
            raise HTTPException(status_code=404, detail="annotation not found")
        engine.delete_annotation(str(p), target, str(out))
    except HTTPException:
        raise
    except PDFEditError as e:
        raise _engine_error(e)
    return {"output_path": out_rel}


# ---------------------------------------------------------------- TRUE REDACTION


@app.post("/redact/apply", dependencies=[Depends(require_key)])
async def redact_apply(payload: dict[str, Any]) -> dict[str, Any]:
    """True redaction: remove underlying text content AND draw a solid cover box.

    Built ON TOP of the engine (delete_block + pikepdf cover), so the original
    engine stays unmodified. Regions: [{page, bbox:[x0,y0,x1,y1]}].
    Optionally also remove annotations intersecting the region.
    """
    p = _resolve(payload["path"])
    _exists(p)
    out_rel = payload.get("output_path") or f"outbox/{uuid.uuid4().hex}.pdf"
    out = _resolve(out_rel)
    out.parent.mkdir(parents=True, exist_ok=True)
    regions = payload.get("regions", [])
    remove_annots = bool(payload.get("remove_annotations", True))

    # Phase 1: content removal via engine.delete_block per region (no gap close)
    current = str(p)
    warnings: list[str] = []
    for region in regions:
        pg = int(region["page"])
        bbox = tuple(float(x) for x in region["bbox"])
        tmp_out = _resolve(f"tmp/{uuid.uuid4().hex}.pdf")
        tmp_out.parent.mkdir(parents=True, exist_ok=True)
        try:
            result = engine.delete_block(current, pg, bbox, str(tmp_out), close_gap=False)
            if not result.success:
                warnings.append(f"page {pg}: redaction content removal reported failure")
            warnings.extend(result.warnings)
        except PDFEditError as e:
            raise _engine_error(e)
        current = str(tmp_out)

    # Phase 2: draw cover boxes + strip intersecting annotations with pikepdf
    try:
        with pikepdf.open(current) as pdf:
            for region in regions:
                pg = int(region["page"])
                if pg < 0 or pg >= len(pdf.pages):
                    continue
                page_obj = pdf.pages[pg]
                x0, y0, x1, y1 = [float(v) for v in region["bbox"]]
                ops = f"q {x1 - x0} 0 0 {y1 - y0} {x0} {y0} cm 0 0 0 rg 0 0 0 RG 0 0 m 1 0 l 1 1 l 0 1 l h f Q"
                content = pikepdf.Stream(pdf, ops.encode())
                if "/Contents" in page_obj:
                    page_obj.Contents = pdf.make_indirect(
                        pikepdf.Array([page_obj.Contents, content])
                    )
                else:
                    page_obj.Contents = pdf.make_indirect(content)
                if remove_annots and "/Annots" in page_obj:
                    kept = pikepdf.Array()
                    for a in page_obj.Annots:
                        ar = a.get("/Rect")
                        if ar is None or len(ar) < 4:
                            continue
                        ax0, ay0, ax1, ay1 = [float(v) for v in ar]
                        # drop annotation if it intersects the redaction box
                        if not (ax1 < x0 or ax0 > x1 or ay1 < y0 or ay0 > y1):
                            continue
                        kept.append(a)
                    page_obj.Annots = kept
            pdf.save(str(out))
    except Exception as e:
        raise HTTPException(status_code=422, detail={"error_type": type(e).__name__})
    finally:
        # cleanup temp chain
        tmp_dir = WORK_ROOT / "tmp"
        if tmp_dir.exists():
            shutil.rmtree(tmp_dir, ignore_errors=True)

    return {"output_path": out_rel, "regions": len(regions), "warnings": warnings}


@app.post("/redact/preview", dependencies=[Depends(require_key)])
async def redact_preview(payload: dict[str, Any]) -> dict[str, Any]:
    """Preview what a redaction would remove (extract text in regions)."""
    p = _resolve(payload["path"])
    _exists(p)
    regions = payload.get("regions", [])
    previews = []
    for region in regions:
        try:
            text = engine.extract_bbox_text(str(p), bbox=tuple(region["bbox"]),
                                            page=int(region["page"]))
        except PDFEditError as e:
            raise _engine_error(e)
        previews.append({"page": region["page"], "bbox": region["bbox"], "text": text.strip()})
    return {"previews": previews}


# ---------------------------------------------------------------- misc ops


@app.post("/pdf/metadata", dependencies=[Depends(require_key)])
async def edit_metadata(payload: dict[str, Any]) -> dict[str, Any]:
    p, out = _page_op(payload)
    try:
        rel = engine.edit_metadata(str(p), payload["metadata"], str(out))
    except PDFEditError as e:
        raise _engine_error(e)
    return {"output_path": str(Path(rel).resolve().relative_to(WORK_ROOT))}


@app.post("/pdf/watermark", dependencies=[Depends(require_key)])
async def add_watermark(payload: dict[str, Any]) -> dict[str, Any]:
    p, out = _page_op(payload)
    wm = _resolve(payload["watermark_path"])
    _exists(wm)
    try:
        rel = engine.add_watermark(str(p), str(wm), str(out))
    except PDFEditError as e:
        raise _engine_error(e)
    return {"output_path": str(Path(rel).resolve().relative_to(WORK_ROOT))}


@app.post("/pdf/encrypt", dependencies=[Depends(require_key)])
async def encrypt_pdf(payload: dict[str, Any]) -> dict[str, Any]:
    p, out = _page_op(payload)
    try:
        rel = engine.encrypt_pdf(str(p), payload["owner_pass"], payload["user_pass"], str(out))
    except PDFEditError as e:
        raise _engine_error(e)
    return {"output_path": str(Path(rel).resolve().relative_to(WORK_ROOT))}


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "engine": engine.__version__}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=int(os.environ.get("ENGINE_PORT", "8000")))
