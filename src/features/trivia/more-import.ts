import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { fetchAll } from "@/lib/supabase/fetch-all";
import { fetchPeople } from "@/lib/wikidata/barca-players";
import {
  articleUrl,
  cell,
  fetchArticleHtml,
  personIn,
  tablesOf,
  text,
  wikidataIdsFor,
  type PersonRef,
} from "@/lib/wikipedia/barca-history";
import { FINALS_LISTS, parseFinalsList, parseLineups, type FinalRef } from "@/lib/wikipedia/finals";

import { searchText } from "./server";

/**
 * One-time (re-runnable) imports for the newer games, run with `scripts/trivia-more.ts`:
 *  - Ballon d'Or wins and podiums (Wikipedia) onto players;
 *  - starting line-ups of European finals with Spanish clubs (Missing XI).
 */

type Log = (msg: string) => void;

const check = <T>(r: { data: T; error: { message: string } | null }, what: string): T => {
  if (r.error) throw new Error(`${what}: ${r.error.message}`);
  return r.data;
};

async function retry<T>(fn: () => Promise<T>, tries = 3): Promise<T> {
  for (let i = 1; ; i++) {
    try {
      return await fn();
    } catch (err) {
      if (i >= tries) throw err;
      await new Promise((r) => setTimeout(r, 1500 * i));
    }
  }
}

/** Wikipedia people -> repository ids; anyone missing is added from Wikidata. */
async function resolvePeople(db: SupabaseClient, refs: PersonRef[]) {
  const qids = await wikidataIdsFor(refs.flatMap((r) => (r.title ? [r.title] : [])));
  const repo = await fetchAll<{ id: number; wikidata_id: string | null }>(
    db,
    "trivia_players",
    "id, wikidata_id",
    "load repository",
  );
  const byQid = new Map(
    repo.filter((r) => r.wikidata_id).map((r) => [r.wikidata_id!, Number(r.id)]),
  );
  const missing = [...new Set(qids.values())].filter((q) => !byQid.has(q));
  if (missing.length) {
    const people = await fetchPeople(missing, globalThis.fetch, 100);
    for (let i = 0; i < people.length; i += 500) {
      const added = check(
        await db
          .from("trivia_players")
          .upsert(
            people.slice(i, i + 500).map((p) => ({
              wikidata_id: p.wikidataId,
              name: p.name,
              search_text: searchText(p.name, p.aliases),
              nationality: p.nationality,
              country_code: p.countryCode,
              position: p.position,
              birth_year: p.birthYear,
              fame: p.fame,
            })),
            { onConflict: "wikidata_id" },
          )
          .select("id, wikidata_id"),
        "add people",
      ) as { id: number; wikidata_id: string }[];
      for (const a of added) byQid.set(a.wikidata_id, Number(a.id));
    }
  }
  return (p: PersonRef) => {
    const q = p.title ? qids.get(p.title) : undefined;
    return q ? (byQid.get(q) ?? null) : null;
  };
}

// ---------------------------------------------------------------------------------------
// Ballon d'Or
// ---------------------------------------------------------------------------------------

export async function importBallonDor(db: SupabaseClient, log: Log = () => {}) {
  const title = "Ballon d'Or";
  const html = await retry(() => fetchArticleHtml(title));
  const table = tablesOf(html).find(
    (t) => t.headers.includes("Rank") && t.headers.some((h) => /^Player/.test(h)),
  );
  if (!table) throw new Error("Ballon d'Or table not found; nothing changed.");
  const rows = table.rows.flatMap((row) => {
    const person = personIn(cell(table, row, /^Player/));
    const rank = Number.parseInt(text(cell(table, row, /^Rank/)), 10);
    const year = Number.parseInt(text(cell(table, row, /^Year/)), 10);
    return person && rank >= 1 && rank <= 3 ? [{ person, rank, year }] : [];
  });
  if (rows.length < 150) throw new Error(`Ballon d'Or: only ${rows.length} podiums parsed.`);
  check(
    await db.from("trivia_sources").upsert(
      {
        key: "ballon:podiums",
        title,
        url: articleUrl(title),
        data: rows,
        fetched_at: new Date().toISOString(),
      },
      { onConflict: "key" },
    ),
    "save source",
  );

  const idOf = await resolvePeople(
    db,
    rows.map((r) => r.person),
  );
  const tally = new Map<number, { wins: number; podiums: number }>();
  for (const r of rows) {
    const id = idOf(r.person);
    if (id == null) continue;
    const t = tally.get(id) ?? { wins: 0, podiums: 0 };
    t.podiums++;
    if (r.rank === 1) t.wins++;
    tally.set(id, t);
  }
  for (const [id, t] of tally) {
    check(
      await db
        .from("trivia_players")
        .update({ ballon_dors: t.wins, ballon_podiums: t.podiums })
        .eq("id", id),
      "save Ballon d'Or",
    );
  }
  log(`Ballon d'Or: ${rows.length} podiums, ${tally.size} players`);
  return tally.size;
}

// ---------------------------------------------------------------------------------------
// Finals line-ups (Missing XI)
// ---------------------------------------------------------------------------------------

export async function importFinalLineups(db: SupabaseClient, log: Log = () => {}) {
  const finals: FinalRef[] = [];
  for (const l of FINALS_LISTS) {
    finals.push(...parseFinalsList(await retry(() => fetchArticleHtml(l.title)), l.competition));
  }
  if (finals.length < 40) throw new Error(`Finals: only ${finals.length} found; nothing changed.`);

  // Line-ups of every final (sequential: polite to Wikipedia).
  const parsed: { final: FinalRef; sides: ReturnType<typeof parseLineups> }[] = [];
  for (const f of finals) {
    try {
      const sides = parseLineups(await retry(() => fetchArticleHtml(f.title)));
      if (sides.length >= 2) parsed.push({ final: f, sides: sides.slice(0, 2) });
    } catch {
      // A missing page is just skipped.
    }
  }
  const idOf = await resolvePeople(
    db,
    parsed.flatMap((p) => p.sides.flat().map((x) => x.person)),
  );

  // Which side is the La Liga team: most of its XI played in La Liga, and the club they
  // share most is a La Liga club.
  const ids = [...new Set(parsed.flatMap((p) => p.sides.flat().map((x) => idOf(x.person))))].filter(
    (id): id is number => id != null,
  );
  const liga = new Set<number>();
  const clubsOf = new Map<number, string[]>();
  for (let i = 0; i < ids.length; i += 300) {
    const chunk = ids.slice(i, i + 300);
    const [{ data: players }, { data: links }] = await Promise.all([
      db.from("trivia_players").select("id, liga").in("id", chunk),
      db.from("trivia_player_clubs").select("player_id, club_qid").in("player_id", chunk),
    ]);
    for (const p of players ?? []) if (p.liga) liga.add(Number(p.id));
    for (const l of links ?? []) {
      const id = Number(l.player_id);
      clubsOf.set(id, [...(clubsOf.get(id) ?? []), l.club_qid as string]);
    }
  }
  const clubs = await fetchAll<{
    qid: string;
    name: string;
    short_name: string | null;
    liga: boolean;
  }>(db, "trivia_clubs", "qid, name, short_name, liga", "load clubs", "qid");
  const ligaClub = new Map(clubs.filter((c) => c.liga).map((c) => [c.qid, c.short_name ?? c.name]));

  let saved = 0;
  for (const { final, sides } of parsed) {
    for (const [s, xi] of sides.entries()) {
      const playerIds = xi.map((x) => idOf(x.person));
      if (playerIds.some((id) => id == null)) continue;
      if (playerIds.filter((id) => liga.has(id!)).length < 7) continue;
      const counts = new Map<string, number>();
      for (const id of playerIds) {
        for (const q of clubsOf.get(id!) ?? []) {
          if (ligaClub.has(q)) counts.set(q, (counts.get(q) ?? 0) + 1);
        }
      }
      const [teamQid, n] = [...counts].sort((a, b) => b[1] - a[1])[0] ?? [null, 0];
      if (!teamQid || n < 7) continue;
      check(
        await db.from("trivia_lineups").upsert(
          {
            key: `${final.title}#${s}`,
            title: final.title,
            competition: final.competition,
            year: final.year,
            team: ligaClub.get(teamQid)!,
            team_qid: teamQid,
            players: xi.map((x, i) => ({
              pos: x.pos,
              number: x.number,
              playerId: playerIds[i],
              captain: x.captain,
            })),
          },
          { onConflict: "key" },
        ),
        "save line-up",
      );
      saved++;
    }
  }
  log(
    `Finals: ${finals.length} with Spanish clubs, ${parsed.length} parsed, ${saved} line-ups saved`,
  );
  return saved;
}
