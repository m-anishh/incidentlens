# 008 — Baseline collected as aggregates

**Chosen:** baseline as per-series mean/p95/sample-count and log-pattern *counts*; onset as downsampled series plus capped sample lines; a pre-computed contrast line per series.
**Rejected:** full-resolution series and raw logs for the whole window.
**Why:** the log line cap is per query; healthy baseline noise would consume lines that belong to the onset. Aggregates cost a few tokens per series, and handing the LLM a ready contrast avoids asking it to diff two raw series.
