"""Smoke-test the configured LLM: one tiny structured call.

    docker compose exec incidentlens python -m app.reasoner.check
"""

import asyncio
import json
import sys

from app import config
from app.reasoner.llm import LLMError, ask_llm, model, provider

SCHEMA = {
    "type": "object",
    "properties": {"status": {"type": "string"}},
    "required": ["status"],
    "additionalProperties": False,
}


async def main() -> int:
    try:
        p = provider()
    except LLMError as e:
        print(f"FAIL  {e}")
        return 1
    print(f"provider: {p}\nmodel:    {model()}")
    try:
        text = await ask_llm('Reply with {"status": "ok"}.', json_schema=SCHEMA)
        print(f"OK    {json.loads(text)}")
        return 0
    except (LLMError, ValueError) as e:
        print(f"FAIL  {e}")
        if p == "gemini":
            await _list_gemini_models()
        return 1


async def _list_gemini_models():
    from google import genai
    try:
        client = genai.Client(api_key=config.GEMINI_API_KEY)
        names = [m.name.removeprefix("models/") async for m in await client.aio.models.list()
                 if "generateContent" in (m.supported_actions or []) and "gemini" in m.name]
        print("models this key can use (set GEMINI_MODEL in .env):")
        for n in sorted(names):
            print(f"  {n}")
    except Exception as e:  # noqa: BLE001 — diagnostics only
        print(f"(could not list models: {e})")


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
