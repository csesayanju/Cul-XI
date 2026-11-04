# Engine-Specific Notes

## Contents

- PostgreSQL
- MySQL / MariaDB
- MongoDB
- Redis
- Choosing a store

## PostgreSQL

- Identity columns (`GENERATED ALWAYS AS IDENTITY`) over `SERIAL`. `uuid` type; UUIDv7 via `uuidv7()` in PG18, or generate in app.
- Transactional DDL — wrap multiple DDL statements in one transaction (except `CONCURRENTLY` operations).
- Upsert: `INSERT … ON CONFLICT (cols) DO UPDATE SET … = EXCLUDED.…` (needs a matching unique index/constraint). `MERGE` available in PG15+.
- `RETURNING` on INSERT/UPDATE/DELETE avoids a second round trip.
- Index types: B-tree, GIN (jsonb, arrays, full-text, pg_trgm), GiST (ranges, geo, exclusion), BRIN (huge naturally ordered tables), hash. Partial and expression indexes. `INCLUDE` for covering.
- `jsonb` operators: `@>` containment (GIN `jsonb_path_ops` for smaller index), `->>` extraction (expression B-tree index for specific keys).
- MVCC: updates create new tuples → bloat; HOT updates avoid index churn if updated columns aren't indexed and page has room (`fillfactor`).
- Useful extensions: `pg_stat_statements`, `pg_trgm`, `btree_gist`, `pgcrypto`, `pg_partman`, `postgis`, `pgvector`, `citext`.
- Row-level security for multi-tenancy (`CREATE POLICY … USING (tenant_id = current_setting('app.tenant_id')::bigint)`), but make sure the app role doesn't bypass RLS (table owner / `BYPASSRLS`).
- `NULL`s are distinct in unique constraints unless `UNIQUE NULLS NOT DISTINCT` (PG15+).
- `COUNT(*)` is a full scan (no stored row count); use `reltuples` for estimates.

## MySQL / MariaDB

- InnoDB clusters rows by PK — PK choice affects physical layout. Random PKs (UUIDv4) → page splits; use auto-increment or ordered UUIDs (`UUID_TO_BIN(UUID(), 1)` swaps time bits).
- Secondary indexes store the PK → wide PKs bloat every index.
- Charset: `utf8mb4` with `utf8mb4_0900_ai_ci` (8.0) — `utf8` is 3-byte and can't store emoji. Collation `_ci` makes comparisons and UNIQUE case-insensitive.
- Default isolation REPEATABLE READ with next-key/gap locks: range `UPDATE`/`DELETE`/`SELECT … FOR UPDATE` lock gaps and can deadlock inserts. READ COMMITTED reduces gap locking (requires row-based binlog).
- Upsert: `INSERT … ON DUPLICATE KEY UPDATE col = VALUES(col)` (8.0.20+: use row alias `AS new … new.col`). Note it fires on **any** unique key conflict, and burns auto-increment values.
- No partial indexes; use generated columns + index. Functional indexes since 8.0.13. Descending indexes truly supported since 8.0. Invisible indexes for safe "drop test".
- `CHECK` constraints enforced since 8.0.16; before that, silently ignored.
- `sql_mode` should include `STRICT_TRANS_TABLES` (default in 5.7+) — otherwise silent truncation/invalid dates.
- Online DDL: specify `ALGORITHM=INSTANT|INPLACE, LOCK=NONE`; use gh-ost/pt-osc for COPY operations. Metadata locks block DDL behind long transactions.
- Large `IN` lists and `OR`s: check `range_optimizer_max_mem_size`. Index merge is often worse than a composite index.
- MariaDB has diverged (sequences, system-versioned tables, different JSON implementation — JSON is LONGTEXT alias) — verify feature availability when the user says MariaDB.

## MongoDB

- Everything single-document is atomic; multi-document transactions need a replica set and have a 60s default limit — keep them small.
- Index with the ESR rule (Equality, Sort, Range). `explain("executionStats")` — want `IXSCAN`, `totalDocsExamined ≈ nReturned`.
- Write concern `w: "majority"` + read concern `"majority"` for durability on critical data; defaults matter after failover.
- Unbounded arrays and huge documents are the most common modeling mistake. Use bucket/subset/extended-reference patterns.
- `$lookup` is fine occasionally, but heavy reliance on joins suggests the model should embed differently or the workload fits SQL better.
- TTL indexes for expiring data; partial indexes; unique indexes (enforced per shard only if shard key is a prefix).
- Mongoose: `.lean()` for read paths that don't need documents (much faster); define indexes in schema but build them via migration in production (`autoIndex: false`).
- Pagination: range on `_id` or indexed sort key, not `skip()` for deep pages.
- Sanitize query input — operator injection (`{ "$ne": null }`) through JSON bodies is a classic auth bypass.

## Redis

- Use for caching, rate limiting, sessions, queues (Streams), leaderboards (sorted sets), distributed locks (with care).
- Set TTLs and an `maxmemory-policy` (e.g. `allkeys-lru` for pure cache). Avoid `KEYS *` in prod — use `SCAN`.
- Persistence: RDB snapshots lose recent writes; AOF `everysec` loses ≤1s. Replication is async — failover can lose acknowledged writes.
- Distributed locks: `SET key token NX PX ttl` + release via Lua compare-and-delete. Locks can expire mid-work; use fencing tokens where correctness matters, or use the database for the critical section.
- Big keys / hot keys cause latency spikes; watch with `--bigkeys`, `LATENCY`, `SLOWLOG`.

## Choosing a store

- Default to **PostgreSQL** for new transactional systems: strong constraints, rich indexing, jsonb for flexibility, extensions for search/geo/vectors.
- **MySQL** is equally valid when the team/hosting already uses it (or Vitess/PlanetScale scale-out).
- **MongoDB** fits document-shaped, aggregate-oriented data with variable structure and few cross-entity transactions.
- **Redis** alongside, not instead of, a system of record.
- Specialized stores (Elasticsearch/OpenSearch, ClickHouse, time-series DBs, vector DBs) when a measured workload outgrows what the primary DB + extensions can do. Each new store adds sync, consistency, and on-call cost — name that cost.
