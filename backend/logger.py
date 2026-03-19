import logging
import os
from datetime import datetime

# Ensure logs directory exists
_log_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "logs")
os.makedirs(_log_dir, exist_ok=True)

# Configure file logger
_logger = logging.getLogger("llm_battle")
_logger.setLevel(logging.INFO)

_handler = logging.FileHandler(os.path.join(_log_dir, "llm_responses.log"), encoding="utf-8")
_handler.setFormatter(logging.Formatter("%(message)s"))
_logger.addHandler(_handler)


def log_llm_fetch(team_name: str, endpoint_url: str, prompt: str, response_text: str | None, error: str | None):
    """Log an LLM endpoint fetch (success or failure)."""
    _logger.info(
        "[%s] LLM_FETCH | team=%s | url=%s | prompt=%s | response=%s | error=%s",
        datetime.now().isoformat(),
        team_name,
        endpoint_url,
        _truncate(prompt, 200),
        _truncate(response_text, 500) if response_text else "N/A",
        error or "none",
    )


def log_judge_result(team_name: str, category: str, score: int | None, reasoning: str | None):
    """Log a Gemini judge result."""
    _logger.info(
        "[%s] JUDGE | team=%s | category=%s | score=%s | reasoning=%s",
        datetime.now().isoformat(),
        team_name,
        category,
        score if score is not None else "ERROR",
        reasoning or "N/A",
    )


def _truncate(text: str | None, max_len: int) -> str:
    if not text:
        return ""
    text = text.replace("\n", " ").replace("\r", "")
    return text[:max_len] + "..." if len(text) > max_len else text
