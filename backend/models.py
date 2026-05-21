from datetime import datetime
from typing import Optional

from sqlmodel import Field, SQLModel


class ScheduledRun(SQLModel, table=True):
    __tablename__ = "scheduled_runs"

    id: Optional[int] = Field(default=None, primary_key=True)
    ticker: str
    frequency: str  # "daily" | "weekly" | "biweekly" | "monthly"
    is_active: bool = Field(default=True)
    recipients: str = Field(default="[]")  # JSON array of email strings
    created_at: datetime = Field(default_factory=datetime.utcnow)
    last_run_at: Optional[datetime] = None
    last_run_id: Optional[int] = None


class ResearchRun(SQLModel, table=True):
    __tablename__ = "research_runs"

    id: Optional[int] = Field(default=None, primary_key=True)
    ticker: str
    analysis_date: str  # "YYYY-MM-DD"
    run_timestamp: datetime = Field(default_factory=datetime.utcnow)
    status: str = Field(default="pending")  # pending / running / complete / failed
    progress_message: Optional[str] = None
    recommendation: Optional[str] = None   # Buy / Overweight / Hold / Underweight / Sell
    confidence: Optional[str] = None
    analyst_reports: Optional[str] = None  # JSON blob
    final_report: Optional[str] = None
    risk_assessment: Optional[str] = None  # JSON blob
    translations: Optional[str] = None     # JSON blob — Chinese translations of all sections
    model_used: Optional[str] = None
    error_message: Optional[str] = None
