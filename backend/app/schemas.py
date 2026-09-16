from pydantic import BaseModel, Field


class CaptureSessionCreate(BaseModel):
    specimen_label: str = Field(min_length=1, max_length=120)
    marker_length_mm: float = Field(gt=1, le=1_000)
    expected_marker_ids: list[int] = Field(min_length=1, max_length=50)


class ImageQuality(BaseModel):
    marker_ids: list[int]
    blur_variance: float
    mean_brightness: float
    pose_rvec: list[float] | None = None
    pose_tvec_mm: list[float] | None = None
    accepted: bool
    reasons: list[str]


class CaptureSession(BaseModel):
    id: str
    specimen_label: str
    marker_length_mm: float
    expected_marker_ids: list[int]
    image_count: int = 0
