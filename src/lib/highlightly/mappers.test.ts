import { describe, expect, it } from "vitest";

import boxScoreSample from "./__fixtures__/box-score.json";
import lastFiveSample from "./__fixtures__/last-five-games.json";
import lineupsSample from "./__fixtures__/lineups.json";
import detailSample from "./__fixtures__/match-detail.json";
import matchesSample from "./__fixtures__/matches.json";
import {
  competitionFor,
  hasLineups,
  isFinished,
  mapBoxScore,
  mapLineups,
  mapMatchDetail,
  mapMatches,
  parseScore,
  playerPoolFromLineups,
  recentFinished,
  recentFormFromBoxScores,
  statusCode,
  type TrackedLeagues,
} from "./mappers";
import type { HlBoxScoreTeam, HlLineups, HlMatch, HlMatchDetail } from "./types";

const BARCA = 1100000529;
const OPP = 1100009001;
const cfg: TrackedLeagues = { barcaTeamId: BARCA, laligaLeagueId: 119924, uclLeagueId: 2486 };
const lineups = lineupsSample as HlLineups;
const detail = (detailSample as HlMatchDetail[])[0]!;

describe("status + score helpers", () => {
  it.each([
    ["Not started", "NS"],
    ["Finished", "FT"],
    ["Finished after extra time", "AET"],
    ["Finished after penalties", "PEN"],
    ["Postponed", "PST"],
    ["Something new", "TBD"],
  ])("%s -> %s", (state, code) => expect(statusCode(state)).toBe(code));

  it("knows which statuses are finished", () => {
    expect(["FT", "AET", "PEN", "AWD"].every(isFinished)).toBe(true);
    expect(["NS", "1H", "HT", "PST"].some(isFinished)).toBe(false);
  });

  it("parses scores", () => {
    expect(parseScore("2 - 1")).toEqual({ home: 2, away: 1 });
    expect(parseScore("10-0")).toEqual({ home: 10, away: 0 });
    expect(parseScore(null)).toBeNull();
    expect(parseScore("")).toBeNull();
  });
});

describe("competitionFor", () => {
  it("maps tracked league ids and ignores others", () => {
    expect(competitionFor(119924, cfg)).toBe("laliga");
    expect(competitionFor(2486, cfg)).toBe("ucl");
    expect(competitionFor(555, cfg)).toBeNull();
    expect(competitionFor(555, { ...cfg, copaLeagueId: 555 })).toBe("copa");
  });
});

describe("mapMatches", () => {
  const rows = mapMatches(matchesSample.data as HlMatch[], cfg);

  it("drops friendlies and other untracked competitions", () => {
    expect(rows.map((r) => r.api_fixture_id)).toEqual([1990000001, 1990000002]);
  });

  it("maps a finished home match from Barça's perspective", () => {
    expect(rows[0]).toEqual({
      api_fixture_id: 1990000001,
      competition: "laliga",
      api_league_id: 119924,
      season: 2026,
      round: "Regular Season - 9",
      opponent_team_id: OPP,
      opponent_name: "Real Ficticio",
      is_home: true,
      kickoff_at: "2026-10-18T19:00:00.000Z",
      status: "FT",
      barca_goals: 2,
      opponent_goals: 1,
    });
  });

  it("flips sides for an away match and leaves score empty before kickoff", () => {
    expect(rows[1]).toMatchObject({
      is_home: false,
      opponent_team_id: 1100009002,
      competition: "ucl",
      status: "NS",
      barca_goals: null,
      opponent_goals: null,
    });
  });

  it("de-duplicates matches returned by both the home and away queries", () => {
    const data = matchesSample.data as HlMatch[];
    expect(mapMatches([...data, ...data], cfg)).toHaveLength(2);
  });
});

describe("mapMatchDetail", () => {
  it("extracts status, score and venue", () => {
    expect(mapMatchDetail(detail, BARCA)).toEqual({
      status: "FT",
      kickoff_at: "2026-10-18T19:00:00.000Z",
      venue: "Home Stadium",
      barca_goals: 2,
      opponent_goals: 1,
    });
  });
});

describe("line-ups", () => {
  it("detects whether line-ups are announced", () => {
    expect(hasLineups(lineups)).toBe(true);
    expect(hasLineups({ homeTeam: null, awayTeam: null })).toBe(false);
  });

  it("flattens formation rows and marks starters/bench", () => {
    const rows = mapLineups(lineups);
    const barca = rows.filter((r) => r.team_api_id === BARCA);
    expect(barca.filter((r) => r.lineup_status === "starting")).toHaveLength(11);
    expect(barca.filter((r) => r.lineup_status === "bench")).toHaveLength(2);
    expect(rows.find((r) => r.api_player_id === 2200000001)).toMatchObject({
      position: "GK",
      lineup_status: "starting",
      shirt_number: 1,
    });
  });

  it("also accepts a flat initialLineup", () => {
    const flat: HlLineups = {
      homeTeam: {
        ...lineups.homeTeam!,
        initialLineup: (lineups.homeTeam!.initialLineup as unknown[]).flat() as never,
      },
      awayTeam: null,
    };
    expect(mapLineups(flat).filter((r) => r.lineup_status === "starting")).toHaveLength(11);
  });

  it("builds a player pool for one team from recent line-ups", () => {
    const pool = playerPoolFromLineups([lineups, lineups], OPP);
    expect(pool).toHaveLength(12); // 11 starters + 1 sub, de-duplicated
    expect(pool.every((p) => p.team_api_id === OPP)).toBe(true);
    expect(pool.find((p) => p.api_player_id === 2210000013)?.position).toBe("FWD");
  });

  it("produces rows with only players-table columns (no line-up fields)", () => {
    const allowed = new Set([
      "api_player_id",
      "name",
      "position",
      "shirt_number",
      "team_api_id",
      "team_name",
      "photo_url",
      "form",
    ]);
    for (const row of playerPoolFromLineups([lineups], OPP)) {
      expect(Object.keys(row).filter((k) => !allowed.has(k))).toEqual([]);
    }
  });

  it("enriches the pool with recent form and photos from box scores", () => {
    const recent = recentFormFromBoxScores([boxScoreSample as HlBoxScoreTeam[]], BARCA);
    const pool = playerPoolFromLineups([lineups], BARCA, recent, 1);
    const font = pool.find((p) => p.api_player_id === 2200000008)!;
    expect(font.form).toMatchObject({ matches: 1, apps: 1, starts: 1, minutes: 90, goals: 1 });
    expect(font.form?.avgRating).toBe(8.4);
    // Bench player who never came on: zero appearances, but still priced from form.
    const bench = pool.find((p) => p.api_player_id === 2200000002)!;
    expect(bench.form).toMatchObject({ matches: 1, apps: 0, minutes: 0 });
  });
});

describe("recentFormFromBoxScores", () => {
  const box = boxScoreSample as HlBoxScoreTeam[];

  it("aggregates appearances, minutes, goals, assists and ratings over several matches", () => {
    const form = recentFormFromBoxScores([box, box], BARCA);
    expect(form.get(2200000013)!.form).toEqual({
      matches: 2,
      apps: 2,
      starts: 2,
      minutes: 180,
      goals: 2,
      assists: 0,
      avgRating: 7.6,
    });
  });

  it("counts unused subs as zero appearances with no rating", () => {
    expect(recentFormFromBoxScores([box], BARCA).get(2200000011)!.form).toMatchObject({
      apps: 0,
      minutes: 0,
      avgRating: null,
    });
  });

  it("only looks at the requested team", () => {
    const form = recentFormFromBoxScores([box], OPP);
    expect(form.has(2210000001)).toBe(true);
    expect(form.has(2200000001)).toBe(false);
  });

  it("keeps the most recent photo", () => {
    const withPhoto = (url: string): HlBoxScoreTeam[] =>
      box.map((t) => ({ ...t, players: t.players.map((p) => ({ ...p, logo: url })) }));
    const form = recentFormFromBoxScores([withPhoto("new.png"), withPhoto("old.png")], BARCA);
    expect(form.get(2200000001)!.photoUrl).toBe("new.png");
    expect(recentFormFromBoxScores([box], BARCA).get(2200000001)!.photoUrl).toBeNull();
  });
});

describe("recentFinished", () => {
  it("returns the newest finished matches first", () => {
    const ids = recentFinished(lastFiveSample as HlMatch[], 2).map((m) => m.id);
    expect(ids).toEqual([1990000011, 1990000012]);
  });
});

describe("mapBoxScore", () => {
  const rows = mapBoxScore(boxScoreSample as HlBoxScoreTeam[], {
    barcaTeamId: BARCA,
    barcaGoals: 2,
    opponentGoals: 1,
    events: detail.events,
  });
  const byId = (id: number) => rows.find((r) => r.api_player_id === id)!.stats;

  it("maps goals, assists, saves and missed penalties", () => {
    expect(byId(2200000008)).toMatchObject({ minutes: 90, goals: 1, assists: 0 });
    expect(byId(2200000005)).toMatchObject({ assists: 1 });
    expect(byId(2200000013)).toMatchObject({ goals: 1, penaltiesMissed: 1 });
    expect(byId(2210000001)).toMatchObject({ saves: 5, goalsConceded: 2 });
  });

  it("takes own goals from the match events", () => {
    expect(byId(2200000004)).toMatchObject({ ownGoals: 1, yellowCards: 1 });
  });

  it("uses the team total for outfield goals conceded; no clean sheet after conceding", () => {
    expect(byId(2200000004)).toMatchObject({ goalsConceded: 1, cleanSheet: false });
  });

  it("counts a second yellow as a red card", () => {
    expect(byId(2210000006)).toMatchObject({ minutes: 64, yellowCards: 1, redCards: 1 });
  });

  it("treats 0 minutes (unused sub) as did-not-play", () => {
    expect(byId(2200000011)).toMatchObject({ minutes: 0, goalsConceded: 0, cleanSheet: false });
  });

  it("awards a clean sheet when the team conceded nothing", () => {
    const shutout = mapBoxScore(boxScoreSample as HlBoxScoreTeam[], {
      barcaTeamId: BARCA,
      barcaGoals: 2,
      opponentGoals: 0,
    });
    expect(shutout.find((r) => r.api_player_id === 2200000001)!.stats.cleanSheet).toBe(true);
    expect(shutout.find((r) => r.api_player_id === 2210000001)!.stats.cleanSheet).toBe(false);
  });

  it("carries the position so unknown players can be created", () => {
    expect(rows.find((r) => r.api_player_id === 2210000013)?.position).toBe("FWD");
  });
});
