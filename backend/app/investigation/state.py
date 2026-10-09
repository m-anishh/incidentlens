"""The one object passed between investigation steps.

The linear pipeline threads it through functions today; LangGraph will use the
same model as its graph state at step 9. Baseline and onset are deliberately
separate fields with different shapes — not one evidence blob.
"""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class AlertInfo(BaseModel):
    fingerprint: str
    alertname: str
    labels: dict[str, str]
    annotations: dict[str, str]
    starts_at: datetime
    for_duration_s: int
    for_from_annotation: bool  # False → fell back to config, and the report says so


class Window(BaseModel):
    """[start, onset_start) is baseline; [onset_start, end] is onset → now."""
    start: datetime
    onset_start: datetime
    end: datetime


class SeriesAggregate(BaseModel):
    """Baseline portion: a few numbers per series, never raw points."""
    metric: str
    unit: str
    labels: dict[str, str]
    mean: float
    p95: float
    samples: int


class OnsetSeries(BaseModel):
    """Onset portion: downsampled points, (seconds since onset_start, value)."""
    metric: str
    unit: str
    labels: dict[str, str]
    points: list[tuple[int, float]]


class Contrast(BaseModel):
    """Pre-computed baseline → incident comparison, so the LLM doesn't diff series."""
    metric: str
    unit: str
    labels: dict[str, str]
    baseline_mean: float | None
    incident_mean: float
    incident_peak: float
    ratio: float | None  # incident_peak / baseline_mean; None when there is no baseline
    summary: str


class LogPattern(BaseModel):
    service: str
    level: str
    msg: str
    baseline_count: int
    incident_count: int
    samples: list[str] = Field(default_factory=list)


class BaselineQuality(BaseModel):
    weak: bool = False
    reasons: list[str] = Field(default_factory=list)


class Report(BaseModel):
    summary: str
    probable_cause: str
    cause_service: str
    confidence: Literal["low", "medium", "high"]
    evidence: list[str]
    reasoning: str
    suggested_fix: str
    evidence_gaps: list[str]


class InvestigationState(BaseModel):
    run_id: int
    incident_id: int
    alert: AlertInfo
    window: Window | None = None

    baseline: list[SeriesAggregate] = Field(default_factory=list)
    onset: list[OnsetSeries] = Field(default_factory=list)
    contrast: list[Contrast] = Field(default_factory=list)
    logs: list[LogPattern] = Field(default_factory=list)
    baseline_quality: BaselineQuality = Field(default_factory=BaselineQuality)

    missing_sources: list[str] = Field(default_factory=list)  # unreachable → partial
    query_errors: list[str] = Field(default_factory=list)     # rejected queries; source was up
    findings: list[str] = Field(default_factory=list)
    report: Report | None = None
    step_count: int = 0
