# 004 — Defer LangGraph to step 9

**Chosen:** a linear pipeline (`pipeline.py`) first; LangGraph replaces it at step 9.
**Rejected:** starting with LangGraph.
**Why:** conditional edges cannot be designed before the collectors' real output shapes are known. `state.py` is the shared contract, so the migration touches `investigation/` only. The linear version is expected to struggle with scenario 2 — that failure is the evidence that justifies the graph.
