from datetime import datetime
from typing import Any, List, Optional

from pydantic import BaseModel, field_validator


class RunCreate(BaseModel):
    ticker: str
    analysis_date: Optional[str] = None  # "YYYY-MM-DD"; omit to use default offset

    @field_validator("ticker")
    @classmethod
    def normalise_ticker(cls, v: str) -> str:
        v = v.strip().upper()
        if not v.isalpha() or not (1 <= len(v) <= 5):
            raise ValueError("Ticker must be 1–5 letters")
        return v


class RunCreatedResponse(BaseModel):
    run_id: int
    status: str
    warning: Optional[str] = None


class RunStatusResponse(BaseModel):
    run_id: int
    status: str
    progress_message: Optional[str] = None
    is_stale: bool = False


class RunSummary(BaseModel):
    id: int
    ticker: str
    analysis_date: str
    run_timestamp: datetime
    status: str
    recommendation: Optional[str] = None

    model_config = {"from_attributes": True}


class RunDetail(BaseModel):
    id: int
    ticker: str
    analysis_date: str
    run_timestamp: datetime
    status: str
    recommendation: Optional[str] = None
    confidence: Optional[str] = None
    analyst_reports: Optional[Any] = None
    final_report: Optional[str] = None
    risk_assessment: Optional[Any] = None
    translations: Optional[Any] = None   # Chinese translations keyed by section name
    model_used: Optional[str] = None
    error_message: Optional[str] = None
    is_stale: bool = False

    model_config = {"from_attributes": True}


VALID_FREQUENCIES = {"daily", "weekly", "biweekly", "monthly"}


class ScheduleCreate(BaseModel):
    ticker: str
    frequency: str
    recipients: List[str] = []

    @field_validator("ticker")
    @classmethod
    def normalise_ticker(cls, v: str) -> str:
        v = v.strip().upper()
        if not v.isalpha() or not (1 <= len(v) <= 5):
            raise ValueError("Ticker must be 1–5 letters")
        return v

    @field_validator("frequency")
    @classmethod
    def validate_frequency(cls, v: str) -> str:
        if v not in VALID_FREQUENCIES:
            raise ValueError(f"frequency must be one of {sorted(VALID_FREQUENCIES)}")
        return v


class ScheduleUpdate(BaseModel):
    is_active: Optional[bool] = None
    recipients: Optional[List[str]] = None
    frequency: Optional[str] = None

    @field_validator("frequency")
    @classmethod
    def validate_frequency(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v not in VALID_FREQUENCIES:
            raise ValueError(f"frequency must be one of {sorted(VALID_FREQUENCIES)}")
        return v


class ScheduleResponse(BaseModel):
    id: int
    ticker: str
    frequency: str
    is_active: bool
    recipients: List[str]
    created_at: datetime
    last_run_at: Optional[datetime] = None
    last_run_id: Optional[int] = None
    next_run_at: Optional[datetime] = None

    model_config = {"from_attributes": True}
