/**
 * Dev helper: preview automatic prices for a match pool without writing anything.
 * Usage: pnpm exec tsx scripts/preview-prices.ts <opponent name>
 */
import { config } from "dotenv";

import {
  EMPTY_FORM,
  priceFor,
  type FantasyForm,
  type PlayerForm,
  type SeasonStats,
} from "../src/features/fantasy/pricing";
import type { Position } from "../src/features/fantasy/types";

config({ path: [".env.local", ".env"], quiet: true });

interface Row {
  name: string;
  position: Position;
  team_name: string;
  price: number;
  price_locked: boolean;
  market_value: number | null;
  form: Partial<PlayerForm> | null;
  last_match: PlayerForm | null;
  season_stats: SeasonStats | null;
  fantasy_form: FantasyForm | null;
}

async function main() {
  const opponent = process.argv[2] ?? "Alavés";
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const h = { apikey: key, Authorization: `Bearer ${key}` };
  const [match] = (await (
    await fetch(
      `${url}/rest/v1/matches?select=id&opponent_name=eq.${encodeURIComponent(opponent)}&kickoff_at=gt.${new Date().toISOString()}&order=kickoff_at.asc&limit=1`,
      { headers: h },
    )
  ).json()) as { id: number }[];
  if (!match) throw new Error(`No match vs ${opponent}`);

  const rows = (await (
    await fetch(
      `${url}/rest/v1/match_players?select=players(name,position,team_name,price,price_locked,market_value,form,last_match,season_stats,fantasy_form)&match_id=eq.${match.id}`,
      { headers: h },
    )
  ).json()) as { players: Row }[];

  const ps = rows
    .map(({ players: p }) => ({
      ...p,
      next: p.price_locked
        ? Number(p.price)
        : priceFor(p.position, {
            form: { ...EMPTY_FORM, ...(p.form ?? {}) } as PlayerForm,
            last: p.last_match,
            season: p.season_stats,
            fantasy: p.fantasy_form,
            marketValue: p.market_value == null ? null : Number(p.market_value),
          }),
    }))
    .sort((a, b) => b.next - a.next);

  for (const pos of ["FWD", "MID", "DEF", "GK"] as const) {
    const list = ps.filter((p) => p.position === pos);
    const range = list.length
      ? `${Math.min(...list.map((p) => p.next))}–${Math.max(...list.map((p) => p.next))}`
      : "-";
    console.log(`\n${pos} (${range})`);
    for (const p of list.slice(0, 6)) {
      const f = p.fantasy_form;
      const pts = f && f.matches ? ` · ${(f.points / f.matches).toFixed(1)} pts/g` : "";
      console.log(
        `  ${String(p.price).padStart(4)} -> ${String(p.next).padStart(4)}  ${p.name} (${p.team_name})${pts}`,
      );
    }
  }

  const pick = (
    sorter: (a: (typeof ps)[number], b: (typeof ps)[number]) => number,
    shape: Record<Position, number>,
  ) => {
    const need = { ...shape };
    const per: Record<string, number> = {};
    let total = 0;
    for (const p of [...ps].sort(sorter)) {
      if (!need[p.position] || (per[p.team_name] ?? 0) >= 7) continue;
      need[p.position]--;
      per[p.team_name] = (per[p.team_name] ?? 0) + 1;
      total += p.next;
    }
    return total;
  };
  const f442 = { GK: 1, DEF: 4, MID: 4, FWD: 2 };
  const f343 = { GK: 1, DEF: 3, MID: 4, FWD: 3 };
  const f541 = { GK: 1, DEF: 5, MID: 4, FWD: 1 };
  console.log(
    `\nMost expensive legal XI — 4-4-2: ${pick((a, b) => b.next - a.next, f442)}, 3-4-3: ${pick((a, b) => b.next - a.next, f343)}, 5-4-1: ${pick((a, b) => b.next - a.next, f541)}`,
  );
  console.log(`Cheapest legal 4-4-2: ${pick((a, b) => a.next - b.next, f442)}`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
