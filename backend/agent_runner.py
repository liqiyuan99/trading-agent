import json
import logging
import os
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FuturesTimeoutError, as_completed

from sqlmodel import Session

from database import engine
from models import ResearchRun

logger = logging.getLogger(__name__)

ANALYSIS_TIMEOUT = int(os.getenv("ANALYSIS_TIMEOUT_SECONDS", str(45 * 60)))


def _build_config() -> dict:
    from tradingagents.default_config import DEFAULT_CONFIG

    config = DEFAULT_CONFIG.copy()
    config["llm_provider"] = "google"
    config["deep_think_llm"] = os.getenv("TRADINGAGENTS_DEEP_THINK_LLM", "gemini-2.5-flash")
    config["quick_think_llm"] = os.getenv("TRADINGAGENTS_QUICK_THINK_LLM", "gemini-2.5-flash-lite")
    config["backend_url"] = None
    config["google_thinking_level"] = None  # off — extended thinking multiplies cost
    config["output_language"] = "English"   # agents always reason in English
    config["news_article_limit"] = 10
    config["global_news_article_limit"] = 5
    config["global_news_lookback_days"] = 3
    config["global_news_queries"] = [
        "Federal Reserve interest rates inflation",
        "S&P 500 earnings GDP economic outlook",
    ]
    return config


def _do_propagate(ticker: str, analysis_date: str, config: dict):
    from tradingagents.graph.trading_graph import TradingAgentsGraph

    ta = TradingAgentsGraph(debug=False, config=config)
    return ta.propagate(ticker, analysis_date)


def _translate_section(text: str) -> str:
    """Translate one section to Simplified Chinese using flash-lite."""
    from langchain_google_genai import ChatGoogleGenerativeAI

    llm = ChatGoogleGenerativeAI(
        model=os.getenv("TRADINGAGENTS_QUICK_THINK_LLM", "gemini-2.5-flash-lite"),
        google_api_key=os.getenv("GOOGLE_API_KEY"),
    )
    prompt = (
        "Translate the following investment research content to Simplified Chinese (简体中文).\n"
        "Rules:\n"
        "- Preserve all markdown formatting (**bold**, ---, headers) exactly as written\n"
        "- Keep ticker symbols, numbers, and percentages unchanged\n"
        "- Use standard Simplified Chinese financial terminology\n\n"
        + text
    )
    response = llm.invoke(prompt)
    content = response.content
    if isinstance(content, list):
        content = "\n".join(
            item.get("text", "") if isinstance(item, dict) else str(item)
            for item in content
        )
    return content


def _translate_all(content_map: dict) -> dict:
    """Translate all non-empty sections to Chinese in parallel. Falls back to English on failure."""
    results = {}
    non_empty = {k: v for k, v in content_map.items() if v and v.strip()}

    with ThreadPoolExecutor(max_workers=4) as executor:
        future_to_key = {
            executor.submit(_translate_section, text): key
            for key, text in non_empty.items()
        }
        for future in as_completed(future_to_key):
            key = future_to_key[future]
            try:
                results[key] = future.result()
            except Exception:
                logger.warning("Translation failed for section '%s'; keeping English.", key)
                results[key] = non_empty[key]

    return results


_REFUSAL_PHRASES = (
    "i cannot fulfill this request",
    "i am not capable of providing investment advice",
    "not equipped to make investment recommendations",
    "i'm not able to provide financial advice",
    "cannot provide financial advice",
)


def _is_refusal(text: str) -> bool:
    if not text:
        return False
    lower = text.lower()
    return any(p in lower for p in _REFUSAL_PHRASES)


def _mark_failed(run_id: int, message: str) -> None:
    with Session(engine) as session:
        run = session.get(ResearchRun, run_id)
        if run:
            run.status = "failed"
            run.error_message = message
            run.progress_message = None
            session.add(run)
            session.commit()


def run_analysis(run_id: int, ticker: str, analysis_date: str) -> None:
    with Session(engine) as session:
        run = session.get(ResearchRun, run_id)
        if not run:
            return
        run.status = "running"
        run.progress_message = "Analysis in progress…"
        session.add(run)
        session.commit()

    config = _build_config()

    try:
        with ThreadPoolExecutor(max_workers=1) as executor:
            future = executor.submit(_do_propagate, ticker, analysis_date, config)
            try:
                final_state, decision = future.result(timeout=ANALYSIS_TIMEOUT)
            except FuturesTimeoutError:
                future.cancel()
                _mark_failed(
                    run_id,
                    f"Timed out after {ANALYSIS_TIMEOUT // 60} minutes. "
                    "The Gemini API may be slow or rate-limited — try again later.",
                )
                return

        ra = dict(final_state.get("risk_debate_state") or {})

        def _safe_report(key: str) -> str:
            val = final_state.get(key, "") or ""
            if _is_refusal(val):
                logger.warning("Model refusal detected in %s for run %d — storing empty.", key, run_id)
                return ""
            return val

        analyst_reports = {
            "fundamentals": _safe_report("fundamentals_report"),
            "sentiment":    _safe_report("sentiment_report"),
            "technical":    _safe_report("market_report"),
            "news":         _safe_report("news_report"),
            "trader_plan":  _safe_report("trader_investment_plan"),
            "investment_plan": _safe_report("investment_plan"),
            "investment_debate": dict(final_state.get("investment_debate_state") or {}),
        }
        final_report = final_state.get("final_trade_decision", "")

        # Translate all content sections to Chinese in parallel
        with Session(engine) as session:
            run = session.get(ResearchRun, run_id)
            if run:
                run.progress_message = "Generating Chinese translations…"
                session.add(run)
                session.commit()

        try:
            translations = _translate_all({
                "final_report":    final_report,
                "investment_plan": analyst_reports["investment_plan"],
                "trader_plan":     analyst_reports["trader_plan"],
                "fundamentals":    analyst_reports["fundamentals"],
                "sentiment":       analyst_reports["sentiment"],
                "news":            analyst_reports["news"],
                "technical":       analyst_reports["technical"],
                "risk_judgment":   ra.get("judge_decision", ""),
                "risk_history":    ra.get("history", ""),
            })
        except Exception:
            logger.warning("Translation step failed entirely for run %d; storing English only.", run_id)
            translations = None

        with Session(engine) as session:
            run = session.get(ResearchRun, run_id)
            if not run:
                return
            run.status = "complete"
            run.progress_message = None
            run.recommendation = decision
            run.final_report = final_report
            run.analyst_reports = json.dumps(analyst_reports)
            run.risk_assessment = json.dumps(ra)
            run.translations = json.dumps(translations) if translations else None
            run.model_used = config["deep_think_llm"]
            session.add(run)
            session.commit()

    except Exception as exc:
        logger.exception("Run %d failed", run_id)
        _mark_failed(run_id, str(exc))
