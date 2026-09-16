# MarineScan

Cross-platform mobile capture and Python processing for metric 3D models of fish and marine organisms.

## Components

- `mobile/` — Flutter app for Android and iOS. It will guide capture, run live quality checks, and upload a capture session.
- `backend/` — FastAPI service for full-resolution ArUco detection, image validation, storage, and reconstruction-job orchestration.

## First milestone

The current prototype validates every uploaded image against an ArUco board. It records marker IDs, approximate pose, blur, and exposure. A capture is accepted only when the expected marker IDs are visible. This creates a dependable metric reference before photogrammetry begins.

## Run the backend

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --reload
```

Open `http://127.0.0.1:8000` for the browser-based capture app, or `http://127.0.0.1:8000/docs` for the API documentation. To use a phone camera, open the computer's LAN IP (for example, `http://192.168.1.20:8000`) while both devices use the same Wi-Fi.

## Calibration and field protocol

1. Print the board at 100% scale on matte waterproof material and measure one marker with calipers.
2. Set `marker_length_mm` and the expected marker IDs when creating a session.
3. Calibrate each mobile camera (and each underwater housing/tank setup) before a survey.
4. Keep the specimen motionless; use 70–80% image overlap and include the marker board in enough images to constrain scale.
5. Process original, non-resized images. Do not apply beauty filters, digital zoom, or platform recompression.

For moving animals, use a multi-camera or synchronized burst rig. Sequential photogrammetry cannot reconstruct a moving fish precisely.

## Reconstruction adapter

`backend/app/reconstruction.py` deliberately defines an engine interface. The next phase should add a WebODM/NodeODM adapter if its outputs meet the close-range test dataset; otherwise use a close-range SfM/MVS engine such as COLMAP/OpenMVS. The metric ArUco preprocessing remains the same in either case.
