"""Evidence in, structured report out. Knows nothing about HTTP or the database."""

from pydantic import ValidationError

from app.investigation.state import InvestigationState, Report
from app.reasoner.llm import LLMError, ask_llm
from app.reasoner.prompt import REPORT_SCHEMA, SYSTEM, build_prompt


async def reason(state: InvestigationState) -> Report:
    text = await ask_llm(build_prompt(state), system=SYSTEM, json_schema=REPORT_SCHEMA)
    try:
        return Report.model_validate_json(text)
    except ValidationError as e:
        raise LLMError(f"LLM response did not match the report schema: {e}") from e
