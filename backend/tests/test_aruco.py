import cv2
import numpy as np

from app.aruco import inspect_image


def test_recognizes_required_marker():
    marker = cv2.aruco.generateImageMarker(
        cv2.aruco.getPredefinedDictionary(cv2.aruco.DICT_4X4_100), 7, 600
    )
    canvas = np.full((800, 800), 255, dtype=np.uint8)
    canvas[100:700, 100:700] = marker
    ok, encoded = cv2.imencode(".png", canvas)
    assert ok
    result = inspect_image(encoded.tobytes(), 50, {7})
    assert result.accepted
    assert result.marker_ids == [7]
