from datetime import date
from typing import Optional

from pydantic import BaseModel, field_validator


ALLOWED_MODELS = {"gemini-2.5-flash", "gemini-2.5-pro"}


class RunCreate(BaseModel):
    ticker: str
    analysis_date: Optional[date] = None

    @field_validator("ticker")
    @classmethod
    def normalise_ticker(cls, v: str) -> str:
        v = v.upper().strip()
        if not v:
            raise ValueError("ticker cannot be empty")
        return v


class RunCreateResponse(BaseModel):
    run_id: int
    status: str


class RunStatusResponse(BaseModel):
    status: str
    progress_message: str


class ConfigRead(BaseModel):
    deep_think_llm: str
    quick_think_llm: str
    default_date_offset_days: int
    allowed_models: list[str]


class ConfigUpdate(BaseModel):
    deep_think_llm: Optional[str] = None
    quick_think_llm: Optional[str] = None

    @field_validator("deep_think_llm", "quick_think_llm", mode="before")
    @classmethod
    def validate_model(cls, v):
        if v is not None and v not in ALLOWED_MODELS:
            raise ValueError(f"model must be one of {sorted(ALLOWED_MODELS)}")
        return v
