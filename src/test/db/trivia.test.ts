import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { asUser, createTestDb } from "./harness";

const ADMIN = "11111111-1111-1111-1111-111111111111";
const BRUNO = "22222222-2222-2222-2222-222222222222";

let db: PGlite;

beforeAll(async () => {
  db = await createTestDb();
  await db.exec(`
    insert into public.trivia_players (name, search_text, nationality, country_code)
    select 'Player ' || g, 'player ' || g, 'Spain', 'ES' from generate_series(1, 10) g;
    insert into public.trivia_lists (id, title, kind, status)
      values ('aaaaaaaa-0000-0000-0000-000000000001', 'Approved list', 'curated', 'approved'),
             ('aaaaaaaa-0000-0000-0000-000000000002', 'Draft list', 'curated', 'draft');
    insert into public.trivia_list_entries (list_id, rank, player_id, stat_label)
    select 'aaaaaaaa-0000-0000-0000-000000000001', g, id, g || ' goals'
    from public.trivia_players p, generate_series(1, 10) g where p.name = 'Player ' || g;
    insert into public.trivia_daily (day, list_id) values ('2026-10-27', 'aaaaaaaa-0000-0000-0000-000000000001');
    insert into public.trivia_attempts (user_id, day, found, lives_left) values ('${BRUNO}', '2026-10-27', 3, 2);
  `);
}, 60_000);

afterAll(async () => {
  await db?.close();
});

const count = (sql: string, userId: string) =>
  asUser(db, userId, async (tx) => {
    const r = await tx.query<{ n: number }>(`select count(*)::int as n from (${sql}) q`);
    return r.rows[0]!.n;
  });

describe("Culé Ten security", () => {
  it("never lets players read the answers", async () => {
    expect(await count("select * from public.trivia_list_entries", BRUNO)).toBe(0);
  });

  it("lets admins read and edit answers", async () => {
    expect(await count("select * from public.trivia_list_entries", ADMIN)).toBe(10);
  });

  it("shows players the repository, the schedule and approved list titles only", async () => {
    expect(await count("select * from public.trivia_players", BRUNO)).toBe(10);
    expect(await count("select * from public.trivia_daily", BRUNO)).toBe(1);
    expect(await count("select * from public.trivia_lists", BRUNO)).toBe(1);
    expect(await count("select * from public.trivia_lists", ADMIN)).toBe(2);
  });

  it("doesn't let players write their own score", async () => {
    await expect(
      asUser(db, BRUNO, (tx) =>
        tx.query(`update public.trivia_attempts set found = 10 where user_id = $1`, [BRUNO]),
      ),
    ).rejects.toThrow(/permission denied/);
    await expect(
      asUser(db, BRUNO, (tx) =>
        tx.query(`insert into public.trivia_attempts (user_id, day) values ($1, '2026-10-27')`, [
          BRUNO,
        ]),
      ),
    ).rejects.toThrow(/permission denied/);
  });

  it("lets league-mates see each other's results", async () => {
    expect(await count("select * from public.trivia_attempts", ADMIN)).toBe(1);
  });
});

describe("Tiki-Taka-Toe security", () => {
  beforeAll(async () => {
    await db.exec(`
      insert into public.trivia_clubs (qid, name) values ('Q8682', 'Real Madrid Club de Fútbol');
      insert into public.trivia_player_clubs (player_id, club_qid)
        select id, 'Q8682' from public.trivia_players where name = 'Player 1';
      insert into public.ttt_daily (day, grid) values ('2026-10-30', '{"answers": []}');
      insert into public.ttt_attempts (user_id, day, filled, guesses_left) values ('${BRUNO}', '2026-10-30', 2, 5);
    `);
  });

  it("never lets players read the grid (it holds example answers)", async () => {
    await expect(count("select * from public.ttt_daily", BRUNO)).rejects.toThrow(
      /permission denied/,
    );
  });

  it("shows the clubs data to signed-in players, read-only", async () => {
    expect(await count("select * from public.trivia_player_clubs", BRUNO)).toBe(1);
    await expect(
      asUser(db, BRUNO, (tx) =>
        tx.query(`insert into public.trivia_clubs (qid, name) values ('Q1', 'Fake FC')`),
      ),
    ).rejects.toThrow(/permission denied/);
  });

  it("doesn't let players write their own grid", async () => {
    await expect(
      asUser(db, BRUNO, (tx) =>
        tx.query(`update public.ttt_attempts set filled = 9 where user_id = $1`, [BRUNO]),
      ),
    ).rejects.toThrow(/permission denied/);
  });

  it("lets league-mates see each other's grid results", async () => {
    expect(await count("select * from public.ttt_attempts", ADMIN)).toBe(1);
  });
});

describe("La Liga trivia data", () => {
  it("keeps the grid builder function away from players", async () => {
    await expect(
      asUser(db, BRUNO, (tx) =>
        tx.query(`select * from public.ttt_category_members(array['Q8682'])`),
      ),
    ).rejects.toThrow(/permission denied/);
  });

  it("returns category members, most famous first", async () => {
    await db.exec(`
      update public.trivia_players set fame = 50, pichichis = 2 where name = 'Player 1';
      insert into public.trivia_player_clubs (player_id, club_qid)
        select id, 'Q8682' from public.trivia_players where name = 'Player 2';
    `);
    const r = await db.query<{ kind: string; key: string; ids: number[] }>(
      `select * from public.ttt_category_members(array['Q8682'])`,
    );
    const club = r.rows.find((x) => x.kind === "club" && x.key === "Q8682")!;
    const p1 = await db.query<{ id: number }>(
      `select id from public.trivia_players where name = 'Player 1'`,
    );
    expect(club.ids).toHaveLength(2);
    expect(Number(club.ids[0])).toBe(Number(p1.rows[0]!.id));
    expect(r.rows.find((x) => x.kind === "award" && x.key === "pichichi")?.ids).toHaveLength(1);
    // Spain is never a category.
    expect(r.rows.some((x) => x.kind === "nation" && x.key === "ES")).toBe(false);
  });
});

describe("Career Path and Higher or Lower security", () => {
  beforeAll(async () => {
    await db.exec(`
      insert into public.trivia_careers (player_id, seq, club_qid, from_year, to_year)
        select id, 1, 'Q8682', 2000, 2005 from public.trivia_players where name = 'Player 1';
      insert into public.career_daily (day, player_id)
        select '2026-10-31', id from public.trivia_players where name = 'Player 1';
      insert into public.career_attempts (user_id, day, guesses) values ('${BRUNO}', '2026-10-31', '[1]');
      insert into public.hol_runs (user_id, a_id, b_id, streak, best)
        select '${BRUNO}', min(id), max(id), 3, 7 from public.trivia_players;
    `);
  });

  it("never lets players read today's Career Path answer", async () => {
    await expect(count("select * from public.career_daily", BRUNO)).rejects.toThrow(
      /permission denied/,
    );
    expect(await count("select * from public.trivia_careers", BRUNO)).toBe(1);
  });

  it("doesn't let players write their own results or streaks", async () => {
    await expect(
      asUser(db, BRUNO, (tx) =>
        tx.query(`update public.career_attempts set solved = true where user_id = $1`, [BRUNO]),
      ),
    ).rejects.toThrow(/permission denied/);
    await expect(
      asUser(db, BRUNO, (tx) =>
        tx.query(`update public.hol_runs set best = 999 where user_id = $1`, [BRUNO]),
      ),
    ).rejects.toThrow(/permission denied/);
  });

  it("lets league-mates see each other's results and streaks", async () => {
    expect(await count("select * from public.career_attempts", ADMIN)).toBe(1);
    expect(await count("select * from public.hol_runs", ADMIN)).toBe(1);
  });

  it("keeps the candidate picker away from players", async () => {
    await expect(
      asUser(db, BRUNO, (tx) => tx.query(`select * from public.career_candidates(0, 10)`)),
    ).rejects.toThrow(/permission denied/);
  });
});

describe("Missing XI, Connections and Odd One Out security", () => {
  beforeAll(async () => {
    await db.exec(`
      insert into public.trivia_lineups (key, title, competition, year, team, players)
        values ('final#0', 'A final', 'European Cup', 2009, 'Barcelona', '[]');
      insert into public.lineup_daily (day, lineup_id) select '2026-11-01', id from public.trivia_lineups;
      insert into public.lineup_attempts (user_id, day, found) values ('${BRUNO}', '2026-11-01', 4);
      insert into public.connections_daily (day, puzzle) values ('2026-11-01', '{"groups": []}');
      insert into public.connections_attempts (user_id, day) values ('${BRUNO}', '2026-11-01');
      insert into public.ooo_runs (user_id, round, answer_id, streak, best)
        select '${BRUNO}', '{"prompt": "x", "options": []}', min(id), 2, 9 from public.trivia_players;
    `);
  });

  it("never lets players read line-ups, today's pick or today's groups", async () => {
    for (const table of ["trivia_lineups", "lineup_daily", "connections_daily"]) {
      await expect(count(`select * from public.${table}`, BRUNO)).rejects.toThrow(
        /permission denied/,
      );
    }
  });

  it("hides the Odd One Out round and answer but shows streaks to league-mates", async () => {
    await expect(
      asUser(db, ADMIN, (tx) => tx.query(`select answer_id from public.ooo_runs`)),
    ).rejects.toThrow(/permission denied/);
    await expect(
      asUser(db, BRUNO, (tx) => tx.query(`select round from public.ooo_runs`)),
    ).rejects.toThrow(/permission denied/);
    const r = await asUser(db, ADMIN, (tx) =>
      tx.query<{ best: number }>(`select user_id, best, streak from public.ooo_runs`),
    );
    expect(r.rows[0]!.best).toBe(9);
  });

  it("doesn't let players write their own results", async () => {
    for (const sql of [
      `update public.lineup_attempts set found = 11`,
      `update public.connections_attempts set finished = true`,
      `update public.ooo_runs set best = 999`,
    ]) {
      await expect(asUser(db, BRUNO, (tx) => tx.query(sql))).rejects.toThrow(/permission denied/);
    }
  });
});

describe("Mystery Player security", () => {
  beforeAll(async () => {
    await db.exec(`
      insert into public.mystery_daily (day, player_id)
        select '2026-11-01', min(id) from public.trivia_players;
      insert into public.mystery_attempts (user_id, day, guesses) values ('${BRUNO}', '2026-11-01', '[2]');
    `);
  });

  it("never lets players read today's mystery player", async () => {
    await expect(count("select * from public.mystery_daily", BRUNO)).rejects.toThrow(
      /permission denied/,
    );
  });

  it("shows league-mates' results but never lets players write them", async () => {
    expect(await count("select * from public.mystery_attempts", ADMIN)).toBe(1);
    await expect(
      asUser(db, BRUNO, (tx) => tx.query(`update public.mystery_attempts set solved = true`)),
    ).rejects.toThrow(/permission denied/);
  });
});
