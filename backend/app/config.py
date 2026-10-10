"""Every endpoint, key and tunable, read from the environment in one place."""

import os
from pathlib import Path


def _load_dotenv() -> None:
    """Running outside Compose: pick up the repo-root .env. Real env vars win.
    In the container the file is absent and this is a no-op."""
    path = Path(__file__).resolve().parents[2] / ".env"
    if not path.is_file():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        value = os.path.expandvars(value.strip().strip('"').strip("'"))  # ${VAR}, as Compose does
        os.environ.setdefault(key.strip(), value)


_load_dotenv()

DATABASE_URL = os.environ.get("DATABASE_URL", "")
PROMETHEUS_URL = os.environ.get("PROMETHEUS_URL", "http://prometheus:9090")
LOKI_URL = os.environ.get("LOKI_URL", "http://loki:3100")

# LLM provider: "anthropic" | "openai" | "gemini". Empty → chosen by which key is set.
LLM_PROVIDER = os.environ.get("LLM_PROVIDER", "").strip().lower()
ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY", "")
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")
LLM_MODEL = os.environ.get("LLM_MODEL") or "claude-opus-5-5"       # Anthropic
OPENAI_MODEL = os.environ.get("OPENAI_MODEL") or "gpt-5.5"
# Bedrock: no key — the EC2 instance role authorises it.
BEDROCK_REGION = os.environ.get("BEDROCK_REGION") or "eu-north-1"
BEDROCK_MODEL = os.environ.get("BEDROCK_MODEL") or "deepseek.v3.2"
BEDROCK_MAX_TOKENS = int(os.environ.get("BEDROCK_MAX_TOKENS") or "8000")
GEMINI_MODEL = os.environ.get("GEMINI_MODEL") or "gemini-3.8-flash"
GEMINI_VERTEX = os.environ.get("GEMINI_VERTEX", "").lower() in ("1", "true", "yes")
LLM_EFFORT = os.environ.get("LLM_EFFORT", "high")
LLM_MAX_TOKENS = int(os.environ.get("LLM_MAX_TOKENS", "16000"))

# Run lifecycle
RUN_TIMEOUT_S = int(os.environ.get("RUN_TIMEOUT_S", "240"))

# Evidence window: [startsAt − for − baseline − margin, startsAt + margin]
BASELINE_MINUTES = int(os.environ.get("BASELINE_MINUTES", "10"))
MARGIN_MINUTES = int(os.environ.get("MARGIN_MINUTES", "2"))
# Used only when an alert lacks the for_duration annotation — and flagged.
FALLBACK_FOR_DURATION = os.environ.get("FALLBACK_FOR_DURATION", "2m")
QUERY_STEP_S = int(os.environ.get("QUERY_STEP_S", "15"))

# Evidence volume
LOG_LINE_LIMIT = int(os.environ.get("LOG_LINE_LIMIT", "200"))
LOG_SAMPLES_PER_PATTERN = int(os.environ.get("LOG_SAMPLES_PER_PATTERN", "3"))
MAX_ONSET_SERIES = int(os.environ.get("MAX_ONSET_SERIES", "12"))
ONSET_POINTS_PER_SERIES = int(os.environ.get("ONSET_POINTS_PER_SERIES", "20"))

COLLECTOR_TIMEOUT_S = float(os.environ.get("COLLECTOR_TIMEOUT_S", "10"))
