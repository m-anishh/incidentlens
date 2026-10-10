"""The only file that knows which LLM provider is in use.

LLM_PROVIDER selects it: "anthropic", "openai", "gemini" or "bedrock". Unset →
whichever API-key provider has a key configured, in that order. Bedrock needs
no key (the EC2 instance role authorises it), so it is only used when chosen
explicitly. Swapping providers touches nothing outside this file.
"""

import asyncio
import json
import re

PROVIDERS = ("anthropic", "openai", "gemini", "bedrock")

from app import config


class LLMError(Exception):
    pass


def provider() -> str:
    if config.LLM_PROVIDER:
        return config.LLM_PROVIDER
    if config.ANTHROPIC_API_KEY:
        return "anthropic"
    if config.OPENAI_API_KEY:
        return "openai"
    if config.GEMINI_API_KEY:
        return "gemini"
    raise LLMError("no LLM configured: set ANTHROPIC_API_KEY, OPENAI_API_KEY or GEMINI_API_KEY "
                   "in .env, or LLM_PROVIDER=bedrock")


def model() -> str:
    return {"anthropic": config.LLM_MODEL, "openai": config.OPENAI_MODEL,
            "gemini": config.GEMINI_MODEL, "bedrock": config.BEDROCK_MODEL}.get(provider(), "?")


async def ask_llm(prompt: str, *, system: str = "", json_schema: dict | None = None) -> str:
    """Send one prompt, return the text answer. With json_schema, the answer is
    constrained to JSON matching it."""
    p = provider()
    if p == "anthropic":
        return await _ask_anthropic(prompt, system, json_schema)
    if p == "openai":
        return await _ask_openai(prompt, system, json_schema)
    if p == "gemini":
        return await _ask_gemini(prompt, system, json_schema)
    if p == "bedrock":
        return await _ask_bedrock(prompt, system, json_schema)
    raise LLMError(f"unknown LLM_PROVIDER {p!r}; expected one of {', '.join(PROVIDERS)}")


# --- Anthropic ------------------------------------------------------------------

_anthropic = None


async def _ask_anthropic(prompt, system, json_schema):
    import anthropic

    global _anthropic
    if _anthropic is None:
        _anthropic = anthropic.AsyncAnthropic()

    output_config: dict = {"effort": config.LLM_EFFORT}
    if json_schema is not None:
        output_config["format"] = {"type": "json_schema", "schema": json_schema}

    try:
        response = await _anthropic.beta.messages.create(
            model=config.LLM_MODEL,
            max_tokens=config.LLM_MAX_TOKENS,
            system=system,
            messages=[{"role": "user", "content": prompt}],
            output_config=output_config,
            # Server-side fallback: if a safety classifier declines, the API
            # re-runs the request on a fallback model within the same call.
            betas=["server-side-fallback-2026-07-01"],
            fallbacks="default",
        )
    except anthropic.APIStatusError as e:
        raise LLMError(f"Anthropic API error {e.status_code}: {e.message}") from e
    except anthropic.APIConnectionError as e:
        raise LLMError(f"Anthropic API unreachable: {e}") from e

    if response.stop_reason == "refusal":
        category = response.stop_details.category if response.stop_details else None
        raise LLMError(f"LLM declined the request (category: {category})")
    if response.stop_reason == "max_tokens":
        raise LLMError("LLM output hit max_tokens before finishing")

    text = "".join(block.text for block in response.content if block.type == "text")
    if not text:
        raise LLMError(f"LLM returned no text (stop_reason: {response.stop_reason})")
    return text


# --- OpenAI ---------------------------------------------------------------------

_openai = None


async def _ask_openai(prompt, system, json_schema):
    import openai

    global _openai
    if _openai is None:
        _openai = openai.AsyncOpenAI(api_key=config.OPENAI_API_KEY)

    messages = ([{"role": "system", "content": system}] if system else []) + [{"role": "user", "content": prompt}]
    kwargs = {}
    if json_schema is not None:
        # strict mode: every property required, no extras — REPORT_SCHEMA already is.
        kwargs["response_format"] = {
            "type": "json_schema",
            "json_schema": {"name": "response", "schema": json_schema, "strict": True},
        }

    try:
        response = await _openai.chat.completions.create(
            model=config.OPENAI_MODEL,
            messages=messages,
            max_completion_tokens=config.LLM_MAX_TOKENS,
            **kwargs,
        )
    except openai.APIStatusError as e:
        raise LLMError(f"OpenAI API error {e.status_code}: {e.message}") from e
    except openai.APIConnectionError as e:
        raise LLMError(f"OpenAI API unreachable: {e}") from e

    choice = response.choices[0]
    if choice.finish_reason == "length":
        raise LLMError("LLM output hit max_completion_tokens before finishing")
    if getattr(choice.message, "refusal", None):
        raise LLMError(f"LLM declined the request: {choice.message.refusal}")
    if not choice.message.content:
        raise LLMError(f"LLM returned no text (finish_reason: {choice.finish_reason})")
    return choice.message.content


# --- Gemini ---------------------------------------------------------------------

_gemini = None


async def _ask_gemini(prompt, system, json_schema):
    from google import genai
    from google.genai import errors, types

    global _gemini
    if _gemini is None:
        # GEMINI_VERTEX=1: same key, served by Vertex AI instead of AI Studio.
        _gemini = genai.Client(api_key=config.GEMINI_API_KEY, vertexai=config.GEMINI_VERTEX or None)

    cfg = types.GenerateContentConfig(
        system_instruction=system or None,
        max_output_tokens=config.LLM_MAX_TOKENS,
    )
    if json_schema is not None:
        cfg.response_mime_type = "application/json"
        cfg.response_json_schema = json_schema

    try:
        response = await _gemini.aio.models.generate_content(
            model=config.GEMINI_MODEL, contents=prompt, config=cfg,
        )
    except errors.APIError as e:
        raise LLMError(f"Gemini API error {e.code}: {e.message}") from e
    except OSError as e:
        raise LLMError(f"Gemini API unreachable: {e}") from e

    candidate = response.candidates[0] if response.candidates else None
    reason = candidate.finish_reason.name if candidate and candidate.finish_reason else None
    if reason == "MAX_TOKENS":
        raise LLMError("LLM output hit max_output_tokens before finishing")
    if reason in ("SAFETY", "PROHIBITED_CONTENT", "BLOCKLIST", "RECITATION"):
        raise LLMError(f"Gemini declined the request (finish_reason: {reason})")
    if not response.text:
        block = response.prompt_feedback.block_reason if response.prompt_feedback else None
        raise LLMError(f"Gemini returned no text (finish_reason: {reason}, block_reason: {block})")
    return response.text


# --- Amazon Bedrock -------------------------------------------------------------

_bedrock = None


async def _ask_bedrock(prompt, system, json_schema):
    """Converse API, authorised by the EC2 instance role (no key).

    Not every Bedrock model enforces a JSON schema, so the schema goes in the
    prompt and the answer is extracted and parsed here — with one retry that
    tells the model what was wrong.
    """
    if json_schema is not None:
        prompt += ("\n\nRespond with ONLY a JSON object — no prose, no code fences — "
                   "that validates against this JSON Schema:\n" + json.dumps(json_schema))
    text = await _bedrock_converse(prompt, system)
    if json_schema is None:
        return text
    try:
        return _extract_json(text, json_schema)
    except ValueError as e:
        retry = (prompt + f"\n\nYour previous answer was not valid ({e}). "
                 "Return only the JSON object.")
        return _extract_json(await _bedrock_converse(retry, system), json_schema)


async def _bedrock_converse(prompt, system):
    import boto3
    from botocore.config import Config
    from botocore.exceptions import BotoCoreError, ClientError

    global _bedrock
    if _bedrock is None:
        _bedrock = boto3.client(
            "bedrock-runtime", region_name=config.BEDROCK_REGION,
            config=Config(read_timeout=180, retries={"max_attempts": 3, "mode": "standard"}),
        )

    params = {
        "modelId": config.BEDROCK_MODEL,
        "messages": [{"role": "user", "content": [{"text": prompt}]}],
        "inferenceConfig": {"maxTokens": config.BEDROCK_MAX_TOKENS},
    }
    if system:
        params["system"] = [{"text": system}]

    try:
        response = await asyncio.to_thread(_bedrock.converse, **params)
    except ClientError as e:
        err = e.response.get("Error", {})
        raise LLMError(f"Bedrock error {err.get('Code')}: {err.get('Message')}") from e
    except BotoCoreError as e:
        raise LLMError(f"Bedrock unreachable: {e}") from e

    stop = response.get("stopReason")
    if stop == "max_tokens":
        raise LLMError("LLM output hit maxTokens before finishing")
    if stop in ("content_filtered", "guardrail_intervened"):
        raise LLMError(f"Bedrock declined the request (stopReason: {stop})")
    # Reasoning models also return reasoningContent blocks; only text is the answer.
    text = "".join(c["text"] for c in response["output"]["message"]["content"] if "text" in c)
    if not text.strip():
        raise LLMError(f"LLM returned no text (stopReason: {stop})")
    return text


def _extract_json(text: str, schema: dict) -> str:
    """Pull the JSON object out of a free-text answer and check required keys."""
    cleaned = re.sub(r"^```(?:json)?\s*|\s*```$", "", text.strip())
    start, end = cleaned.find("{"), cleaned.rfind("}")
    if start == -1 or end <= start:
        raise ValueError("no JSON object found")
    obj = json.loads(cleaned[start:end + 1])  # JSONDecodeError is a ValueError
    missing = [k for k in schema.get("required", []) if k not in obj]
    if missing:
        raise ValueError(f"missing required keys: {missing}")
    return json.dumps(obj)
