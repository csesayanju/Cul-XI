import { describe, expect, it } from "vitest";

import fixturesSample from "./__fixtures__/fixtures.json";
import playersSample from "./__fixtures__/fixtures-players.json";
import lineupsSample from "./__fixtures__/fixtures-lineups.json";
import squadsSample from "./__fixtures__/players-squads.json";
import {
  competitionFor,
  isFinished,
  mapFixturePlayerStats,
  mapFixtures,
  mapLineups,
  mapSquad,
  type TrackedLeagues,
} from "./mappers";
import type { ApiFixture, ApiFixturePlayers, ApiLineup, ApiSquad } from "./types";

const cfg: TrackedLeagues = { barcaTeamId: 529, laligaLeagueId: 140, uclLeagueId: 2 };

describe("competitionFor", () => {
  it("maps tracked league ids and ignores others", () => {
    expect(competitionFor(140, cfg)).toBe("laliga");
    expect(competitionFor(2, cfg)).toBe("ucl");
    expect(competitionFor(143, cfg)).toBeNull();
    expect(competitionFor(143, { ...cfg, copaLeagueId: 143 })).toBe("copa");
  });
});

describe("mapFixtures", () => {
  const rows = mapFixtures(fixturesSample.response as ApiFixture[], cfg);

  it("drops friendlies and other untracked competitions", () => {
    expect(rows.map((r) => r.api_fixture_id)).toEqual([990001, 990002]);
  });

  it("maps a home fixture from Barça's perspective", () => {
    expect(rows[0]).toEqual({
      api_fixture_id: 990001,
      competition: "laliga",
      api_league_id: 140,
      season: 2026,
      round: "Regular Season - 9",
      opponent_team_id: 9001,
      opponent_name: "Real Ficticio",
      is_home: true,
      venue: "Home Stadium",
      kickoff_at: new Date(1792350000 * 1000).toISOString(),
      status: "FT",
      barca_goals: 2,
      opponent_goals: 1,
    });
  });

  it("flips sides for an away fixture", () => {
    expect(rows[1]).toMatchObject({
      is_home: false,
      opponent_team_id: 9002,
      opponent_name: "Atlético Imaginario",
      competition: "ucl",
      barca_goals: null,
    });
  });
});

describe("isFinished", () => {
  it.each(["FT", "AET", "PEN"])("%s is finished", (s) => expect(isFinished(s)).toBe(true));
  it.each(["NS", "1H", "HT", "PST"])("%s is not finished", (s) =>
    expect(isFinished(s)).toBe(false),
  );
});

describe("mapSquad", () => {
  it("maps positions and keeps missing shirt numbers as null", () => {
    const rows = mapSquad(squadsSample.response as ApiSquad[]);
    expect(rows).toHaveLength(7);
    expect(rows.map((r) => r.position)).toEqual(["GK", "DEF", "DEF", "MID", "MID", "FWD", "FWD"]);
    expect(rows[6]).toMatchObject({ api_player_id: 910016, shirt_number: null, team_api_id: 9001 });
  });
});

describe("mapLineups", () => {
  it("marks starters and substitutes for both teams", () => {
    const rows = mapLineups(lineupsSample.response as ApiLineup[]);
    const barca = rows.filter((r) => r.team_api_id === 529);
    expect(barca.filter((r) => r.lineup_status === "starting")).toHaveLength(11);
    expect(barca.filter((r) => r.lineup_status === "bench")).toHaveLength(2);
    expect(rows.find((r) => r.api_player_id === 900001)).toMatchObject({
      position: "GK",
      lineup_status: "starting",
    });
  });
});

describe("mapFixturePlayerStats", () => {
  const rows = mapFixturePlayerStats(playersSample.response as ApiFixturePlayers[], {
    barcaTeamId: 529,
    barcaGoals: 2,
    opponentGoals: 1,
  });
  const byId = (id: number) => rows.find((r) => r.api_player_id === id)!.stats;

  it("maps goals, assists and penalties", () => {
    expect(byId(900008)).toMatchObject({ minutes: 90, goals: 1, assists: 1 });
    expect(byId(900013)).toMatchObject({ goals: 1, penaltiesMissed: 1 });
    expect(byId(910001)).toMatchObject({ saves: 5, penaltiesSaved: 1, goalsConceded: 2 });
  });

  it("uses the team total for outfield goals conceded and no clean sheet after conceding", () => {
    expect(byId(900004)).toMatchObject({ goalsConceded: 1, cleanSheet: false, yellowCards: 1 });
  });

  it("treats null minutes (unused sub) as did-not-play", () => {
    expect(byId(900002)).toMatchObject({ minutes: 0, goalsConceded: 0, cleanSheet: false });
  });

  it("maps red cards", () => {
    expect(byId(910006)).toMatchObject({ minutes: 64, redCards: 1 });
  });

  it("awards a clean sheet when the team conceded nothing", () => {
    const shutout = mapFixturePlayerStats(playersSample.response as ApiFixturePlayers[], {
      barcaTeamId: 529,
      barcaGoals: 2,
      opponentGoals: 0,
    });
    expect(shutout.find((r) => r.api_player_id === 900001)!.stats.cleanSheet).toBe(true);
    expect(shutout.find((r) => r.api_player_id === 910001)!.stats.cleanSheet).toBe(false);
  });
});
