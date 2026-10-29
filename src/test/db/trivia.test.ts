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
