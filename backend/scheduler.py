import json
import logging
import os
from datetime import date, datetime, timedelta
from typing import Optional

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger
from sqlmodel import Session, select

logger = logging.getLogger(__name__)

_tz = os.getenv("SCHEDULE_TIMEZONE", "UTC")
_hour = int(os.getenv("SCHEDULE_RUN_HOUR", "6"))

scheduler = BackgroundScheduler(
    executors={"default": {"type": "threadpool", "max_workers": 2}},
    timezone=_tz,
)


def _next_monday() -> datetime:
    """Next Monday at SCHEDULE_RUN_HOUR in the scheduler timezone."""
    now = datetime.now()
    days_ahead = (7 - now.weekday()) % 7  # 0 if today is Monday
    if days_ahead == 0 and now.hour >= _hour:
        days_ahead = 7  # today's window passed — go to next week
    return (now + timedelta(days=days_ahead)).replace(
        hour=_hour, minute=0, second=0, microsecond=0
    )


def _biweekly_start(last_run_at: Optional[datetime]) -> datetime:
    """Return the correct start_date for an IntervalTrigger(weeks=2) so runs land on Mondays."""
    if last_run_at:
        base = last_run_at + timedelta(weeks=2)
        days_ahead = (7 - base.weekday()) % 7
        return (base + timedelta(days=days_ahead)).replace(
            hour=_hour, minute=0, second=0, microsecond=0
        )
    return _next_monday()


def _get_trigger(frequency: str, last_run_at: Optional[datetime]):
    if frequency == "daily":
        return CronTrigger(hour=_hour, minute=0, timezone=_tz)
    if frequency == "weekly":
        return CronTrigger(day_of_week="mon", hour=_hour, minute=0, timezone=_tz)
    if frequency == "biweekly":
        return IntervalTrigger(weeks=2, start_date=_biweekly_start(last_run_at), timezone=_tz)
    if frequency == "monthly":
        return CronTrigger(day=1, hour=_hour, minute=0, timezone=_tz)
    raise ValueError(f"Unknown frequency: {frequency!r}")


def _run_job(schedule_id: int) -> None:
    """Called by APScheduler in a background thread."""
    from database import engine
    from models import ResearchRun, ScheduledRun
    from agent_runner import run_analysis
    from emailer import send_run_email

    with Session(engine) as session:
        schedule = session.get(ScheduledRun, schedule_id)
        if not schedule or not schedule.is_active:
            return

        ticker = schedule.ticker
        recipients = json.loads(schedule.recipients or "[]")
        offset = int(os.getenv("DEFAULT_DATE_OFFSET_DAYS", "3"))
        analysis_date = str(date.today() - timedelta(days=offset))

        run = ResearchRun(ticker=ticker, analysis_date=analysis_date)
        session.add(run)
        session.commit()
        session.refresh(run)
        run_id = run.id

        schedule.last_run_at = datetime.utcnow()
        schedule.last_run_id = run_id
        session.add(schedule)
        session.commit()

    logger.info("Scheduled run %d starting: %s on %s", run_id, ticker, analysis_date)
    run_analysis(run_id, ticker, analysis_date)

    if recipients:
        with Session(engine) as session:
            run = session.get(ResearchRun, run_id)
            if run and run.status == "complete":
                send_run_email(run, recipients)


def register(schedule) -> None:
    """Add or replace the APScheduler job for a schedule record."""
    job_id = f"sched_{schedule.id}"
    try:
        scheduler.remove_job(job_id)
    except Exception:
        pass
    if not schedule.is_active:
        return
    trigger = _get_trigger(schedule.frequency, schedule.last_run_at)
    scheduler.add_job(
        _run_job,
        trigger=trigger,
        id=job_id,
        args=[schedule.id],
        replace_existing=True,
        misfire_grace_time=3600,  # fire up to 1h late if server was down
    )
    logger.info("Registered job %s — %s %s", job_id, schedule.ticker, schedule.frequency)


def unregister(schedule_id: int) -> None:
    try:
        scheduler.remove_job(f"sched_{schedule_id}")
    except Exception:
        pass


def next_run_at(schedule_id: int) -> Optional[datetime]:
    job = scheduler.get_job(f"sched_{schedule_id}")
    return job.next_run_time if job else None


def start() -> None:
    """Start scheduler and re-register all active schedules from the DB."""
    from database import engine
    from models import ScheduledRun

    with Session(engine) as session:
        active = session.exec(
            select(ScheduledRun).where(ScheduledRun.is_active == True)
        ).all()
        for s in active:
            register(s)

    scheduler.start()
    logger.info("Scheduler started — %d active job(s).", len(scheduler.get_jobs()))


def stop() -> None:
    if scheduler.running:
        scheduler.shutdown(wait=False)
