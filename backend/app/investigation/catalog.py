"""What the v1 pipeline asks Prometheus and Loki. A fixed list, queried every run.

This is the part LangGraph replaces at step 9: instead of asking everything, a
graph inspects what it found and decides where to look next.
"""

# (name, unit, promql). Every query is an aggregate already — rates and
# quantiles over 1m — so a range query yields one small series per label set.
METRICS: list[tuple[str, str, str]] = [
    ("http_p95_latency", "s",
     'histogram_quantile(0.95, sum by (service, method, route, le) (rate(http_request_duration_seconds_bucket[1m])))'),
    ("http_request_rate", "req/s",
     'sum by (service, method, route) (rate(http_requests_total[1m]))'),
    ("http_5xx_ratio", "ratio",
     'sum by (service, method, route) (rate(http_requests_total{status=~"5.."}[1m]))'
     ' / sum by (service, method, route) (rate(http_requests_total[1m]))'),
    ("downstream_p95_latency", "s",
     'histogram_quantile(0.95, sum by (service, target, route, le) (rate(downstream_request_duration_seconds_bucket[1m])))'),
    ("db_pool_in_use", "connections", 'max by (service) (db_pool_in_use)'),
    ("db_pool_size", "connections", 'max by (service) (db_pool_size)'),
    ("db_pool_waiting", "requests", 'max by (service) (db_pool_waiting)'),
    ("db_pool_timeouts_rate", "per s", 'sum by (service) (rate(db_pool_timeouts_total[1m]))'),
    ("db_pool_acquire_p95", "s",
     'histogram_quantile(0.95, sum by (service, le) (rate(db_pool_acquire_seconds_bucket[1m])))'),
    ("cache_lookups_rate", "per s", 'sum by (service, result) (rate(cache_requests_total[1m]))'),
    ("postgres_transactions_rate", "tx/s",
     'sum by (service) (rate(pg_stat_database_xact_commit{datname!~"template.*|postgres"}[1m]))'),
    ("postgres_active_connections", "connections",
     'sum by (service) (pg_stat_activity_count{state="active"})'),
    ("postgres_mean_query_time", "s",
     'sum by (service) (rate(pg_stat_statements_seconds_total[1m]))'
     ' / sum by (service) (rate(pg_stat_statements_calls_total[1m]))'),
    ("redis_up", "bool", 'max by (service) (redis_up)'),
    ("process_cpu_rate", "cpu-s/s", 'sum by (service) (rate(process_cpu_seconds_total[1m]))'),
    ("scrape_up", "bool", 'max by (service, job) (up)'),
]

# Used for the weak-baseline check: a process start inside the window means the
# baseline includes warm-up.
PROCESS_START = 'max by (service) (process_start_time_seconds)'

# Warnings and errors only; request lines are info. The level label is set by
# Alloy from the JSON field, so this selects without parsing every line.
LOG_SELECTOR = '{level=~"warning|error"}'


def log_count_query(range_s: int) -> str:
    return f'sum by (service, level, msg) (count_over_time({LOG_SELECTOR} | json msg="msg" [{range_s}s]))'
