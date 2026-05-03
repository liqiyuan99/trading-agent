from datetime import date, datetime
from typing import Optional

from sqlmodel import Field, SQLModel


class ResearchRun(SQLModel, table=True):
    __tablename__ = "research_runs"

    id: Optional[int] = Field(default=None, primary_key=True)
    ticker: str
    analysis_date: date
    run_timestamp: datetime = Field(default_factory=datetime.utcnow)
    started_at: Optional[datetime] = None
    status: str = "pending"  # pending / running / complete / failed
    recommendation: Optional[str] = None
    analyst_reports: Optional[str] = None  # JSON text
    final_report: Optional[str] = None
    risk_assessment: Optional[str] = None  # JSON text
    model_used: Optional[str] = None
    error_message: Optional[str] = None


class AppConfig(SQLModel, table=True):
    __tablename__ = "app_config"

    id: int = Field(default=1, primary_key=True)  # singleton row
    deep_think_llm: str = "gemini-2.5-pro"
    quick_think_llm: str = "gemini-2.5-flash"
