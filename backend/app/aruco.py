from dataclasses import dataclass

import cv2
import numpy as np


@dataclass
class ArucoResult:
    aruco_dictionary: str | None
    marker_ids: list[int]
    blur_variance: float
    mean_brightness: float
    pose_rvec: list[float] | None
    pose_tvec_mm: list[float] | None
    accepted: bool
    reasons: list[str]


SUPPORTED_DICTIONARIES = (
    "DICT_4X4_50", "DICT_4X4_100", "DICT_4X4_250", "DICT_4X4_1000",
    "DICT_5X5_50", "DICT_5X5_100", "DICT_5X5_250", "DICT_5X5_1000",
    "DICT_6X6_50", "DICT_6X6_100", "DICT_6X6_250", "DICT_6X6_1000",
    "DICT_7X7_50", "DICT_7X7_100", "DICT_7X7_250", "DICT_7X7_1000",
    "DICT_ARUCO_ORIGINAL", "DICT_APRILTAG_16h5", "DICT_APRILTAG_25h9",
    "DICT_APRILTAG_36h10", "DICT_APRILTAG_36h11",
)


def inspect_image(image_bytes: bytes, marker_length_mm: float, expected_ids: set[int], aruco_dictionary: str = "AUTO") -> ArucoResult:
    raw = np.frombuffer(image_bytes, dtype=np.uint8)
    image = cv2.imdecode(raw, cv2.IMREAD_COLOR)
    if image is None:
        raise ValueError("The upload is not a readable image.")

    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    blur = float(cv2.Laplacian(gray, cv2.CV_64F).var())
    brightness = float(gray.mean())
    dictionary_name, corners, ids = _detect_markers(gray, expected_ids, aruco_dictionary)
    marker_ids = [] if ids is None else [int(item) for item in ids.flatten()]

    reasons: list[str] = []
    if blur < 80:
        reasons.append("Image is too blurred; hold the phone still and refocus.")
    if brightness < 35:
        reasons.append("Image is too dark; add diffuse lighting.")
    if brightness > 235:
        reasons.append("Image is overexposed; reduce glare or exposure.")
    missing = expected_ids.difference(marker_ids)
    if missing:
        reasons.append(f"Required marker IDs not visible: {sorted(missing)}.")

    rvec, tvec = _estimate_first_pose(corners, marker_length_mm, image.shape)
    return ArucoResult(
        aruco_dictionary=dictionary_name,
        marker_ids=marker_ids,
        blur_variance=round(blur, 2),
        mean_brightness=round(brightness, 2),
        pose_rvec=rvec,
        pose_tvec_mm=tvec,
        accepted=not reasons,
        reasons=reasons,
    )


def _detect_markers(gray: np.ndarray, expected_ids: set[int], requested: str):
    names = SUPPORTED_DICTIONARIES if requested == "AUTO" else (requested,)
    candidates = []
    parameters = cv2.aruco.DetectorParameters()
    parameters.cornerRefinementMethod = cv2.aruco.CORNER_REFINE_SUBPIX
    for name in names:
        dictionary_id = getattr(cv2.aruco, name, None)
        if dictionary_id is None:
            continue
        corners, ids, _ = cv2.aruco.ArucoDetector(cv2.aruco.getPredefinedDictionary(dictionary_id), parameters).detectMarkers(gray)
        detected_ids = set() if ids is None else {int(item) for item in ids.flatten()}
        # Prefer detections containing a requested marker; then prefer more markers.
        candidates.append((len(detected_ids & expected_ids), len(detected_ids), name, corners, ids))
    if not candidates:
        return None, [], None
    _, _, name, corners, ids = max(candidates, key=lambda candidate: (candidate[0], candidate[1]))
    return name if ids is not None else None, corners, ids


def _estimate_first_pose(corners: list[np.ndarray], marker_length_mm: float, shape: tuple[int, ...]):
    """Pose is approximate until per-device camera intrinsics are supplied."""
    if not corners:
        return None, None
    height, width = shape[:2]
    focal = float(max(width, height))
    camera_matrix = np.array([[focal, 0, width / 2], [0, focal, height / 2], [0, 0, 1]], dtype=np.float64)
    half = marker_length_mm / 2
    object_points = np.array([[-half, half, 0], [half, half, 0], [half, -half, 0], [-half, -half, 0]], dtype=np.float64)
    ok, rvec, tvec = cv2.solvePnP(object_points, corners[0].reshape(4, 2), camera_matrix, None)
    if not ok:
        return None, None
    return rvec.flatten().round(5).tolist(), tvec.flatten().round(3).tolist()
