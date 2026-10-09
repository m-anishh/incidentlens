-- Exposes per-query timing to postgres_exporter (--collector.stat_statements).
-- Scenario 1 needs "Postgres queries stay fast" as evidence, not just TPS.
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

CREATE TABLE orders (
    id         SERIAL PRIMARY KEY,
    sku        TEXT        NOT NULL,
    qty        INT         NOT NULL,
    customer   TEXT        NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO orders (sku, qty, customer)
SELECT 'SKU-' || (g % 40), 1 + (g % 5), 'customer-' || (g % 200)
FROM generate_series(1, 1000) AS g;
