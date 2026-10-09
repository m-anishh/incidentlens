# 011 — LLM: Bedrock with an open-weight model, behind a provider switch

**Chosen:** `reasoner/llm.py` supports Anthropic, OpenAI, Gemini and Bedrock, selected by `LLM_PROVIDER`. Running: Bedrock `deepseek.v3.2`, authorised by the EC2 instance role.
**Rejected / unavailable:**
- Anthropic API, OpenAI API — require paid credits; the project has a zero-cash budget.
- Claude / OpenAI models on Bedrock — refused for AWS Free-plan accounts (Marketplace).
- Gemini free tier — the Google project was denied access (403).
- A third-party relay (agentrouter) — only admits Claude Code clients; using it would mean impersonating one.
**Why:** Bedrock usage is drawn from the Free-plan credits, the instance role means no key exists to leak, and the single-file provider switch keeps the CLAUDE.md rule that swapping providers touches one file.
**Consequence:** no native schema enforcement on Bedrock — the schema is put in the prompt and the JSON extracted and validated, with one retry. Comparing providers across the four scenarios is now a one-line `.env` change, which is itself evaluation material.
