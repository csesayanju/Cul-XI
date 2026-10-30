import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { CLUB_NAMES } from "@/features/tiki-taka-toe/grid";
import { fetchAll } from "@/lib/supabase/fetch-all";
import { fetchCareers, fetchClubLogos } from "@/lib/wikidata/careers";
import { fetchWikipediaBadges } from "@/lib/wikipedia/club-badges";

import { normaliseCareer } from "./career";

/**
 * One-time (re-runnable) imports for the extra games, run with `scripts/trivia-extras.ts`:
 *  - club logos for Tiki-Taka-Toe (free Commons files only; never FC Barcelona's crest);
 *  - club careers of well-known La Liga players for Career Path.
 */

type Log = (msg: string) => void;

const check = <T>(r: { data: T; error: { message: string } | null }, what: string): T => {
  if (r.error) throw new Error(`${what}: ${r.error.message}`);
  return r.data;
};

/** The app never shows FC Barcelona's crest (project rule); its monogram is used instead. */
export const NO_LOGO = new Set(["Q7156"]);

/** Players famous enough (Wikipedia languages) to be a fair Career Path puzzle. */
const CAREER_MIN_FAME = 30;

export async function importClubLogos(db: SupabaseClient, log: Log = () => {}) {
  const clubs = await fetchAll<{
    qid: string;
    name: string;
    liga: boolean;
    liga_rank: number | null;
  }>(db, "trivia_clubs", "qid, name, liga, liga_rank", "load clubs", "qid");
  // Clubs that can show up in a grid, plus every La Liga club (for Career Path).
  const wanted = clubs.filter((c) => (c.liga || CLUB_NAMES[c.name]) && !NO_LOGO.has(c.qid));
  const logos = await fetchClubLogos(wanted.map((c) => c.qid));
  for (const [qid, file] of logos) {
    check(await db.from("trivia_clubs").update({ logo_file: file }).eq("qid", qid), "save logo");
  }
  log(`Club logos: ${logos.size} of ${wanted.length} clubs have a free logo on Commons`);
  return logos.size;
}

/**
 * Badges for clubs still without a free Commons logo: the crest from the club's English
 * Wikipedia article (hotlinked, URL only). FC Barcelona is skipped.
 */
export async function importWikipediaBadges(db: SupabaseClient, log: Log = () => {}) {
  const clubs = await fetchAll<{ qid: string; logo_file: string | null }>(
    db,
    "trivia_clubs",
    "qid, logo_file",
    "load clubs",
    "qid",
  );
  const missing = clubs.filter((c) => !c.logo_file && !NO_LOGO.has(c.qid)).map((c) => c.qid);
  const badges = await fetchWikipediaBadges(missing);
  let saved = 0;
  const entries = [...badges];
  for (let i = 0; i < entries.length; i += 8) {
    await Promise.all(
      entries.slice(i, i + 8).map(async ([qid, b]) => {
        check(
          await db
            .from("trivia_clubs")
            .update({ logo_url: b.url, logo_page: b.page })
            .eq("qid", qid),
          "save badge",
        );
        saved++;
      }),
    );
  }
  log(`Wikipedia badges: ${saved} of ${missing.length} clubs without a Commons logo`);
  return saved;
}

export async function importCareers(db: SupabaseClient, log: Log = () => {}) {
  // PostgREST returns at most 1,000 rows per request: page through.
  const players: { id: number; qid: string }[] = [];
  for (let from = 0; ; from += 1000) {
    const page = check(
      await db
        .from("trivia_players")
        .select("id, wikidata_id")
        .eq("liga", true)
        .gte("fame", CAREER_MIN_FAME)
        .not("wikidata_id", "is", null)
        .order("id")
        .range(from, from + 999),
      "load players",
    ) as { id: number; wikidata_id: string }[];
    players.push(...page.map((p) => ({ id: Number(p.id), qid: p.wikidata_id })));
    if (page.length < 1000) break;
  }

  const knownClubs = new Set(
    (await fetchAll<{ qid: string }>(db, "trivia_clubs", "qid", "load clubs", "qid")).map(
      (c) => c.qid,
    ),
  );
  let saved = 0;
  for (let i = 0; i < players.length; i += 150) {
    const batch = players.slice(i, i + 150);
    const careers = await fetchCareers(batch.map((p) => p.qid));
    const newClubs = new Map<string, string>();
    const rows: {
      player_id: number;
      seq: number;
      club_qid: string;
      from_year: number | null;
      to_year: number | null;
    }[] = [];
    for (const p of batch) {
      const career = normaliseCareer(careers.get(p.qid) ?? []);
      career.forEach((s, j) => {
        if (!knownClubs.has(s.clubId)) newClubs.set(s.clubId, s.clubName);
        rows.push({
          player_id: p.id,
          seq: j + 1,
          club_qid: s.clubId,
          from_year: s.from,
          to_year: s.to,
        });
      });
      if (career.length) saved++;
    }
    if (newClubs.size) {
      check(
        await db.from("trivia_clubs").upsert(
          [...newClubs].map(([qid, name]) => ({ qid, name })),
          { onConflict: "qid", ignoreDuplicates: true },
        ),
        "add clubs",
      );
      for (const q of newClubs.keys()) knownClubs.add(q);
    }
    check(
      await db
        .from("trivia_careers")
        .delete()
        .in(
          "player_id",
          batch.map((p) => p.id),
        ),
      "clear careers",
    );
    for (let j = 0; j < rows.length; j += 1000) {
      check(await db.from("trivia_careers").insert(rows.slice(j, j + 1000)), "save careers");
    }
    log(`Careers: ${Math.min(i + 150, players.length)}/${players.length} players`);
  }
  return { players: players.length, saved };
}
