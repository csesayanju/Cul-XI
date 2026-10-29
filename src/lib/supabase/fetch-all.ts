import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * PostgREST returns at most 1,000 rows per request: page through the whole table. `orderBy`
 * must make the order unique (pass several columns for a composite key).
 */
export async function fetchAll<T>(
  db: SupabaseClient,
  table: string,
  columns: string,
  what: string,
  orderBy: string | string[] = "id",
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    let query = db.from(table).select(columns);
    for (const column of [orderBy].flat()) query = query.order(column);
    const { data, error } = await query.range(from, from + 999);
    if (error) throw new Error(`${what}: ${error.message}`);
    const page = (data ?? []) as T[];
    out.push(...page);
    if (page.length < 1000) return out;
  }
}
