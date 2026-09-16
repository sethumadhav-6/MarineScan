import os
from io import BytesIO
from pathlib import Path
from uuid import uuid4
from zipfile import ZIP_DEFLATED, ZipFile

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles

from .aruco import inspect_image
from .schemas import CaptureSession, CaptureSessionCreate, ImageQuality

app = FastAPI(title="MarineScan Processing API", version="0.1.0")
# Vercel's deployed files are read-only. Its /tmp directory is writable but is
# temporary, so this supports a prototype capture session only. Production must
# use persistent object storage (S3/R2/Supabase Storage).
storage_root = (
    Path("/tmp/marinescan/captures")
    if os.getenv("VERCEL")
    else Path("data/captures")
)
sessions: dict[str, CaptureSession] = {}
web_root = Path(__file__).parent / "web"
app.mount("/assets", StaticFiles(directory=web_root), name="assets")


@app.get("/", include_in_schema=False)
def capture_app() -> FileResponse:
    return FileResponse(web_root / "index.html")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/sessions", response_model=CaptureSession, status_code=201)
def create_session(payload: CaptureSessionCreate) -> CaptureSession:
    session = CaptureSession(id=str(uuid4()), **payload.model_dump())
    sessions[session.id] = session
    (storage_root / session.id).mkdir(parents=True, exist_ok=True)
    return session


@app.get("/sessions/{session_id}", response_model=CaptureSession)
def get_session(session_id: str) -> CaptureSession:
    session = sessions.get(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Capture session not found.")
    return session


@app.get("/sessions/{session_id}/export.zip")
def export_session(session_id: str) -> StreamingResponse:
    """Download the accepted original images for desktop photogrammetry."""
    session = get_session(session_id)
    image_dir = storage_root / session_id
    image_paths = sorted(path for path in image_dir.glob("*") if path.is_file())
    if not image_paths:
        raise HTTPException(status_code=404, detail="No accepted images are available for export.")

    archive = BytesIO()
    with ZipFile(archive, "w", ZIP_DEFLATED) as zip_file:
        for image_path in image_paths:
            zip_file.write(image_path, arcname=image_path.name)
    archive.seek(0)
    filename = f"marinescan-{session.specimen_label.replace(' ', '-')}-{session_id[:8]}.zip"
    return StreamingResponse(
        archive,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@app.post("/sessions/{session_id}/images", response_model=ImageQuality)
async def upload_image(session_id: str, image: UploadFile = File(...)) -> ImageQuality:
    session = get_session(session_id)
    payload = await image.read()
    try:
        result = inspect_image(payload, session.marker_length_mm, set(session.expected_marker_ids))
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    if result.accepted:
        filename = f"{session.image_count:04d}_{Path(image.filename or 'capture.jpg').name}"
        (storage_root / session_id / filename).write_bytes(payload)
        session.image_count += 1
    return ImageQuality(**result.__dict__)
