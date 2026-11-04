# Operations & Reliability

## Contents

1. Zero-downtime migrations
2. Lock behavior cheat sheet
3. Backfills
4. Backups & recovery
5. Replication & read scaling
6. Partitioning & sharding
7. Maintenance (vacuum, bloat, stats)
8. Monitoring

## 1. Zero-downtime migrations

Use **expand → migrate → contract** so old and new app versions both work during deploy:

1. **Expand**: add new nullable column / new table / new index (online). Deploy code that writes both old and new.
2. **Migrate**: backfill in batches. Switch reads to new.
3. **Contract**: after all code uses the new shape, add NOT NULL / drop old column in a later deploy.

Rules:

- Set a **lock timeout** on every migration session (PG `SET lock_timeout = '3s'`; MySQL `SET SESSION lock_wait_timeout = 5`) and retry. A DDL waiting for a lock blocks every query queued behind it — this is how "a quick ALTER" takes a site down.
- One risky change per migration; don't mix DDL and large data updates in one transaction.
- Renames: add new column/table, dual-write, switch reads, drop old. Never rename in place on a live system with old code running.
- Dropping a column: first deploy code that no longer reads it (and for Rails/Django, tell the ORM to ignore it), then drop.
- Keep migrations reversible or have an explicit forward-fix plan.
- Tools: PG — `strong_migrations` (Rails), `django-pg-zero-downtime-migrations`, `pgroll`, `squawk` linter. MySQL — `gh-ost`, `pt-online-schema-change`, PlanetScale/Vitess online DDL.

## 2. Lock behavior cheat sheet

**PostgreSQL (11+)**

| Operation                                                    | Safe online?                                                                                                                                                                           |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ADD COLUMN` nullable, or with constant/non-volatile default | Yes (metadata only; brief ACCESS EXCLUSIVE)                                                                                                                                            |
| `ADD COLUMN … DEFAULT now()`/volatile default                | No — table rewrite                                                                                                                                                                     |
| `ALTER COLUMN TYPE` (most changes)                           | No — rewrite (exceptions: varchar length increase, varchar→text)                                                                                                                       |
| `SET NOT NULL`                                               | Scans table under ACCESS EXCLUSIVE. Safe path: `ADD CONSTRAINT … CHECK (col IS NOT NULL) NOT VALID` → `VALIDATE CONSTRAINT` → `SET NOT NULL` (PG12+ uses the valid check) → drop check |
| `ADD FOREIGN KEY`                                            | Use `NOT VALID` then `VALIDATE CONSTRAINT` separately                                                                                                                                  |
| `ADD UNIQUE / PK`                                            | Build `CREATE UNIQUE INDEX CONCURRENTLY` first, then `ADD CONSTRAINT … USING INDEX`                                                                                                    |
| `CREATE INDEX`                                               | Blocks writes → use `CONCURRENTLY` (not in a transaction; check for `INVALID` index on failure and drop/retry)                                                                         |
| `DROP INDEX`                                                 | Use `DROP INDEX CONCURRENTLY`                                                                                                                                                          |

**MySQL 8.0 InnoDB**

| Operation                                                                                                                                                                                                                            | Algorithm                                                           |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------- |
| `ADD COLUMN` (last position, 8.0.12+; any position 8.0.29+)                                                                                                                                                                          | INSTANT                                                             |
| Add secondary index                                                                                                                                                                                                                  | INPLACE, LOCK=NONE (but long, and replicas apply it serially → lag) |
| Change column type                                                                                                                                                                                                                   | COPY — blocks writes; use gh-ost/pt-osc                             |
| Drop column                                                                                                                                                                                                                          | INPLACE w/ rebuild (INSTANT in 8.0.29+)                             |
| Always specify `ALGORITHM=…, LOCK=…` explicitly so MySQL errors instead of silently falling back to a blocking copy. Watch metadata locks: a long-running transaction holding an MDL blocks the ALTER, which then blocks everything. |

**MongoDB**: index builds (4.2+) hold exclusive lock only at start/end; still resource-intensive — build on a rolling basis for very large collections. Schema changes are app-level: version documents (`schemaVersion`) and migrate lazily or in batches.

## 3. Backfills

- Batch by primary key range, not OFFSET: `UPDATE t SET new = … WHERE id > $last AND id <= $last + 5000 AND new IS NULL`.
- Commit per batch, sleep briefly, monitor replication lag and stop if it grows.
- Make the backfill idempotent and resumable (store progress or derive from `WHERE new IS NULL`).
- Run it as a job, not inside the schema migration.

## 4. Backups & recovery

- Need both **full backups + continuous WAL/binlog archiving** for point-in-time recovery (PITR). PG: pgBackRest, WAL-G, Barman, managed snapshots + PITR. MySQL: XtraBackup / mysqldump --single-transaction + binlogs. Mongo: Atlas continuous backup, or `mongodump` only for small DBs.
- Define **RPO** (data loss tolerated) and **RTO** (downtime tolerated); pick strategy accordingly.
- **Test restores regularly** — an untested backup is a hope. Measure how long a restore takes.
- Logical dumps are for portability/small DBs; physical backups for large ones.
- Keep backups in a separate account/region; encrypt them; protect against deletion (immutability) to survive ransomware or a compromised admin.

## 5. Replication & read scaling

- Async replicas have **lag**: reads after writes may be stale. Route read-your-own-writes to primary (or pin a user to primary for a few seconds after writing, or wait for LSN/GTID).
- Use replicas for reporting, search indexing, backups — not as a write-scaling tool.
- Failover: managed (RDS Multi-AZ, Patroni, Orchestrator, Mongo replica set elections). App must reconnect and tolerate a short error window; test it.
- Long queries on PG hot standby can be cancelled (`max_standby_streaming_delay`) or cause primary bloat (`hot_standby_feedback`).
- Logical replication / CDC (Debezium) for streaming changes to other systems and for major-version upgrades with minimal downtime.

## 6. Partitioning & sharding

Order of escalation: better indexes → query/caching fixes → vertical scale → read replicas → **partitioning** → archiving cold data → **sharding** (last resort; large operational cost).

- **Partitioning** (PG declarative, MySQL partitions): good for time-series/retention (drop old partitions instantly instead of mass DELETE), and when queries always filter on the partition key. Every query should include the key for pruning. PG: unique constraints must include the partition key. Automate partition creation (pg_partman). Don't over-partition (thousands of partitions hurt planning).
- **Sharding**: choose a key that most queries include and that distributes evenly (tenant_id is common for B2B). Cross-shard joins/transactions become hard. Consider Citus, Vitess, or Mongo sharding before building it in-app.

## 7. Maintenance

- **Postgres**: autovacuum must keep up — tune per hot table (`autovacuum_vacuum_scale_factor` lower for big tables). Watch dead tuples, bloat, and **transaction ID wraparound** (`age(datfrozenxid)`). Long-running transactions and abandoned replication slots block cleanup. Reindex bloated indexes with `REINDEX CONCURRENTLY`.
- **MySQL**: monitor history list length (long transactions block purge), buffer pool hit ratio; `OPTIMIZE TABLE` rarely needed and rebuilds the table.
- Keep statistics fresh after big data changes (`ANALYZE`).
- Plan major-version upgrades (PG `pg_upgrade` or logical replication; MySQL in-place with testing). Stay on supported versions.

## 8. Monitoring

Track and alert on: connections vs max, query latency p95/p99 and top statements, lock waits/deadlocks, replication lag, disk usage and growth rate, CPU/IOPS/memory, cache hit ratio, autovacuum activity and dead tuples (PG), long-running transactions, backup success and last-restore-test date. Tools: pg_stat_statements, performance_schema, PMM, Datadog/New Relic DB monitoring, pganalyze, Atlas metrics.
