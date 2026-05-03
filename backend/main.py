import logging
import os
from contextlib import asynccontextmanager
from datetime import date, timedelta

from dotenv import load_dotenv
from fastapi import BackgroundTasks, Depends, FastAPI, HTTPException
from sqlmodel import Session, select

from agent_runner import _get_or_create_config, run_analysis
from database import create_db_and_tables, engine, get_session
from models import AppConfig, ResearchRun
from schemas import (
    ALLOWED_MODELS,
    ConfigRead,
    ConfigUpdate,
    RunCreate,
    RunCreateResponse,
    RunStatusResponse,
)

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

_PROGRESS_MESSAGES = {
    "pending": "Queued, waiting to start…",
    "running": "Analysis in progress…",
    "complete": "Analysis complete.",
}


def _validate_env() -> None:
    gemini_key = os.getenv("GEMINI_API_KEY")
    google_key = os.getenv("GOOGLE_API_KEY")
    if not gemini_key and not google_key:
        raise RuntimeError(
            "GEMINI_API_KEY is required but not set. "
            "Add it to your .env file and restart."
        )
    # Bridge GEMINI_API_KEY → GOOGLE_API_KEY for langchain-google-genai
    if gemini_key and not google_key:
        os.environ["GOOGLE_API_KEY"] = gemini_key


@asynccontextmanager
async def lifespan(_app: FastAPI):
    _validate_env()
    create_db_and_tables()

    # Reset any runs that were left in `running` state before a restart
    from sqlmodel import Session as _Session

    with _Session(engine) as session:
        stale = session.exec(
            select(ResearchRun).where(ResearchRun.status == "running")
        ).all()
        for run in stale:
            run.status = "failed"
            run.error_message = "Server restarted while this run was in progress."
            session.add(run)
        if stale:
            session.commit()
            logger.warning("Marked %d stale run(s) as failed on startup.", len(stale))

        # Ensure the singleton config row exists
        _get_or_create_config(session)

    yield


app = FastAPI(title="StockResearch API", version="1.0.0", lifespan=lifespan)


# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------


@app.get("/api/health")
def health():
    return {"status": "ok"}


# ---------------------------------------------------------------------------
# Runs — Phase 1 endpoints
# ---------------------------------------------------------------------------


@app.post("/api/runs", response_model=RunCreateResponse, status_code=202)
def create_run(
    body: RunCreate,
    background_tasks: BackgroundTasks,
    session: Session = Depends(get_session),
):
    default_offset = int(os.getenv("DEFAULT_DATE_OFFSET_DAYS", "3"))
    analysis_date = body.analysis_date or (date.today() - timedelta(days=default_offset))

    if analysis_date > date.today():
        raise HTTPException(status_code=422, detail="analysis_date cannot be in the future.")

    run = ResearchRun(ticker=body.ticker, analysis_date=analysis_date)
    session.add(run)
    session.commit()
    session.refresh(run)

    background_tasks.add_task(run_analysis, run.id)

    return RunCreateResponse(run_id=run.id, status=run.status)


@app.get("/api/runs/{run_id}/status", response_model=RunStatusResponse)
def get_run_status(run_id: int, session: Session = Depends(get_session)):
    run = session.get(ResearchRun, run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Run not found.")

    if run.status == "failed":
        msg = f"Failed: {run.error_message or 'unknown error'}"
    else:
        msg = _PROGRESS_MESSAGES.get(run.status, run.status)

    return RunStatusResponse(status=run.status, progress_message=msg)


# ---------------------------------------------------------------------------
# Config / model switcher
# ---------------------------------------------------------------------------


@app.get("/api/config", response_model=ConfigRead)
def get_config(session: Session = Depends(get_session)):
    cfg = _get_or_create_config(session)
    return ConfigRead(
        deep_think_llm=cfg.deep_think_llm,
        quick_think_llm=cfg.quick_think_llm,
        default_date_offset_days=int(os.getenv("DEFAULT_DATE_OFFSET_DAYS", "3")),
        allowed_models=sorted(ALLOWED_MODELS),
    )


@app.patch("/api/config", response_model=ConfigRead)
def update_config(body: ConfigUpdate, session: Session = Depends(get_session)):
    cfg = _get_or_create_config(session)
    if body.deep_think_llm is not None:
        cfg.deep_think_llm = body.deep_think_llm
    if body.quick_think_llm is not None:
        cfg.quick_think_llm = body.quick_think_llm
    session.add(cfg)
    session.commit()
    session.refresh(cfg)
    return ConfigRead(
        deep_think_llm=cfg.deep_think_llm,
        quick_think_llm=cfg.quick_think_llm,
        default_date_offset_days=int(os.getenv("DEFAULT_DATE_OFFSET_DAYS", "3")),
        allowed_models=sorted(ALLOWED_MODELS),
    )
