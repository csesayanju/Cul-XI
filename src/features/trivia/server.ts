import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { importClubs } from "@/features/tiki-taka-toe/server";
import { seasonLabel } from "@/lib/highlightly/mappers";
import { fetchBarcaPlayers, fetchPeople } from "@/lib/wikidata/barca-players";
import {
  articleUrl,
  fetchArticleHtml,
  HISTORY_PAGES,
  parsePlayers,
  parseRecords,
  parseSeasons,
  parseStaff,
  wikidataIdsFor,
  type PersonRef,
} from "@/lib/wikipedia/barca-history";
import { fetchAll } from "@/lib/supabase/fetch-all";
import { normalise } from "@/lib/wikipedia/player-photo";

import {
  applyGuess,
  NEW_ATTEMPT,
  pickDailyList,
  publicView,
  streak,
  type AttemptState,
  type GuessOutcome,
  type SlotView,
  type TriviaEntry,
} from "./game";
import { historyLists, type HistorySources } from "./history-lists";
import { AUTO_TEMPLATES, autoLists, wikidataDrafts, type CurrentPlayerStats } from "./lists";
import { matchPlayer } from "./matching";

/** All writes here use the service-role client: answers never reach the browser. */

const check = <T>(r: { data: T; error: { message: string } | null }, what: string): T => {
  if (r.error) throw new Error(`${what}: ${r.error.message}`);
  return r.data;
};

/** "pedri | pedro gonzalez lopez" — every name variant, normalised, for autocomplete. */
export const searchText = (name: string, aliases: string[] = []) =>
  [name, ...aliases].map(normalise).filter(Boolean).join(" | ");

// ---------------------------------------------------------------------------------------
// Repository
// ---------------------------------------------------------------------------------------

/** One-time (re-runnable) import of every Barça player from Wikidata, then drafts lists. */
export async function importRepository(db: SupabaseClient, barcaTeamId: number) {
  const players = await fetchBarcaPlayers();
  const rows = players.map((p) => ({
    wikidata_id: p.wikidataId,
    name: p.name,
    search_text: searchText(p.name, p.aliases),
    nationality: p.nationality,
    country_code: p.countryCode,
    position: p.position,
    birth_year: p.birthYear,
    barca_from: p.barcaFrom,
    barca_to: p.barcaTo,
    wd_apps: p.apps,
    wd_goals: p.goals,
  }));
  for (let i = 0; i < rows.length; i += 500) {
    check(
      await db.from("trivia_players").upsert(rows.slice(i, i + 500), { onConflict: "wikidata_id" }),
      "save trivia players",
    );
  }
  const linked = await linkCurrentPlayers(db, barcaTeamId);
  const drafts = await saveDrafts(db);
  const clubs = await importClubs(db);
  return {
    ok: true,
    message: `Imported ${rows.length} Barça players from Wikidata; linked ${linked.size} current players; ${drafts} draft lists to review; ${clubs.links} other-club links for Tiki-Taka-Toe.`,
  };
}

interface RepoRow {
  id: number;
  api_player_id: number | null;
  wikidata_id: string | null;
  search_text: string;
  barca_from: number | null;
  barca_to: number | null;
  wd_apps: number | null;
}

/**
 * Makes sure every current Barça player is in the repository, linked by API id. Existing
 * Wikidata records (recent Barça players) are matched by name — including initials and short
 * vs. full names — so nobody is listed twice; earlier API-only duplicates are merged.
 * Returns api_player_id -> trivia player id.
 */
export async function linkCurrentPlayers(db: SupabaseClient, barcaTeamId: number) {
  const current = check(
    await db
      .from("players")
      .select("api_player_id, name, full_name, position")
      .eq("team_api_id", barcaTeamId),
    "load current players",
  ) as { api_player_id: number; name: string; full_name: string | null; position: string }[];
  const repo = await fetchAll<RepoRow>(
    db,
    "trivia_players",
    "id, api_player_id, wikidata_id, search_text, barca_from, barca_to, wd_apps",
    "load repository",
  );

  const recentYear = new Date().getUTCFullYear() - 3;
  const candidates = () =>
    repo
      .filter((r) => r.wikidata_id && !r.api_player_id)
      .filter((r) => (r.barca_to ?? 9999) >= recentYear || (r.barca_from ?? 0) >= recentYear)
      .map((r) => ({
        id: Number(r.id),
        variants: r.search_text.split(" | "),
        apps: r.wd_apps ?? 0,
      }));
  const byApi = new Map(
    repo.filter((r) => r.api_player_id).map((r) => [Number(r.api_player_id), r]),
  );
  const linked = new Map<number, number>();

  for (const p of current) {
    const apiId = Number(p.api_player_id);
    let row = byApi.get(apiId);

    // Not linked yet, or linked to an API-only duplicate: try to find the Wikidata record.
    if (!row || !row.wikidata_id) {
      const match = matchPlayer([p.name, p.full_name], candidates());
      if (match) {
        const target = repo.find((r) => Number(r.id) === match.id)!;
        if (row) {
          // Move the API id off the duplicate, then remove it (kept if a list still uses it).
          check(
            await db.from("trivia_players").update({ api_player_id: null }).eq("id", row.id),
            "unlink duplicate",
          );
          await db.from("trivia_players").delete().eq("id", row.id);
          row.api_player_id = null;
        }
        check(
          await db.from("trivia_players").update({ api_player_id: apiId }).eq("id", target.id),
          "link player",
        );
        target.api_player_id = apiId;
        row = target;
      }
    }

    if (!row) {
      const created = check(
        await db
          .from("trivia_players")
          .insert({
            api_player_id: apiId,
            name: p.name,
            search_text: searchText(p.name, p.full_name ? [p.full_name] : []),
            position: p.position,
          })
          .select("id, api_player_id, wikidata_id, search_text, barca_from, barca_to, wd_apps")
          .single(),
        "add current player",
      ) as RepoRow;
      row = created;
      repo.push(created);
    }
    linked.set(apiId, Number(row.id));
  }
  return linked;
}

/** Saves Wikidata drafts (never touching lists an admin already approved or archived). */
async function saveDrafts(db: SupabaseClient) {
  const repo = await fetchAll<{
    id: number;
    name: string;
    nationality: string | null;
    wd_apps: number | null;
    wd_goals: number | null;
  }>(db, "trivia_players", "id, name, nationality, wd_apps, wd_goals", "load repository");
  const drafts = wikidataDrafts(
    repo.map((p) => ({
      id: Number(p.id),
      name: p.name,
      nationality: p.nationality,
      wdApps: p.wd_apps,
      wdGoals: p.wd_goals,
    })),
  );
  let saved = 0;
  for (const d of drafts) {
    const { data: existing } = await db
      .from("trivia_lists")
      .select("id, status")
      .eq("auto_key", d.key)
      .maybeSingle();
    if (existing && existing.status !== "draft") continue;
    const list = check(
      await db
        .from("trivia_lists")
        .upsert(
          {
            auto_key: d.key,
            title: d.title,
            subtitle: d.subtitle,
            kind: "curated",
            status: "draft",
          },
          { onConflict: "auto_key" },
        )
        .select("id")
        .single(),
      "save draft",
    ) as { id: string };
    await replaceEntries(db, list.id, d.entries);
    saved++;
  }
  return saved;
}

async function replaceEntries(
  db: SupabaseClient,
  listId: string,
  entries: { playerId: number; statLabel: string | null; era?: string | null }[],
) {
  check(await db.from("trivia_list_entries").delete().eq("list_id", listId), "clear entries");
  if (entries.length === 0) return;
  check(
    await db.from("trivia_list_entries").insert(
      entries.map((e, i) => ({
        list_id: listId,
        rank: i + 1,
        player_id: e.playerId,
        stat_label: e.statLabel,
        era: e.era ?? null,
      })),
    ),
    "save entries",
  );
}

// ---------------------------------------------------------------------------------------
// Barça history (Wikipedia)
// ---------------------------------------------------------------------------------------

type Role = "player" | "manager" | "president";

/**
 * One-time (re-runnable) import of Barça's history from Wikipedia: parses five list articles,
 * keeps the parsed facts in `trivia_sources`, adds managers, presidents and any missing
 * players to the repository (matched by Wikidata id), then builds history lists. Lists that
 * pass every check go live; the rest are drafts. Lists an admin approved or archived are
 * never changed.
 */
export async function importHistory(db: SupabaseClient) {
  const pages = Object.entries(HISTORY_PAGES) as [keyof typeof HISTORY_PAGES, string][];
  const html = Object.fromEntries(
    await Promise.all(pages.map(async ([key, title]) => [key, await fetchArticleHtml(title)])),
  ) as Record<keyof typeof HISTORY_PAGES, string>;
  const src: HistorySources = {
    players: parsePlayers(html.players),
    records: parseRecords(html.records),
    seasons: parseSeasons(html.seasons),
    managers: parseStaff(html.managers),
    presidents: parseStaff(html.presidents),
  };
  if (src.players.length < 100 || src.managers.length < 30 || src.presidents.length < 30) {
    throw new Error("Wikipedia pages didn't parse as expected, so nothing was changed.");
  }
  const fetchedAt = new Date().toISOString();
  check(
    await db.from("trivia_sources").upsert(
      pages.map(([key, title]) => ({
        key: `wp:${key}`,
        title,
        url: articleUrl(title),
        data: src[key],
        fetched_at: fetchedAt,
      })),
      { onConflict: "key" },
    ),
    "save sources",
  );

  // Who appears where, and when (for roles and years of people new to the repository).
  const people: { ref: PersonRef; role: Role; from: number | null; to: number | null }[] = [
    ...src.players.map((p) => ({ ref: p.person, role: "player" as const, from: p.from, to: p.to })),
    ...Object.values(src.records)
      .flat()
      .map((r) => ({ ref: r.person, role: "player" as const, from: null, to: null })),
    ...src.seasons.flatMap((s) =>
      s.scorers.map((ref) => ({
        ref,
        role: "player" as const,
        from: s.startYear,
        to: s.startYear,
      })),
    ),
    ...src.managers.map((m) => ({
      ref: m.person,
      role: "manager" as const,
      from: m.from?.year ?? null,
      to: m.to?.year ?? null,
    })),
    ...src.presidents.map((m) => ({
      ref: m.person,
      role: "president" as const,
      from: m.from?.year ?? null,
      to: m.to?.year ?? null,
    })),
  ];
  const qids = await wikidataIdsFor(people.flatMap((p) => (p.ref.title ? [p.ref.title] : [])));
  const facts = new Map<
    string,
    { roles: Set<Role>; from: number | null; to: number | null; name: string }
  >();
  for (const p of people) {
    const q = p.ref.title ? qids.get(p.ref.title) : undefined;
    if (!q) continue;
    const f = facts.get(q) ?? { roles: new Set<Role>(), from: null, to: null, name: p.ref.name };
    f.roles.add(p.role);
    if (p.from != null) f.from = f.from == null ? p.from : Math.min(f.from, p.from);
    if (p.to != null) f.to = f.to == null ? p.to : Math.max(f.to, p.to);
    facts.set(q, f);
  }

  const repo = await fetchAll<{ id: number; wikidata_id: string | null; roles: Role[] | null }>(
    db,
    "trivia_players",
    "id, wikidata_id, roles",
    "load repository",
  );
  const byQid = new Map(repo.filter((r) => r.wikidata_id).map((r) => [r.wikidata_id!, r]));

  // Add people the repository doesn't have yet (details from Wikidata).
  const missing = [...facts.keys()].filter((q) => !byQid.has(q));
  const details = new Map((await fetchPeople(missing)).map((p) => [p.wikidataId, p]));
  const newRows = missing.map((q) => {
    const f = facts.get(q)!;
    const d = details.get(q);
    const name = d?.name ?? f.name;
    return {
      wikidata_id: q,
      name,
      search_text: searchText(
        name,
        [...(d?.aliases ?? []), f.name].filter((a) => a !== name),
      ),
      nationality: d?.nationality ?? null,
      country_code: d?.countryCode ?? null,
      position: f.roles.has("player") ? (d?.position ?? null) : null,
      birth_year: d?.birthYear ?? null,
      barca_from: f.from,
      barca_to: f.to,
      roles: [...f.roles],
    };
  });
  for (let i = 0; i < newRows.length; i += 500) {
    const added = check(
      await db
        .from("trivia_players")
        .upsert(newRows.slice(i, i + 500), { onConflict: "wikidata_id" })
        .select("id, wikidata_id, roles"),
      "add people",
    ) as { id: number; wikidata_id: string; roles: Role[] }[];
    for (const a of added) byQid.set(a.wikidata_id, a);
  }

  // Players who were also managers or presidents get those roles too.
  let roleUpdates = 0;
  for (const [q, f] of facts) {
    const row = byQid.get(q);
    if (!row) continue;
    const current = row.roles ?? ["player"];
    const roles = new Set<Role>([...current, ...f.roles]);
    if (roles.size !== current.length) {
      check(
        await db
          .from("trivia_players")
          .update({ roles: [...roles] })
          .eq("id", row.id),
        "update roles",
      );
      roleUpdates++;
    }
  }

  const resolve = (p: PersonRef) => {
    const q = p.title ? qids.get(p.title) : undefined;
    const row = q ? byQid.get(q) : undefined;
    return row ? Number(row.id) : null;
  };
  let live = 0;
  let kept = 0;
  const drafts: string[] = [];
  for (const l of historyLists(src, resolve)) {
    const { data: existing } = await db
      .from("trivia_lists")
      .select("id, status")
      .eq("auto_key", l.key)
      .maybeSingle();
    if (existing && existing.status !== "draft") {
      kept++;
      continue;
    }
    const ok = l.problems.length === 0;
    const list = check(
      await db
        .from("trivia_lists")
        .upsert(
          {
            auto_key: l.key,
            title: l.title,
            subtitle: l.subtitle,
            kind: "curated",
            status: ok ? "approved" : "draft",
            source: "wikipedia",
          },
          { onConflict: "auto_key" },
        )
        .select("id")
        .single(),
      "save history list",
    ) as { id: string };
    await replaceEntries(db, list.id, l.entries);
    if (ok) live++;
    else drafts.push(`${l.title} (${l.problems.join("; ")})`);
  }

  return {
    ok: true,
    message:
      `Imported Barça history from Wikipedia: ${newRows.length} people added, ` +
      `${roleUpdates} roles updated; ${live} lists live, ${drafts.length} drafts to review` +
      (kept ? `, ${kept} reviewed lists left as they were.` : ".") +
      (drafts.length ? ` Drafts: ${drafts.join(" · ")}` : ""),
  };
}

// ---------------------------------------------------------------------------------------
// Daily schedule
// ---------------------------------------------------------------------------------------

/** Today's list id, scheduling one (and freezing an auto list) on first request. Null if none. */
export async function ensureDaily(
  db: SupabaseClient,
  day: string,
  config: { barcaTeamId: number; season: number },
): Promise<string | null> {
  const { data: scheduled } = await db
    .from("trivia_daily")
    .select("list_id")
    .eq("day", day)
    .maybeSingle();
  if (scheduled) return scheduled.list_id as string;

  const curated = check(
    await db.from("trivia_lists").select("id").eq("kind", "curated").eq("status", "approved"),
    "load lists",
  ) as { id: string }[];
  const history = check(
    await db.from("trivia_daily").select("day, trivia_lists(id, kind, auto_key)").order("day"),
    "load schedule",
  ) as unknown as {
    day: string;
    trivia_lists: { id: string; kind: string; auto_key: string | null } | null;
  }[];
  const lastUsed = new Map<string, string>();
  for (const h of history) {
    const l = h.trivia_lists;
    if (!l) continue;
    const key =
      l.kind === "auto" && l.auto_key ? l.auto_key.split(":").slice(0, 2).join(":") : l.id;
    lastUsed.set(key, h.day);
  }

  // Try curated + auto templates in order of staleness until one can be scheduled.
  let candidates = [
    ...curated.map((c) => ({ id: c.id, kind: "curated" as const })),
    ...AUTO_TEMPLATES.map((id) => ({ id, kind: "auto" as const })),
  ];
  let fresh: ReturnType<typeof autoLists> | null = null;
  while (candidates.length > 0) {
    const pick = pickDailyList(candidates, lastUsed, day);
    if (!pick) break;
    let listId: string | null = pick.kind === "curated" ? pick.id : null;
    if (pick.kind === "auto") {
      fresh ??= await currentAutoLists(db, config);
      const draft = fresh.find((l) => l.key === pick.id);
      if (draft) {
        const list = check(
          await db
            .from("trivia_lists")
            .upsert(
              {
                auto_key: `${draft.key}:${day}`,
                title: draft.title,
                subtitle: draft.subtitle,
                kind: "auto",
                status: "approved",
              },
              { onConflict: "auto_key" },
            )
            .select("id")
            .single(),
          "freeze auto list",
        ) as { id: string };
        await replaceEntries(db, list.id, draft.entries);
        listId = list.id;
      }
    }
    if (listId) {
      await db
        .from("trivia_daily")
        .upsert({ day, list_id: listId }, { onConflict: "day", ignoreDuplicates: true });
      const { data } = await db.from("trivia_daily").select("list_id").eq("day", day).single();
      return (data?.list_id as string) ?? null;
    }
    candidates = candidates.filter((c) => c.id !== pick.id); // not fair today; try the next
  }
  return null;
}

async function currentAutoLists(
  db: SupabaseClient,
  config: { barcaTeamId: number; season: number },
) {
  const linked = await linkCurrentPlayers(db, config.barcaTeamId);
  const players = check(
    await db
      .from("players")
      .select("api_player_id, name, market_value, season_stats")
      .eq("team_api_id", config.barcaTeamId),
    "load squad",
  ) as {
    api_player_id: number;
    name: string;
    market_value: number | null;
    season_stats: CurrentPlayerStats["season"];
  }[];
  const stats: CurrentPlayerStats[] = players
    .filter((p) => linked.has(Number(p.api_player_id)))
    .map((p) => ({
      triviaPlayerId: linked.get(Number(p.api_player_id))!,
      name: p.name,
      marketValue: p.market_value == null ? null : Number(p.market_value),
      season: p.season_stats,
    }));
  return autoLists(stats, seasonLabel(config.season));
}

// ---------------------------------------------------------------------------------------
// Playing
// ---------------------------------------------------------------------------------------

export interface GameView {
  day: string;
  title: string;
  subtitle: string | null;
  slots: SlotView[];
  found: number;
  livesLeft: number;
  finished: boolean;
  wrongGuesses: string[];
}

async function loadEntries(db: SupabaseClient, listId: string): Promise<TriviaEntry[]> {
  const rows = check(
    await db
      .from("trivia_list_entries")
      .select("rank, stat_label, era, trivia_players(id, name, nationality, country_code)")
      .eq("list_id", listId)
      .order("rank"),
    "load answers",
  ) as unknown as {
    rank: number;
    stat_label: string | null;
    era: string | null;
    trivia_players: {
      id: number;
      name: string;
      nationality: string | null;
      country_code: string | null;
    };
  }[];
  return rows.map((r) => ({
    rank: r.rank,
    playerId: Number(r.trivia_players.id),
    name: r.trivia_players.name,
    nationality: r.trivia_players.nationality,
    countryCode: r.trivia_players.country_code,
    statLabel: r.stat_label,
    era: r.era,
  }));
}

async function loadAttempt(db: SupabaseClient, userId: string, day: string): Promise<AttemptState> {
  const { data } = await db
    .from("trivia_attempts")
    .select("guesses, found, lives_left, finished")
    .eq("user_id", userId)
    .eq("day", day)
    .maybeSingle();
  return data
    ? {
        guesses: data.guesses,
        found: data.found,
        livesLeft: data.lives_left,
        finished: data.finished,
      }
    : NEW_ATTEMPT;
}

async function view(
  db: SupabaseClient,
  day: string,
  listId: string,
  entries: TriviaEntry[],
  state: AttemptState,
): Promise<GameView> {
  const wrongIds = state.guesses.filter((g) => g.rank == null).map((g) => g.playerId);
  const [{ data: list }, { data: wrong }] = await Promise.all([
    db.from("trivia_lists").select("title, subtitle").eq("id", listId).single(),
    wrongIds.length
      ? db.from("trivia_players").select("id, name").in("id", wrongIds)
      : Promise.resolve({ data: [] as { id: number; name: string }[] }),
  ]);
  const names = new Map((wrong ?? []).map((w) => [Number(w.id), w.name as string]));
  return {
    day,
    title: (list?.title as string) ?? "Culé Ten",
    subtitle: (list?.subtitle as string | null) ?? null,
    slots: publicView(entries, state),
    found: state.found,
    livesLeft: state.livesLeft,
    finished: state.finished,
    wrongGuesses: wrongIds.map((id) => names.get(id) ?? "?"),
  };
}

export async function getGame(
  db: SupabaseClient,
  userId: string,
  day: string,
  config: { barcaTeamId: number; season: number },
): Promise<GameView | null> {
  const listId = await ensureDaily(db, day, config);
  if (!listId) return null;
  const [entries, state] = await Promise.all([
    loadEntries(db, listId),
    loadAttempt(db, userId, day),
  ]);
  return view(db, day, listId, entries, state);
}

export async function makeGuess(
  db: SupabaseClient,
  userId: string,
  day: string,
  playerId: number,
  config: { barcaTeamId: number; season: number },
): Promise<{ game: GameView; outcome: GuessOutcome } | null> {
  const listId = await ensureDaily(db, day, config);
  if (!listId) return null;
  const [entries, before] = await Promise.all([
    loadEntries(db, listId),
    loadAttempt(db, userId, day),
  ]);
  const { state, outcome } = applyGuess(entries, before, playerId);
  if (state !== before) {
    check(
      await db.from("trivia_attempts").upsert(
        {
          user_id: userId,
          day,
          guesses: state.guesses,
          found: state.found,
          lives_left: state.livesLeft,
          finished: state.finished,
        },
        { onConflict: "user_id,day" },
      ),
      "save attempt",
    );
  }
  return { game: await view(db, day, listId, entries, state), outcome };
}

export interface SearchResult {
  id: number;
  name: string;
  nationality: string | null;
  countryCode: string | null;
  years: string | null;
}

/** Autocomplete over the repository (any signed-in client; the repository isn't secret). */
export async function searchPlayers(db: SupabaseClient, query: string): Promise<SearchResult[]> {
  const q = normalise(query);
  if (q.length < 2) return [];
  const { data } = await db
    .from("trivia_players")
    .select("id, name, nationality, country_code, barca_from, barca_to, wd_apps")
    .ilike("search_text", `%${q.replace(/[%_\\]/g, "")}%`)
    .order("wd_apps", { ascending: false, nullsFirst: false })
    .limit(8);
  return (data ?? []).map((p) => ({
    id: Number(p.id),
    name: p.name as string,
    nationality: p.nationality as string | null,
    countryCode: p.country_code as string | null,
    years: p.barca_from ? `${p.barca_from}–${p.barca_to ?? ""}` : null,
  }));
}

/** Today's results for the user's league-mates (RLS limits rows) and the user's streak. */
export async function leagueTable(db: SupabaseClient, userId: string, day: string) {
  const [{ data: today }, { data: mine }] = await Promise.all([
    db.from("trivia_attempts").select("user_id, found, lives_left, finished").eq("day", day),
    db.from("trivia_attempts").select("day").eq("user_id", userId).eq("finished", true),
  ]);
  return {
    rows: (today ?? []) as {
      user_id: string;
      found: number;
      lives_left: number;
      finished: boolean;
    }[],
    streak: streak(
      ((mine ?? []) as { day: string }[]).map((r) => r.day),
      day,
    ),
  };
}
