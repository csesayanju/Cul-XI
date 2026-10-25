import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { asUser, createTestDb } from "./harness";

const ADMIN = "11111111-1111-1111-1111-111111111111";
const BRUNO = "22222222-2222-2222-2222-222222222222";
const CARLA = "33333333-3333-3333-3333-333333333333";
const OUTSIDER = "44444444-4444-4444-4444-444444444444";
const CARLA_TEAM = "f0000000-0000-0000-0000-000000000003";
const BRUNO_TEAM_FINISHED = "f0000000-0000-0000-0000-000000000002";

let db: PGlite;

beforeAll(async () => {
  db = await createTestDb();
  await db.exec(`
    insert into auth.users (id, email, raw_user_meta_data)
    values ('${OUTSIDER}', 'outsider@example.com', '{}');
  `);
}, 60_000);

afterAll(async () => {
  await db?.close();
});

async function count(sql: string, userId: string | null, params: unknown[] = []) {
  return asUser(db, userId, async (tx) => {
    const res = await tx.query<{ n: number }>(`select count(*)::int as n from (${sql}) q`, params);
    return res.rows[0]!.n;
  });
}

describe("migrations + seed", () => {
  it("creates profiles for seeded users via trigger", async () => {
    const res = await db.query<{ display_name: string; is_admin: boolean }>(
      "select display_name, is_admin from public.profiles order by display_name",
    );
    expect(res.rows.map((r) => r.display_name)).toEqual([
      "Admin Ana",
      "Bruno",
      "Carla",
      "outsider",
    ]);
    expect(res.rows.find((r) => r.display_name === "Admin Ana")?.is_admin).toBe(true);
  });

  it("seeds 11 players per fantasy team", async () => {
    const res = await db.query<{ n: number }>(
      "select count(*)::int as n from public.fantasy_team_players group by fantasy_team_id",
    );
    expect(res.rows.map((r) => r.n)).toEqual([11, 11, 11]);
  });
});

describe("row-level security", () => {
  it("hides everything from anonymous users", async () => {
    await expect(count("select * from public.matches", null)).rejects.toThrow(/permission denied/);
  });

  it("only shows league-mates' profiles", async () => {
    expect(await count("select * from public.profiles", BRUNO)).toBe(3);
    expect(await count("select * from public.profiles", OUTSIDER)).toBe(1);
  });

  it("hides league-mates' teams before kickoff but shows them after", async () => {
    // Bruno sees his own finished team, Ana's finished team, but not Carla's upcoming team.
    const visible = await asUser(db, BRUNO, (tx) =>
      tx.query<{ id: string }>("select id from public.fantasy_teams order by id"),
    );
    expect(visible.rows.map((r) => r.id)).not.toContain(CARLA_TEAM);
    expect(visible.rows).toHaveLength(2);
    expect(await count("select * from public.fantasy_teams", CARLA)).toBe(3);
  });

  it("lets a user edit their own team before kickoff", async () => {
    await asUser(db, CARLA, async (tx) => {
      const res = await tx.query(
        `update public.fantasy_team_players set is_vice_captain = false
         where fantasy_team_id = $1 and is_vice_captain`,
        [CARLA_TEAM],
      );
      expect(res.affectedRows).toBe(1);
    });
  });

  it("blocks edits after kickoff", async () => {
    await expect(
      asUser(db, BRUNO, (tx) =>
        tx.query(`delete from public.fantasy_team_players where fantasy_team_id = $1`, [
          BRUNO_TEAM_FINISHED,
        ]),
      ),
    ).resolves.toMatchObject({ affectedRows: 0 });
  });

  it("blocks edits once kickoff passes even before the lock flag is set", async () => {
    const kickedOff = `update public.matches set kickoff_at = now() - interval '1 minute'
                       where api_fixture_id = 990002`;
    const res = await asUser(
      db,
      CARLA,
      (tx) =>
        tx.query(`delete from public.fantasy_team_players where fantasy_team_id = $1`, [
          CARLA_TEAM,
        ]),
      { setupSql: kickedOff },
    );
    expect(res.affectedRows).toBe(0);
  });

  it("blocks creating a team for a match that has started", async () => {
    await expect(
      asUser(db, CARLA, (tx) =>
        tx.query(
          `insert into public.fantasy_teams (user_id, match_id)
           select $1, id from public.matches where api_fixture_id = 990001`,
          [CARLA],
        ),
      ),
    ).rejects.toThrow();
  });

  it("prevents users from editing someone else's team", async () => {
    const res = await asUser(db, BRUNO, (tx) =>
      tx.query(`delete from public.fantasy_team_players where fantasy_team_id = $1`, [CARLA_TEAM]),
    );
    expect(res.affectedRows).toBe(0);
  });

  it("only lets admins write stats", async () => {
    const bruno = await asUser(db, BRUNO, (tx) =>
      tx.query(`update public.player_match_stats set goals = 5`),
    );
    expect(bruno.affectedRows).toBe(0);

    const admin = await asUser(db, ADMIN, async (tx) => {
      const res = await tx.query(
        `update public.player_match_stats set goals = goals, source = 'manual'
         where player_id = (select id from public.players where api_player_id = 900013)`,
      );
      return res.affectedRows;
    });
    expect(admin).toBe(1);
  });

  it("does not let users promote themselves to admin", async () => {
    await expect(
      asUser(db, BRUNO, (tx) =>
        tx.query(`update public.profiles set is_admin = true where id = $1`, [BRUNO]),
      ),
    ).rejects.toThrow(/permission denied/);
  });

  it("keeps api_cache private", async () => {
    await expect(count("select * from public.api_cache", ADMIN)).rejects.toThrow(
      /permission denied/,
    );
  });

  it("joins a league with an invite code (case-insensitive)", async () => {
    const visibleAfterJoin = await asUser(db, OUTSIDER, async (tx) => {
      await tx.query(`select public.join_league('LOCAL-DEV-CODE')`);
      const res = await tx.query<{ n: number }>("select count(*)::int as n from public.profiles");
      return res.rows[0]!.n;
    });
    expect(visibleAfterJoin).toBe(4);
    await expect(
      asUser(db, OUTSIDER, (tx) => tx.query(`select public.join_league('wrong')`)),
    ).rejects.toThrow(/Invalid invite code/);
  });
});

describe("save_fantasy_team", () => {
  // Carla's current XI for match 2, as API ids (see supabase/seed.sql).
  const CARLA_XI = [
    900001, 900003, 900004, 920003, 900008, 900009, 900010, 920008, 920009, 900013, 920013,
  ];

  async function ids(apiIds: number[]) {
    const res = await db.query<{ id: number }>(
      `select id from public.players where api_player_id = any($1) order by array_position($1, api_player_id)`,
      [apiIds],
    );
    return res.rows.map((r) => Number(r.id));
  }

  const matchId = async (fixture: number) =>
    Number(
      (
        await db.query<{ id: number }>(`select id from public.matches where api_fixture_id = $1`, [
          fixture,
        ])
      ).rows[0]!.id,
    );

  const save = (userId: string, match: number, players: number[], c: number, v: number) =>
    asUser(db, userId, async (tx) => {
      const res = await tx.query<{ team: string }>(
        `select public.save_fantasy_team($1, $2::bigint[], $3, $4) as team`,
        [match, players, c, v],
      );
      const picks = await tx.query<{ n: number; c: number }>(
        `select count(*)::int as n, count(*) filter (where is_captain)::int as c
         from public.fantasy_team_players where fantasy_team_id = $1`,
        [res.rows[0]!.team],
      );
      return { team: res.rows[0]!.team, ...picks.rows[0]! };
    });

  it("replaces an existing team's picks atomically", async () => {
    const players = await ids(CARLA_XI);
    const result = await save(CARLA, await matchId(990002), players, players[1]!, players[2]!);
    expect(result).toMatchObject({ team: CARLA_TEAM, n: 11, c: 1 });
  });

  it("creates a new team for an upcoming match", async () => {
    const players = await ids(CARLA_XI);
    const result = await save(BRUNO, await matchId(990002), players, players[0]!, players[1]!);
    expect(result.team).not.toBe(CARLA_TEAM);
    expect(result.n).toBe(11);
  });

  it("rejects a match that has kicked off", async () => {
    const players = await ids(CARLA_XI);
    await expect(
      save(CARLA, await matchId(990001), players, players[0]!, players[1]!),
    ).rejects.toThrow();
  });

  it("rejects players not available for the match", async () => {
    // 910001 plays for the match-1 opponent, not match 2.
    const players = await ids([...CARLA_XI.slice(0, 10), 910001]);
    await expect(
      save(CARLA, await matchId(990002), players, players[0]!, players[1]!),
    ).rejects.toThrow(/not available/);
  });

  it("rejects the wrong number of players or a bad armband", async () => {
    const players = await ids(CARLA_XI);
    const m = await matchId(990002);
    await expect(save(CARLA, m, players.slice(0, 10), players[0]!, players[1]!)).rejects.toThrow(
      /exactly 11/,
    );
    await expect(save(CARLA, m, players, players[0]!, players[0]!)).rejects.toThrow(/Captain/);
  });
});
