import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { CLUB_NAMES } from "@/features/tiki-taka-toe/grid";
import { fetchAll } from "@/lib/supabase/fetch-all";
import { fetchClubMembers, fetchPeople, type WikidataPlayer } from "@/lib/wikidata/barca-players";
import {
  articleUrl,
  fetchArticleHtml,
  wikidataIdsFor,
  type PersonRef,
} from "@/lib/wikipedia/barca-history";
import {
  LIGA_PAGES,
  countWins,
  parseAwardWinners,
  parseLigaClubs,
  parseLigaRecords,
  parseLigaScorers,
} from "@/lib/wikipedia/la-liga";

import { ligaLists, type LigaSources } from "./liga-lists";
import { saveCheckedLists, searchText } from "./server";

/**
 * One-time (re-runnable) import of all of La Liga for trivia. About 2–4 minutes, so it runs as
 * a script (`scripts/trivia-la-liga.ts`), not on Vercel:
 *  1. Wikipedia: every club that has played in La Liga, records, 100+ goal scorers, Pichichi
 *     and Zamora winners — parsed facts kept in `trivia_sources`.
 *  2. Wikidata: everyone who played for those clubs (and for famous foreign clubs, among them),
 *     with nationality, position and fame — upserted into `trivia_players`, club links into
 *     `trivia_player_clubs`.
 *  3. La Liga stats and trophies onto players; Culé Ten lists checked and saved.
 */

type Log = (msg: string) => void;

const check = <T>(r: { data: T; error: { message: string } | null }, what: string): T => {
  if (r.error) throw new Error(`${what}: ${r.error.message}`);
  return r.data;
};

/** Runs `fn` over items with at most `limit` in flight (polite to Wikidata). */
async function pool<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]!);
      }
    }),
  );
  return out;
}

async function retry<T>(fn: () => Promise<T>, tries = 3): Promise<T> {
  for (let i = 1; ; i++) {
    try {
      return await fn();
    } catch (err) {
      if (i >= tries) throw err;
      await new Promise((r) => setTimeout(r, 2000 * i));
    }
  }
}

const personRow = (p: WikidataPlayer, extra: Record<string, unknown> = {}) => ({
  wikidata_id: p.wikidataId,
  name: p.name,
  search_text: searchText(p.name, p.aliases),
  nationality: p.nationality,
  country_code: p.countryCode,
  position: p.position,
  birth_year: p.birthYear,
  fame: p.fame,
  ...extra,
});

export async function importLaLiga(db: SupabaseClient, log: Log = () => {}) {
  // --- 1. Wikipedia --------------------------------------------------------------------
  const pages = Object.entries(LIGA_PAGES) as [keyof typeof LIGA_PAGES, string][];
  const html = Object.fromEntries(
    await Promise.all(pages.map(async ([k, t]) => [k, await retry(() => fetchArticleHtml(t))])),
  ) as Record<keyof typeof LIGA_PAGES, string>;
  const clubs = parseLigaClubs(html.clubs).filter(
    (c) => c.club.title && !/La Liga|^\d{4}/.test(c.club.title),
  );
  const src: LigaSources = {
    scorers: parseLigaScorers(html.scorers),
    records: parseLigaRecords(html.records),
    pichichi: parseAwardWinners(html.pichichi, /^Men/),
    zamora: parseAwardWinners(html.zamora, /^Winners$/),
  };
  if (
    clubs.length < 50 ||
    src.scorers.length < 60 ||
    src.records.apps.length < 20 ||
    src.pichichi.length < 80 ||
    src.zamora.length < 80
  ) {
    throw new Error("Wikipedia pages didn't parse as expected, so nothing was changed.");
  }
  const fetchedAt = new Date().toISOString();
  const facts = { clubs, ...src };
  check(
    await db.from("trivia_sources").upsert(
      pages.map(([key, title]) => ({
        key: `liga:${key}`,
        title,
        url: articleUrl(title),
        data: facts[key],
        fetched_at: fetchedAt,
      })),
      { onConflict: "key" },
    ),
    "save sources",
  );
  log(
    `Wikipedia: ${clubs.length} clubs, ${src.scorers.length} scorers, ${src.pichichi.length} Pichichi seasons`,
  );

  // --- 2. Clubs ------------------------------------------------------------------------
  const clubQids = await wikidataIdsFor(clubs.map((c) => c.club.title!));
  const ligaClubs = clubs.flatMap((c) => {
    const qid = clubQids.get(c.club.title!);
    return qid ? [{ qid, title: c.club.title!, short: c.club.name, rank: c.rank }] : [];
  });
  const existingClubs = await fetchAll<{ qid: string; name: string }>(
    db,
    "trivia_clubs",
    "qid, name",
    "load clubs",
    "qid",
  );
  const known = new Map(existingClubs.map((c) => [c.qid, c.name]));
  const missingClubs = ligaClubs.filter((c) => !known.has(c.qid));
  if (missingClubs.length) {
    check(
      await db.from("trivia_clubs").insert(
        missingClubs.map((c) => ({
          qid: c.qid,
          name: c.title,
          short_name: c.short,
          liga: true,
          liga_rank: c.rank,
        })),
      ),
      "add clubs",
    );
  }
  await pool(
    ligaClubs.filter((c) => known.has(c.qid)),
    8,
    async (c) =>
      check(
        await db
          .from("trivia_clubs")
          .update({ short_name: c.short, liga: true, liga_rank: c.rank })
          .eq("qid", c.qid),
        "update club",
      ),
  );
  const ligaQids = new Set(ligaClubs.map((c) => c.qid));
  const foreignClubs = existingClubs.filter((c) => CLUB_NAMES[c.name] && !ligaQids.has(c.qid));
  log(
    `Clubs: ${ligaClubs.length} La Liga (${missingClubs.length} new), ${foreignClubs.length} famous foreign`,
  );

  // --- 3. Members of every club (Wikidata) ----------------------------------------------
  const allClubs = [...ligaClubs.map((c) => c.qid), ...foreignClubs.map((c) => c.qid)];
  const members = new Map<string, string[]>();
  await pool(allClubs, 4, async (qid) => {
    members.set(qid, await retry(() => fetchClubMembers(qid)));
  });
  const ligaPlayers = new Set(ligaClubs.flatMap((c) => members.get(c.qid) ?? []));
  log(`Wikidata: ${ligaPlayers.size} La Liga players`);

  // --- 4. People details, upserted -------------------------------------------------------
  const ids = [...ligaPlayers];
  const people: WikidataPlayer[] = [];
  const chunks = Array.from({ length: Math.ceil(ids.length / 300) }, (_, i) =>
    ids.slice(i * 300, i * 300 + 300),
  );
  await pool(chunks, 3, async (chunk) => {
    people.push(...(await retry(() => fetchPeople(chunk, globalThis.fetch, 300))));
  });
  for (let i = 0; i < people.length; i += 500) {
    check(
      await db.from("trivia_players").upsert(
        people.slice(i, i + 500).map((p) => personRow(p, { liga: true })),
        { onConflict: "wikidata_id" },
      ),
      "save players",
    );
  }
  log(`Players: ${people.length} saved`);

  const repo = await fetchAll<{
    id: number;
    wikidata_id: string | null;
    country_code: string | null;
  }>(db, "trivia_players", "id, wikidata_id, country_code", "load repository");
  const byQid = new Map(
    repo.filter((r) => r.wikidata_id).map((r) => [r.wikidata_id!, Number(r.id)]),
  );

  // --- 5. Club links ---------------------------------------------------------------------
  const links: { player_id: number; club_qid: string }[] = [];
  for (const [club, qids] of members) {
    const foreign = !ligaQids.has(club);
    for (const q of qids) {
      // Foreign clubs only matter for people who also played in La Liga.
      if (foreign && !ligaPlayers.has(q)) continue;
      const id = byQid.get(q);
      if (id) links.push({ player_id: id, club_qid: club });
    }
  }
  for (let i = 0; i < links.length; i += 1000) {
    check(
      await db.from("trivia_player_clubs").upsert(links.slice(i, i + 1000), {
        onConflict: "player_id,club_qid",
        ignoreDuplicates: true,
      }),
      "save club links",
    );
  }
  log(`Club links: ${links.length}`);

  // --- 6. Trophies and La Liga stats from Wikipedia ---------------------------------------
  const refs: PersonRef[] = [
    ...src.scorers.map((s) => s.person),
    ...Object.values(src.records)
      .flat()
      .map((r) => r.person),
    ...src.pichichi.flatMap((s) => s.winners),
    ...src.zamora.flatMap((s) => s.winners),
  ];
  const titleQids = await wikidataIdsFor(refs.flatMap((r) => (r.title ? [r.title] : [])));
  const coaches = new Set(
    [...src.records.coachMatches, ...src.records.coachWins, ...src.records.coachTitles].flatMap(
      (r) => (r.person.title ? [titleQids.get(r.person.title)] : []),
    ),
  );
  const missing = [...new Set(titleQids.values())].filter((q) => !byQid.has(q));
  if (missing.length) {
    const found = await fetchPeople(missing, globalThis.fetch, 100);
    const added = check(
      await db
        .from("trivia_players")
        .upsert(
          found.map((p) =>
            personRow(p, { roles: coaches.has(p.wikidataId) ? ["manager"] : ["player"] }),
          ),
          { onConflict: "wikidata_id" },
        )
        .select("id, wikidata_id"),
      "add people",
    ) as { id: number; wikidata_id: string }[];
    for (const a of added) byQid.set(a.wikidata_id, Number(a.id));
  }
  const idOf = (p: PersonRef) => {
    const q = p.title ? titleQids.get(p.title) : undefined;
    return q ? (byQid.get(q) ?? null) : null;
  };

  const updates = new Map<number, Record<string, number>>();
  const set = (p: PersonRef, field: string, value: number) => {
    const id = idOf(p);
    if (id == null) return;
    updates.set(id, { ...(updates.get(id) ?? {}), [field]: value });
  };
  for (const s of src.scorers) {
    set(s.person, "liga_goals", s.goals);
    if (s.apps != null) set(s.person, "liga_apps", s.apps);
  }
  for (const r of src.records.apps) set(r.person, "liga_apps", r.value);
  for (const { person, wins } of countWins(src.pichichi).values()) set(person, "pichichis", wins);
  for (const { person, wins } of countWins(src.zamora).values()) set(person, "zamoras", wins);
  await pool([...updates], 8, async ([id, fields]) =>
    check(await db.from("trivia_players").update(fields).eq("id", id), "save stats"),
  );
  log(`Stats and trophies: ${updates.size} people`);

  // --- 7. Culé Ten lists -----------------------------------------------------------------
  const country = new Map(repo.map((r) => [Number(r.id), r.country_code]));
  const lists = ligaLists(src, idOf, (id) => country.get(id) ?? null);
  const { live, kept, drafts } = await saveCheckedLists(db, lists);

  return {
    ok: true,
    message:
      `Imported La Liga: ${ligaClubs.length} clubs, ${people.length} players, ${links.length} club links; ` +
      `${live} lists live, ${drafts.length} drafts to review` +
      (kept ? `, ${kept} reviewed lists left as they were.` : ".") +
      (drafts.length ? ` Drafts: ${drafts.join(" · ")}` : ""),
  };
}
