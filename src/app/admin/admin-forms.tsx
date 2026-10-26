"use client";

import { useActionState, useState } from "react";

import { runAdminJob, saveManualStats, type AdminJob } from "@/app/actions/admin";
import { Button, Input, Notice } from "@/components/ui";
import type { PlayerMatchStats } from "@/features/fantasy/types";

const JOB_LABELS: Record<AdminJob, { label: string; hint: string }> = {
  fixtures: { label: "Sync fixtures", hint: "2 requests, cached 12h" },
  squads: { label: "Sync squads", hint: "≤3 per team, mostly cached" },
  lineups: { label: "Sync line-ups", hint: "1 request, from 40 min before kickoff" },
  stats: { label: "Sync stats + points", hint: "2 requests per finished match" },
  points: { label: "Recalculate points", hint: "No API requests" },
};

export function SyncPanel({ matches }: { matches: { id: number; label: string }[] }) {
  const [state, action, pending] = useActionState(runAdminJob, null);

  return (
    <form action={action} className="space-y-3">
      <div>
        <label htmlFor="sync-match" className="mb-1 block text-sm font-medium">
          Match (optional — leave blank to let each job pick what needs syncing)
        </label>
        <select
          id="sync-match"
          name="matchId"
          className="min-h-11 w-full rounded-xl border border-line bg-surface px-3"
          defaultValue=""
        >
          <option value="">Auto</option>
          {matches.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {(Object.keys(JOB_LABELS) as AdminJob[]).map((job) => (
          <Button
            key={job}
            name="job"
            value={job}
            variant="secondary"
            disabled={pending}
            className="flex-col py-2"
          >
            <span>{JOB_LABELS[job].label}</span>
            <span className="text-xs font-normal opacity-75">{JOB_LABELS[job].hint}</span>
          </Button>
        ))}
      </div>
      {pending && <Notice>Working…</Notice>}
      {state && !pending && <Notice tone={state.ok ? "success" : "error"}>{state.message}</Notice>}
    </form>
  );
}

export interface EditablePlayer {
  id: number;
  name: string;
  teamName: string;
  position: string;
  price: number;
  priceLocked: boolean;
  stats: (PlayerMatchStats & { source: "api" | "manual" }) | null;
}

const NUMBER_FIELDS: { name: keyof PlayerMatchStats; label: string; max: number }[] = [
  { name: "minutes", label: "Minutes", max: 130 },
  { name: "goals", label: "Goals", max: 10 },
  { name: "assists", label: "Assists", max: 10 },
  { name: "saves", label: "Saves", max: 30 },
  { name: "goalsConceded", label: "Goals conceded", max: 15 },
  { name: "yellowCards", label: "Yellow cards", max: 2 },
  { name: "redCards", label: "Red cards", max: 1 },
  { name: "penaltiesMissed", label: "Pens missed", max: 5 },
  { name: "penaltiesSaved", label: "Pens saved", max: 5 },
  { name: "ownGoals", label: "Own goals", max: 5 },
];

export function StatsEditor({ matchId, players }: { matchId: number; players: EditablePlayer[] }) {
  const [playerId, setPlayerId] = useState<number | null>(players[0]?.id ?? null);
  const [state, action, pending] = useActionState(saveManualStats, null);
  const player = players.find((p) => p.id === playerId);

  if (players.length === 0)
    return <Notice>No players for this match yet. Sync squads first.</Notice>;

  return (
    <div className="space-y-3">
      <div>
        <label htmlFor="stats-player" className="mb-1 block text-sm font-medium">
          Player
        </label>
        <select
          id="stats-player"
          className="min-h-11 w-full rounded-xl border border-line bg-surface px-3"
          value={playerId ?? ""}
          onChange={(e) => setPlayerId(Number(e.target.value))}
        >
          {players.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} · {p.position} · {p.teamName}
              {p.stats ? (p.stats.source === "manual" ? " ✎" : " ✓") : ""}
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-ink-muted">✓ = API stats, ✎ = manual override</p>
      </div>

      {player && (
        // `key` resets the uncontrolled inputs when switching players.
        <form key={player.id} action={action} className="space-y-3">
          <input type="hidden" name="matchId" value={matchId} />
          <input type="hidden" name="playerId" value={player.id} />
          <fieldset className="space-y-2 rounded-xl border border-line p-3">
            <legend className="px-1 text-sm font-semibold">Price</legend>
            <div className="flex items-end gap-2">
              <label className="flex-1 text-sm">
                Credits
                <Input
                  name="price"
                  type="number"
                  step="0.5"
                  min="0.5"
                  max="20"
                  defaultValue={player.price}
                />
              </label>
              <Button
                type="submit"
                name="intent"
                value="price"
                variant="secondary"
                disabled={pending}
              >
                Save price
              </Button>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="priceLocked"
                defaultChecked={player.priceLocked}
                className="size-5"
              />
              Set price manually (untick to go back to automatic, form-based pricing)
            </label>
            <p className="text-xs text-ink-muted">
              Price changes apply to teams picked afterwards; saved teams keep the price they paid.
            </p>
          </fieldset>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {NUMBER_FIELDS.map((f) => (
              <label key={f.name} className="text-sm">
                {f.label}
                <Input
                  name={f.name}
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={f.max}
                  defaultValue={Number(player.stats?.[f.name] ?? 0)}
                />
              </label>
            ))}
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="cleanSheet"
                defaultChecked={player.stats?.cleanSheet ?? false}
                className="size-5"
              />
              Clean sheet
            </label>
          </div>
          <Button type="submit" name="intent" value="stats" disabled={pending} className="w-full">
            {pending ? "Saving…" : "Save stats override & recalculate"}
          </Button>
          {state && <Notice tone={state.ok ? "success" : "error"}>{state.message}</Notice>}
        </form>
      )}
    </div>
  );
}
