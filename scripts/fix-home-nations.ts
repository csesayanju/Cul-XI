/**
 * One-off: players stored as "United Kingdom" (GB) get their football nation instead —
 * England, Scotland, Wales or Northern Ireland — from Wikidata (country for sport, else
 * birthplace). Re-runnable; the importers now do this themselves.
 * Usage: NODE_OPTIONS=--conditions=react-server pnpm exec tsx scripts/fix-home-nations.ts
 */
import { config } from "dotenv";

config({ path: [".env.local", ".env"], quiet: true });

const { createAdminClient } = await import("../src/lib/supabase/admin");
const { fetchPeople } = await import("../src/lib/wikidata/barca-players");

const db = createAdminClient();
const gb: { id: number; wikidata_id: string }[] = [];
for (let from = 0; ; from += 1000) {
  const { data, error } = await db
    .from("trivia_players")
    .select("id, wikidata_id")
    .eq("country_code", "GB")
    .not("wikidata_id", "is", null)
    .order("id")
    .range(from, from + 999);
  if (error) throw new Error(error.message);
  gb.push(...(data as typeof gb));
  if (data.length < 1000) break;
}
const people = await fetchPeople(
  gb.map((p) => p.wikidata_id),
  globalThis.fetch,
  100,
);
const byQid = new Map(people.map((p) => [p.wikidataId, p]));
const tally = new Map<string, number>();
for (const row of gb) {
  const p = byQid.get(row.wikidata_id);
  if (!p?.countryCode || p.countryCode === "GB") continue;
  const { error } = await db
    .from("trivia_players")
    .update({ country_code: p.countryCode, nationality: p.nationality })
    .eq("id", row.id);
  if (error) throw new Error(error.message);
  tally.set(p.nationality ?? p.countryCode, (tally.get(p.nationality ?? p.countryCode) ?? 0) + 1);
}
const left = gb.length - [...tally.values()].reduce((a, b) => a + b, 0);
console.log(
  `${gb.length} GB players: ${[...tally].map(([k, n]) => `${k} ${n}`).join(", ")}; ${left} left as United Kingdom`,
);
