import json
import logging
from datetime import datetime

from sqlmodel import Session

from database import engine
from models import AppConfig, ResearchRun

logger = logging.getLogger(__name__)


def _get_or_create_config(session: Session) -> AppConfig:
    config = session.get(AppConfig, 1)
    if not config:
        config = AppConfig()
        session.add(config)
        session.commit()
        session.refresh(config)
    return config


def run_analysis(run_id: int) -> None:
    from tradingagents.default_config import DEFAULT_CONFIG
    from tradingagents.graph.trading_graph import TradingAgentsGraph

    with Session(engine) as session:
        run = session.get(ResearchRun, run_id)
        if not run:
            logger.error("run_analysis: run %d not found", run_id)
            return

        app_config = _get_or_create_config(session)

        run.status = "running"
        run.started_at = datetime.utcnow()
        run.model_used = (
            f"deep={app_config.deep_think_llm}, quick={app_config.quick_think_llm}"
        )
        session.add(run)
        session.commit()

        try:
            config = DEFAULT_CONFIG.copy()
            config["llm_provider"] = "google"
            config["deep_think_llm"] = app_config.deep_think_llm
            config["quick_think_llm"] = app_config.quick_think_llm
            config["backend_url"] = ""

            ta = TradingAgentsGraph(debug=False, config=config)
            final_state, decision = ta.propagate(
                run.ticker,
                run.analysis_date.strftime("%Y-%m-%d"),
            )

            run.recommendation = decision
            run.analyst_reports = json.dumps(
                {
                    "fundamentals": final_state.get("fundamentals_report", ""),
                    "sentiment": final_state.get("sentiment_report", ""),
                    "news": final_state.get("news_report", ""),
                    "technical": final_state.get("market_report", ""),
                },
                ensure_ascii=False,
            )
            run.final_report = final_state.get("final_trade_decision", "")
            run.risk_assessment = json.dumps(
                final_state.get("risk_debate_state", {}), default=str, ensure_ascii=False
            )
            run.status = "complete"

        except Exception:
            logger.exception("run_analysis: run %d failed", run_id)
            run.status = "failed"
            # Store a concise error; full trace is in logs
            import traceback
            run.error_message = traceback.format_exc(limit=5)

        session.add(run)
        session.commit()
