# Query Optimization

## Contents

1. Diagnosis workflow
2. Reading plans
3. Index design
4. Common anti-patterns and rewrites
5. Pagination
6. Aggregation & reporting
7. When it's not the query

## 1. Diagnosis workflow

1. **Find the real offender**: `pg_stat_statements` (sort by `total_exec_time`, not mean), MySQL `performance_schema.events_statements_summary_by_digest` / slow query log, Mongo profiler / `$currentOp`. A 2ms query called 50k times/min matters more than a 3s nightly report.
2. **Get the actual plan** with real parameters:
   - PG: `EXPLAIN (ANALYZE, BUFFERS, VERBOSE) …` (wrap writes in `BEGIN; … ROLLBACK;`)
   - MySQL 8: `EXPLAIN ANALYZE …` / `EXPLAIN FORMAT=TREE`
   - Mongo: `.explain("executionStats")`
3. **Compare estimated vs actual rows** at each node. Off by 10×+ → stats problem (`ANALYZE`, raise statistics target, extended statistics for correlated columns).
4. Identify where time and buffers go; fix the most expensive node first.
5. Change one thing, re-measure, and confirm on production-like data volumes (a plan on 1k dev rows tells you little).

## 2. Reading plans

**Postgres red flags**

- `Seq Scan` on a big table with a selective filter → missing/unusable index.
- `Rows Removed by Filter` large → index doesn't cover the predicate.
- `Sort` with `external merge Disk` → add an index matching ORDER BY, or raise `work_mem` for that query.
- `Nested Loop` with large outer row count and inner seq scan → missing join index or bad estimate.
- `Heap Fetches` high on Index Only Scan → table needs VACUUM (visibility map).
- `Buffers: shared read` ≫ `hit` → cold cache / I/O bound.

**MySQL red flags** (`EXPLAIN` columns)

- `type: ALL` (full scan) or `index` (full index scan) on large tables.
- `Extra: Using filesort` / `Using temporary` on hot queries.
- `key: NULL` while `possible_keys` lists candidates → optimizer rejected them (low selectivity, type mismatch, function on column).
- `rows` × `filtered` tells you approximate rows examined.

**Mongo red flags**

- `COLLSCAN` stage; `totalDocsExamined` ≫ `nReturned`; `SORT` stage in memory (no index supports sort).

## 3. Index design

- **Composite order**: equality predicates first, then the range or ORDER BY column (the ESR rule: Equality, Sort, Range). `WHERE tenant_id = ? AND status = ? ORDER BY created_at DESC` → `(tenant_id, status, created_at DESC)`.
- **Leftmost prefix**: `(a, b, c)` serves `a`, `a,b`, `a,b,c` — not `b` alone. An index on `(a)` is redundant if `(a, b)` exists (except for uniqueness or FK-specific reasons).
- **Covering indexes**: PG `INCLUDE (col)` or MySQL secondary index containing all selected columns → index-only scan. InnoDB secondaries implicitly include the PK.
- **Partial indexes** (PG): `WHERE status = 'pending'` when queries target a small subset. Huge win for queue-like tables.
- **Expression indexes**: `lower(email)`, `(data->>'sku')`, MySQL functional indexes (8.0.13+) or generated columns.
- **Specialized**: PG GIN for `jsonb` containment / arrays / full-text (`pg_trgm` for `ILIKE '%x%'`), BRIN for huge append-only time-series, GiST for ranges/geo. Mongo: compound, multikey, text, TTL, partial, wildcard.
- **Cost**: each index slows writes, uses memory, and needs vacuuming. Find unused ones: PG `pg_stat_user_indexes.idx_scan = 0` (check replicas too), MySQL `sys.schema_unused_indexes`.
- Build on live tables with `CREATE INDEX CONCURRENTLY` (PG) / `ALGORITHM=INPLACE, LOCK=NONE` (MySQL) — see operations.md.

## 4. Common anti-patterns and rewrites

| Anti-pattern                                                                     | Why it hurts                                                    | Fix                                                                                   |
| -------------------------------------------------------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Function on indexed column: `WHERE date(created_at) = '2026-01-01'`              | Index unusable                                                  | Range: `created_at >= '2026-01-01' AND created_at < '2026-01-02'` or expression index |
| Implicit cast: varchar column compared to number (MySQL), or param type mismatch | Index unusable                                                  | Match types                                                                           |
| `LIKE '%term'`                                                                   | No B-tree use                                                   | trigram/full-text index                                                               |
| `OR` across different columns                                                    | Often full scan                                                 | `UNION ALL` of indexed branches, or composite/bitmap                                  |
| `NOT IN (subquery)` with NULLs                                                   | Wrong results + slow                                            | `NOT EXISTS`                                                                          |
| `SELECT *`                                                                       | Blocks index-only scans, wastes I/O, breaks with schema changes | Select needed columns                                                                 |
| `COUNT(*)` for "has any"                                                         | Scans everything                                                | `EXISTS (…)` / `LIMIT 1`                                                              |
| Exact counts on huge tables for UI                                               | Expensive every request                                         | Estimates (`pg_class.reltuples`), cached counts                                       |
| Correlated subquery per row                                                      | N executions                                                    | JOIN / LATERAL / window function                                                      |
| `ORDER BY random()`                                                              | Full sort                                                       | `TABLESAMPLE`, or random id range                                                     |
| Large `IN (…)` lists from app                                                    | Plan churn, parse cost                                          | `= ANY($1::bigint[])` (PG), temp table join                                           |
| Updating/deleting millions of rows in one statement                              | Long locks, replication lag, bloat                              | Batch by PK range (1k–10k rows), commit per batch                                     |
| Generic plans on skewed data (PG prepared statements)                            | Bad plan for rare values                                        | `plan_cache_mode`, or split query paths                                               |

## 5. Pagination

- `OFFSET n` reads and discards n rows; it degrades linearly and causes skipped/duplicated items when data changes.
- Use **keyset (seek) pagination**: `WHERE (created_at, id) < ($last_created_at, $last_id) ORDER BY created_at DESC, id DESC LIMIT 50` with an index on `(created_at DESC, id DESC)` (prefixed by any equality filters). Always include a unique tiebreaker.
- OFFSET is acceptable for small tables or admin screens with shallow pages.

## 6. Aggregation & reporting

- Push reporting to a read replica or a separate analytics store when it competes with OLTP traffic.
- Pre-aggregate: rollup tables updated incrementally, or materialized views refreshed on a schedule.
- Window functions (`ROW_NUMBER() OVER (PARTITION BY …)`) for "latest per group"; in PG also `DISTINCT ON`, or a LATERAL join with `LIMIT 1` backed by an index on `(group_col, sort_col DESC)`.
- For time-series at scale: partition by time, BRIN indexes, or TimescaleDB/ClickHouse if it's really analytical.

## 7. When it's not the query

If the plan looks fine but latency is bad, check: lock waits (`pg_stat_activity.wait_event`, `pg_locks`; MySQL `performance_schema.data_lock_waits`), connection pool saturation, table/index bloat, autovacuum lagging, checkpoint/I/O spikes, replication lag on replica reads, network round trips (N+1 from the app — see data-layer.md), and CPU/memory pressure on the instance.
