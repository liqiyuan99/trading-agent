import logging
import os
import re
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import List

logger = logging.getLogger(__name__)


def is_configured() -> bool:
    return all(os.getenv(k) for k in ("SMTP_HOST", "SMTP_USER", "SMTP_PASSWORD"))


def _md_to_html(text: str) -> str:
    """Minimal markdown → HTML: bold, horizontal rules, newlines."""
    text = re.sub(r'\*\*(.+?)\*\*', r'<strong>\1</strong>', text)
    text = re.sub(r'^---$', '<hr style="border:none;border-top:1px solid #ddd;margin:20px 0"/>', text, flags=re.MULTILINE)
    text = text.replace('\n', '<br/>\n')
    return text


def send_run_email(run, recipients: List[str]) -> None:
    """Send the final report by email. Skips silently if SMTP is not configured."""
    if not is_configured():
        logger.warning("SMTP not configured — skipping email for run %d.", run.id)
        return
    if not recipients:
        return

    smtp_host = os.getenv("SMTP_HOST")
    smtp_port = int(os.getenv("SMTP_PORT", "587"))
    smtp_user = os.getenv("SMTP_USER")
    smtp_password = os.getenv("SMTP_PASSWORD")
    email_from = os.getenv("EMAIL_FROM") or smtp_user

    subject = (
        f"[StockResearch] {run.ticker} — "
        f"{run.recommendation or 'Analysis Complete'} — {run.analysis_date}"
    )

    report_html = _md_to_html(run.final_report or "No report available.")

    body = f"""
<html>
<body style="font-family:Georgia,serif;max-width:680px;margin:40px auto;color:#111;line-height:1.75">
  <div style="border-bottom:2px solid #111;padding-bottom:16px;margin-bottom:28px">
    <h1 style="margin:0;font-size:26px;letter-spacing:-0.5px">{run.ticker}</h1>
    <p style="margin:8px 0 0;color:#555;font-size:14px">
      Analysis date: {run.analysis_date}
      &nbsp;·&nbsp;
      Recommendation: <strong>{run.recommendation or 'N/A'}</strong>
      {"&nbsp;·&nbsp; Model: " + run.model_used if run.model_used else ""}
    </p>
  </div>
  <div style="font-size:14px;line-height:1.8">{report_html}</div>
  <div style="border-top:1px solid #ddd;margin-top:48px;padding-top:12px;font-size:11px;color:#aaa">
    StockResearch &nbsp;·&nbsp; Automated scheduled report
    &nbsp;·&nbsp; {run.ticker} &nbsp;·&nbsp; {run.analysis_date}
  </div>
</body>
</html>"""

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = email_from
    msg["To"] = ", ".join(recipients)
    msg.attach(MIMEText(body, "html"))

    try:
        with smtplib.SMTP(smtp_host, smtp_port) as srv:
            srv.ehlo()
            srv.starttls()
            srv.login(smtp_user, smtp_password)
            srv.sendmail(email_from, recipients, msg.as_string())
        logger.info("Email sent for run %d → %s", run.id, recipients)
    except Exception:
        logger.exception("Failed to send email for run %d", run.id)
