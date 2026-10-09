import pytest

from app import config
from app.reasoner import llm


@pytest.fixture
def keys(monkeypatch):
    def set_(provider="", anthropic="", openai="", gemini=""):
        monkeypatch.setattr(config, "LLM_PROVIDER", provider)
        monkeypatch.setattr(config, "ANTHROPIC_API_KEY", anthropic)
        monkeypatch.setattr(config, "OPENAI_API_KEY", openai)
        monkeypatch.setattr(config, "GEMINI_API_KEY", gemini)
    return set_


def test_picks_provider_by_key(keys):
    keys(gemini="AIza-x")
    assert llm.provider() == "gemini"
    assert llm.model() == config.GEMINI_MODEL
    keys(openai="sk-proj-x", gemini="AIza-x")
    assert llm.provider() == "openai"
    assert llm.model() == config.OPENAI_MODEL
    keys(anthropic="sk-ant-x", openai="sk-proj-x")
    assert llm.provider() == "anthropic"


def test_explicit_provider_wins(keys):
    keys(provider="gemini", anthropic="sk-ant-x", gemini="AIza-x")
    assert llm.provider() == "gemini"


def test_no_key_is_a_clear_error(keys):
    keys()
    with pytest.raises(llm.LLMError, match="ANTHROPIC_API_KEY, OPENAI_API_KEY or GEMINI_API_KEY"):
        llm.provider()


def test_bedrock_only_when_chosen(keys):
    keys(provider="bedrock")
    assert llm.provider() == "bedrock"
    assert llm.model() == config.BEDROCK_MODEL


@pytest.mark.parametrize("text", [
    '{"status": "ok"}',
    '```json\n{"status": "ok"}\n```',
    'Here is the result:\n{"status": "ok"}\nHope that helps.',
])
def test_extract_json_tolerates_wrapping(text):
    schema = {"required": ["status"]}
    assert llm._extract_json(text, schema) == '{"status": "ok"}'


@pytest.mark.parametrize("text", ["no json here", '{"other": 1}', '{"status": '])
def test_extract_json_rejects_bad_answers(text):
    with pytest.raises(ValueError):
        llm._extract_json(text, {"required": ["status"]})
