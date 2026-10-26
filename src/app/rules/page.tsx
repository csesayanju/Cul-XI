import type { Metadata } from "next";

import { Card, PageTitle } from "@/components/ui";
import { POSITION_LABELS } from "@/features/fantasy/labels";
import { PRICE_BANDS } from "@/features/fantasy/pricing";
import { SCORING_RULES as R, TEAM_RULES } from "@/features/fantasy/scoring/rules";
import { POSITIONS, type Position } from "@/features/fantasy/types";

export const metadata: Metadata = { title: "How points work" };

const fmt = (n: number) => (n > 0 ? `+${n}` : n === 0 ? "–" : `${n}`.replace("-", "−"));

type Row = { event: string; note?: string; values: Record<Position, number | null> };
const all = (n: number): Record<Position, number> => ({ GK: n, DEF: n, MID: n, FWD: n });
const only = (positions: readonly Position[], n: number): Record<Position, number | null> =>
  Object.fromEntries(POSITIONS.map((p) => [p, positions.includes(p) ? n : null])) as Record<
    Position,
    number | null
  >;

const ROWS: Row[] = [
  {
    event: "Playing",
    note: `${R.appearance.fullMinutes}+ minutes`,
    values: all(R.appearance.full),
  },
  {
    event: "Playing",
    note: `under ${R.appearance.fullMinutes} minutes`,
    values: all(R.appearance.partial),
  },
  { event: "Goal", values: R.goal },
  { event: "Assist", values: all(R.assist) },
  {
    event: "Clean sheet",
    note: `team concedes 0, you play ${R.cleanSheet.minMinutes}+ min`,
    values: R.cleanSheet.points,
  },
  { event: "Saves", note: `every ${R.saves.per}`, values: only(["GK"], R.saves.points) },
  { event: "Penalty saved", values: all(R.penaltySave) },
  { event: "Penalty missed", values: all(R.penaltyMiss) },
  {
    event: "Goals conceded",
    note: `every ${R.goalsConceded.per}`,
    values: only(R.goalsConceded.positions, R.goalsConceded.points),
  },
  { event: "Yellow card", values: all(R.yellowCard) },
  { event: "Red card", values: all(R.redCard) },
  { event: "Own goal", values: all(R.ownGoal) },
];

function Example() {
  // Worked example built from the live rules, so it stays correct if values change.
  const lines = [
    { label: `Played 90 minutes`, pts: R.appearance.full },
    { label: "Scored 1 goal (midfielder)", pts: R.goal.MID },
    { label: "1 assist", pts: R.assist },
    { label: "Yellow card", pts: R.yellowCard },
  ];
  const base = lines.reduce((s, l) => s + l.pts, 0);
  return (
    <Card className="space-y-2 text-sm">
      <p className="font-semibold">Example: your captain, a midfielder</p>
      <ul className="space-y-1">
        {lines.map((l) => (
          <li key={l.label} className="flex justify-between">
            <span>{l.label}</span>
            <span className="font-mono">{fmt(l.pts)}</span>
          </li>
        ))}
        <li className="flex justify-between border-t border-line pt-1">
          <span>Base points</span>
          <span className="font-mono">{base}</span>
        </li>
        <li className="flex justify-between font-bold">
          <span>As captain (×{R.captainMultiplier})</span>
          <span className="font-mono">{base * R.captainMultiplier}</span>
        </li>
      </ul>
    </Card>
  );
}

export default function RulesPage() {
  return (
    <div className="space-y-8">
      <PageTitle subtitle="Everything that earns or costs points, and how prices work.">
        How points work
      </PageTitle>

      <section className="space-y-3">
        <h2 className="text-lg font-bold">Building your XI</h2>
        <Card>
          <ul className="list-disc space-y-1 pl-5 text-sm">
            <li>
              Pick <b>{TEAM_RULES.squadSize} players</b> from Barça and that match&apos;s opponent.
            </li>
            <li>
              Budget: <b>{TEAM_RULES.budget} credits</b>. Max <b>{TEAM_RULES.maxPerTeam}</b> players
              from one team.
            </li>
            <li>
              Formation:{" "}
              {POSITIONS.map((p) => {
                const { min, max } = TEAM_RULES.formation[p];
                return `${min === max ? min : `${min}–${max}`} ${p}`;
              }).join(", ")}
              .
            </li>
            <li>
              <b>Captain</b> scores ×{R.captainMultiplier}. <b>Vice-captain</b> scores ×
              {R.viceCaptainMultiplier} — but only if your captain doesn&apos;t play.
            </li>
            <li>Teams lock at kickoff. Points arrive after full time.</li>
          </ul>
        </Card>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-bold">Points per player</h2>
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="text-xs text-ink-muted uppercase">
              <tr>
                <th className="p-3 text-left">Event</th>
                {POSITIONS.map((p) => (
                  <th key={p} className="p-3 text-right" title={POSITION_LABELS[p]}>
                    {p}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ROWS.map((row) => (
                <tr key={`${row.event}${row.note ?? ""}`} className="border-t border-line">
                  <td className="p-3">
                    <span className="font-medium">{row.event}</span>
                    {row.note && <span className="block text-xs text-ink-muted">{row.note}</span>}
                  </td>
                  {POSITIONS.map((p) => {
                    const v = row.values[p];
                    return (
                      <td
                        key={p}
                        className={`p-3 text-right font-mono ${
                          v == null || v === 0
                            ? "text-ink-muted"
                            : v > 0
                              ? "font-semibold text-ink"
                              : "font-semibold text-garnet-500"
                        }`}
                      >
                        {v == null ? "–" : fmt(v)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
        <p className="text-xs text-ink-muted">
          A player who doesn&apos;t get on the pitch scores 0. If a saved team somehow breaks the
          team rules, it scores 0.
        </p>
        <Example />
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-bold">Player prices</h2>
        <Card className="space-y-3 text-sm">
          <p>
            Prices follow <b>recent form</b>: each player&apos;s last 3 matches — how many minutes
            they played, their match ratings, and their goals and assists. They&apos;re updated
            every day, so a player on a hot streak gets more expensive.
          </p>
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {POSITIONS.map((p) => (
              <li key={p} className="rounded-xl bg-surface p-2 text-center">
                <span className="block text-xs text-ink-muted">{POSITION_LABELS[p]}</span>
                <span className="font-bold">
                  {PRICE_BANDS[p].min.toFixed(1)}–{PRICE_BANDS[p].max.toFixed(1)}
                </span>
              </li>
            ))}
          </ul>
          <p className="text-xs text-ink-muted">
            Eleven regular starters fit in the budget; a team full of stars doesn&apos;t. Once you
            save a team, it keeps the prices you paid even if they change later.
          </p>
        </Card>
      </section>
    </div>
  );
}
