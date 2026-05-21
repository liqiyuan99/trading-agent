import json
import os
from contextlib import asynccontextmanager
from datetime import date, datetime, timedelta
from typing import List, Optional

from dotenv import load_dotenv
load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), "..", ".env"))

from fastapi import BackgroundTasks, Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text
from sqlmodel import Session, select

import scheduler as sched
from agent_runner import run_analysis
from database import engine, get_session, init_db
from emailer import is_configured as email_is_configured
from models import ResearchRun, ScheduledRun
from schemas import (
    RunCreate, RunCreatedResponse, RunDetail, RunStatusResponse, RunSummary,
    ScheduleCreate, ScheduleResponse, ScheduleUpdate,
)

STALE_THRESHOLD_SECONDS = 30 * 60


def _check_required_env() -> None:
    if not os.getenv("GOOGLE_API_KEY"):
        raise RuntimeError(
            "GOOGLE_API_KEY is not set. Add it to your .env file and restart the server."
        )


def _is_stale(run: ResearchRun) -> bool:
    if run.status != "running":
        return False
    elapsed = (datetime.utcnow() - run.run_timestamp).total_seconds()
    return elapsed > STALE_THRESHOLD_SECONDS


def _to_detail(run: ResearchRun) -> RunDetail:
    return RunDetail(
        id=run.id,
        ticker=run.ticker,
        analysis_date=run.analysis_date,
        run_timestamp=run.run_timestamp,
        status=run.status,
        recommendation=run.recommendation,
        confidence=run.confidence,
        analyst_reports=json.loads(run.analyst_reports) if run.analyst_reports else None,
        final_report=run.final_report,
        risk_assessment=json.loads(run.risk_assessment) if run.risk_assessment else None,
        translations=json.loads(run.translations) if run.translations else None,
        model_used=run.model_used,
        error_message=run.error_message,
        is_stale=_is_stale(run),
    )


@asynccontextmanager
async def lifespan(app: FastAPI):
    _check_required_env()
    init_db()
    # Migrate existing DBs — add new columns if they don't exist yet
    with engine.connect() as conn:
        for col_sql in [
            "ALTER TABLE research_runs ADD COLUMN translations TEXT",
        ]:
            try:
                conn.execute(text(col_sql))
                conn.commit()
            except Exception:
                pass  # column already exists
    # Reset any jobs orphaned by a previous server crash/restart
    with Session(engine) as session:
        orphaned = session.exec(
            select(ResearchRun).where(ResearchRun.status == "running")
        ).all()
        for run in orphaned:
            run.status = "failed"
            run.error_message = "Server restarted mid-run"
            run.progress_message = None
            session.add(run)
        if orphaned:
            session.commit()
    sched.start()
    yield
    sched.stop()


app = FastAPI(title="StockResearch API", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Health & settings
# ---------------------------------------------------------------------------

@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.get("/api/settings")
def get_settings():
    return {
        "deep_think_model": os.getenv("TRADINGAGENTS_DEEP_THINK_LLM", "gemini-2.5-flash"),
        "quick_think_model": os.getenv("TRADINGAGENTS_QUICK_THINK_LLM", "gemini-2.5-flash-lite"),
        "default_date_offset_days": int(os.getenv("DEFAULT_DATE_OFFSET_DAYS", "3")),
        "analysis_timeout_minutes": int(os.getenv("ANALYSIS_TIMEOUT_SECONDS", str(45 * 60))) // 60,
        "email_configured": email_is_configured(),
        "schedule_timezone": os.getenv("SCHEDULE_TIMEZONE", "UTC"),
        "schedule_run_hour": int(os.getenv("SCHEDULE_RUN_HOUR", "6")),
    }


# ---------------------------------------------------------------------------
# Runs
# ---------------------------------------------------------------------------

@app.get("/api/runs", response_model=List[RunSummary])
def list_runs(
    ticker: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
    session: Session = Depends(get_session),
):
    query = select(ResearchRun).order_by(ResearchRun.run_timestamp.desc())
    if ticker:
        query = query.where(ResearchRun.ticker == ticker.strip().upper())
    return session.exec(query.offset(offset).limit(limit)).all()


@app.get("/api/runs/{run_id}/status", response_model=RunStatusResponse)
def get_run_status(run_id: int, session: Session = Depends(get_session)):
    run = session.get(ResearchRun, run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    return RunStatusResponse(
        run_id=run.id,
        status=run.status,
        progress_message=run.progress_message,
        is_stale=_is_stale(run),
    )


@app.get("/api/runs/{run_id}", response_model=RunDetail)
def get_run(run_id: int, session: Session = Depends(get_session)):
    run = session.get(ResearchRun, run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    return _to_detail(run)


@app.delete("/api/runs/{run_id}", status_code=204)
def delete_run(run_id: int, session: Session = Depends(get_session)):
    run = session.get(ResearchRun, run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    session.delete(run)
    session.commit()
    return Response(status_code=204)


@app.post("/api/runs", response_model=RunCreatedResponse, status_code=201)
def create_run(
    body: RunCreate,
    background_tasks: BackgroundTasks,
    session: Session = Depends(get_session),
):
    active = session.exec(
        select(ResearchRun).where(ResearchRun.status.in_(["pending", "running"]))
    ).first()

    offset = int(os.getenv("DEFAULT_DATE_OFFSET_DAYS", "3"))
    analysis_date = body.analysis_date or str(date.today() - timedelta(days=offset))

    run = ResearchRun(ticker=body.ticker, analysis_date=analysis_date)
    session.add(run)
    session.commit()
    session.refresh(run)

    background_tasks.add_task(run_analysis, run.id, body.ticker, analysis_date)

    return RunCreatedResponse(
        run_id=run.id,
        status=run.status,
        warning=(
            "Another run is already active — concurrent runs may hit Gemini rate limits."
            if active else None
        ),
    )


# ---------------------------------------------------------------------------
# Schedules
# ---------------------------------------------------------------------------

def _to_schedule_response(s: ScheduledRun) -> ScheduleResponse:
    return ScheduleResponse(
        id=s.id,
        ticker=s.ticker,
        frequency=s.frequency,
        is_active=s.is_active,
        recipients=json.loads(s.recipients or "[]"),
        created_at=s.created_at,
        last_run_at=s.last_run_at,
        last_run_id=s.last_run_id,
        next_run_at=sched.next_run_at(s.id),
    )


@app.get("/api/schedules", response_model=List[ScheduleResponse])
def list_schedules(session: Session = Depends(get_session)):
    schedules = session.exec(select(ScheduledRun).order_by(ScheduledRun.created_at.desc())).all()
    return [_to_schedule_response(s) for s in schedules]


@app.post("/api/schedules", response_model=ScheduleResponse, status_code=201)
def create_schedule(body: ScheduleCreate, session: Session = Depends(get_session)):
    s = ScheduledRun(
        ticker=body.ticker,
        frequency=body.frequency,
        recipients=json.dumps(body.recipients),
    )
    session.add(s)
    session.commit()
    session.refresh(s)
    sched.register(s)
    return _to_schedule_response(s)


@app.patch("/api/schedules/{schedule_id}", response_model=ScheduleResponse)
def update_schedule(
    schedule_id: int,
    body: ScheduleUpdate,
    session: Session = Depends(get_session),
):
    s = session.get(ScheduledRun, schedule_id)
    if not s:
        raise HTTPException(status_code=404, detail="Schedule not found")
    if body.is_active is not None:
        s.is_active = body.is_active
    if body.recipients is not None:
        s.recipients = json.dumps(body.recipients)
    if body.frequency is not None:
        s.frequency = body.frequency
    session.add(s)
    session.commit()
    session.refresh(s)
    sched.register(s)
    return _to_schedule_response(s)


@app.delete("/api/schedules/{schedule_id}", status_code=204)
def delete_schedule(schedule_id: int, session: Session = Depends(get_session)):
    s = session.get(ScheduledRun, schedule_id)
    if not s:
        raise HTTPException(status_code=404, detail="Schedule not found")
    sched.unregister(schedule_id)
    session.delete(s)
    session.commit()
    return Response(status_code=204)


# ---------------------------------------------------------------------------
# Serve React frontend (production Docker build only)
# ---------------------------------------------------------------------------
_frontend_dist = os.path.join(os.path.dirname(__file__), "frontend", "dist")
if os.path.isdir(_frontend_dist):
    app.mount("/", StaticFiles(directory=_frontend_dist, html=True), name="frontend")
