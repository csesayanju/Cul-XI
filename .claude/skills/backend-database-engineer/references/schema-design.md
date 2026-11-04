# Schema Design

## Contents

1. Modeling process
2. Keys
3. Types
4. Constraints
5. Relationships & common patterns
6. Normalization vs denormalization
7. Document (MongoDB) modeling
8. Review checklist

## 1. Modeling process

1. List the entities and the **queries** the app will run against them (read paths drive design as much as the entities do).
2. Identify invariants: what must always be true (unique email per tenant, balance ≥ 0, one active subscription per user). Each should map to a constraint.
3. Decide ownership/lifecycle: what is deleted with what (`ON DELETE CASCADE` vs `RESTRICT` vs soft delete).
4. Estimate cardinalities and growth — which tables will be large, hot, append-only.
5. Write DDL, then the indexes that serve the queries from step 1.

## 2. Keys

- **Surrogate primary keys**: `bigint GENERATED ALWAYS AS IDENTITY` (Postgres) / `BIGINT UNSIGNED AUTO_INCREMENT` (MySQL). Use `int` only if you're sure it won't pass 2.1B — migrating int→bigint on a big table is painful.
- **UUIDs**: good when IDs are generated client-side, exposed publicly, or merged across systems. Prefer **UUIDv7** (time-ordered) over v4 to avoid random B-tree inserts — v4 PKs fragment InnoDB clustered indexes badly. Store as `uuid` (PG) or `BINARY(16)` (MySQL), not `CHAR(36)`.
- **Natural keys** (email, SKU) go in a `UNIQUE` constraint, not the PK — they change.
- **Composite PKs** are fine for pure join tables (`(user_id, role_id)`).
- In multi-tenant systems, consider leading with `tenant_id` in PKs/indexes so per-tenant queries stay local; enforce tenant isolation with composite FKs or Postgres RLS.

## 3. Types

| Data            | Use                                                                                                                | Avoid                                                                    |
| --------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| Money           | `NUMERIC(19,4)` or integer minor units (`bigint` cents) + currency code                                            | `float`, `double`, `money` (PG)                                          |
| Timestamps      | `timestamptz` (PG); MySQL `DATETIME(6)` stored as UTC (TIMESTAMP has 2038 limit)                                   | local-time `timestamp` without zone                                      |
| Strings         | `text` (PG) w/ `CHECK (length(x) <= n)` if needed; `VARCHAR(n)` in MySQL with `utf8mb4`                            | `utf8` (MySQL 3-byte)                                                    |
| Enums           | lookup table, or `text` + `CHECK (x IN (...))`; PG `ENUM` is ok but adding values has caveats and removing is hard | magic integers without docs                                              |
| Booleans        | `boolean`                                                                                                          | `'Y'/'N'` strings                                                        |
| Semi-structured | `jsonb` (PG) / `JSON` (MySQL) for genuinely variable attributes                                                    | jsonb for fields you filter/join on constantly — promote them to columns |
| IP / ranges     | PG `inet`, `cidr`, `tstzrange`                                                                                     | strings                                                                  |

## 4. Constraints

- `NOT NULL` by default; nullable only when "unknown/absent" is a real state.
- `UNIQUE` for every business uniqueness rule. For "unique among non-deleted rows": PG partial unique index `CREATE UNIQUE INDEX … WHERE deleted_at IS NULL`; MySQL has no partial indexes — use a generated column (e.g. `active_flag` that is NULL when deleted) in the unique key.
- Case-insensitive uniqueness: PG `UNIQUE (lower(email))` index or `citext`; MySQL relies on `_ci` collation.
- `CHECK` for ranges and state rules (`quantity > 0`, `ends_at > starts_at`). MySQL enforces CHECK only from 8.0.16.
- Foreign keys: keep them unless you have a measured reason. **Index the FK column on the child table** — Postgres does not do this automatically, and unindexed FKs make parent deletes/updates scan the child and cause lock contention.
- Postgres exclusion constraints for no-overlap rules (bookings): `EXCLUDE USING gist (room_id WITH =, during WITH &&)`.

## 5. Relationships & common patterns

- **Many-to-many**: join table with composite PK, plus an index on the reverse direction `(b_id, a_id)`.
- **Soft delete**: `deleted_at timestamptz NULL`. Costs: every query needs the filter, unique constraints need partial indexes, FKs still point at "deleted" rows. Consider an archive table or event log instead if soft delete is only for audit.
- **Audit/history**: append-only `*_history` table or event table written in the same transaction; avoid triggers that silently double write volume without the team knowing.
- **Polymorphic associations** (`commentable_type`, `commentable_id`): no FK integrity. Prefer separate nullable FK columns with a `CHECK (num_nonnulls(a_id, b_id) = 1)` or separate join tables.
- **EAV** (entity-attribute-value): almost always worse than `jsonb` columns + targeted indexes.
- **Hierarchies**: adjacency list + recursive CTE is the default; `ltree`/materialized path for deep read-heavy trees; closure table if you need fast ancestor/descendant queries both ways.
- **Status/state machines**: store state as constrained text, transition with `UPDATE … WHERE id = $1 AND status = 'expected'` and check rows affected.
- **Counters**: hot single-row counters become lock bottlenecks; use sharded counter rows or async aggregation.

## 6. Normalization vs denormalization

Start at 3NF. Denormalize only for a specific, measured read path, and decide how the copy stays consistent (same-transaction write, trigger, or async job with acceptable staleness). Document it. Materialized views (PG) are a good middle ground for reporting reads (`REFRESH MATERIALIZED VIEW CONCURRENTLY` needs a unique index).

## 7. Document (MongoDB) modeling

- Model for the access pattern: **embed** what is read together and bounded in size (address in user); **reference** what is unbounded or shared (orders of a user, comments on a post).
- Never let arrays grow unbounded (16MB doc limit, and large docs make every update expensive). Use the bucket pattern or a separate collection.
- Use schema validation (`$jsonSchema`) — "schemaless" means the schema lives in code, which drifts.
- Unique indexes enforce invariants just like in SQL; multi-document transactions exist (replica set required) but design so most writes are single-document atomic.
- Choose shard keys early if sharding is likely: high cardinality, even distribution, present in most queries; avoid monotonically increasing keys (hot shard).

## 8. Review checklist

- [ ] Every table has a PK; key type will not overflow
- [ ] Business uniqueness rules are UNIQUE constraints (incl. soft-delete and case-insensitive cases)
- [ ] FKs exist and child FK columns are indexed
- [ ] Money not in float; times are timezone-aware/UTC
- [ ] `NOT NULL` used deliberately; defaults sensible
- [ ] CHECK constraints for ranges/states
- [ ] Indexes map to known queries; no duplicate/prefix-redundant indexes
- [ ] Deletion semantics defined (cascade/restrict/soft)
- [ ] Multi-tenant isolation enforced at the data layer if relevant
- [ ] Large/hot tables identified with a plan (partitioning, retention)
