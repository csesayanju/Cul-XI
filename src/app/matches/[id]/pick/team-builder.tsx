"use client";

import { useMemo, useState, useTransition } from "react";

import { saveTeam } from "@/app/actions/team";
import { Badge, Button, cx, Initials, Notice } from "@/components/ui";
import { POSITION_LABELS } from "@/features/fantasy/labels";
import type { MatchPlayer } from "@/features/fantasy/queries";
import { TEAM_RULES } from "@/features/fantasy/scoring/rules";
import { POSITIONS, type Position } from "@/features/fantasy/types";
import { validateTeam } from "@/features/fantasy/validation/validate-team";

interface Props {
  matchId: number;
  barcaTeamId: number;
  players: MatchPlayer[];
  initial: { playerIds: number[]; captainId: number | null; viceCaptainId: number | null };
}

const LINEUP_TAG: Record<MatchPlayer["lineupStatus"], string | null> = {
  unknown: null,
  starting: "Starting",
  bench: "Bench",
  not_in_squad: "Not in squad",
};

export function TeamBuilder({ matchId, barcaTeamId, players, initial }: Props) {
  const [selected, setSelected] = useState<number[]>(initial.playerIds);
  const [captainId, setCaptainId] = useState(initial.captainId);
  const [viceCaptainId, setViceCaptainId] = useState(initial.viceCaptainId);
  const [filter, setFilter] = useState<Position | "ALL" | "XI">("ALL");
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const byId = useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);
  const picked = selected.map((id) => byId.get(id)).filter((p): p is MatchPlayer => !!p);
  const allowedTeamIds = useMemo(() => [...new Set(players.map((p) => p.teamId))], [players]);

  const validation = validateTeam(
    {
      players: picked.map((p) => ({
        playerId: p.id,
        position: p.position,
        teamId: p.teamId,
        price: p.price,
      })),
      captainId,
      viceCaptainId,
    },
    { allowedTeamIds },
  );

  function toggle(id: number) {
    setResult(null);
    if (selected.includes(id)) {
      setSelected(selected.filter((x) => x !== id));
      if (captainId === id) setCaptainId(null);
      if (viceCaptainId === id) setViceCaptainId(null);
    } else if (selected.length < TEAM_RULES.squadSize) {
      setSelected([...selected, id]);
    }
  }

  function setArmband(id: number, role: "C" | "VC") {
    setResult(null);
    if (role === "C") {
      setCaptainId(id);
      if (viceCaptainId === id) setViceCaptainId(null);
    } else {
      setViceCaptainId(id);
      if (captainId === id) setCaptainId(null);
    }
  }

  function save() {
    startTransition(async () => {
      setResult(await saveTeam({ matchId, playerIds: selected, captainId, viceCaptainId }));
    });
  }

  const visible = players.filter((p) =>
    filter === "ALL" ? true : filter === "XI" ? selected.includes(p.id) : p.position === filter,
  );
  const overBudget = validation.remainingBudget < 0;

  return (
    <div className="pb-28">
      {/* Summary */}
      <div className="mb-4 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-xl border border-line bg-surface-raised p-2">
          <p className="text-xs text-ink-muted">Players</p>
          <p className="text-lg font-bold">
            {selected.length}/{TEAM_RULES.squadSize}
          </p>
        </div>
        <div className="rounded-xl border border-line bg-surface-raised p-2">
          <p className="text-xs text-ink-muted">Bank</p>
          <p className={cx("text-lg font-bold", overBudget && "text-garnet-500")}>
            {validation.remainingBudget.toFixed(1)}
          </p>
        </div>
        <div className="rounded-xl border border-line bg-surface-raised p-2">
          <p className="text-xs text-ink-muted">Shape</p>
          <p className="text-lg font-bold">
            {validation.countsByPosition.DEF}-{validation.countsByPosition.MID}-
            {validation.countsByPosition.FWD}
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
        {(["ALL", "XI", ...POSITIONS] as const).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={cx(
              "min-h-9 shrink-0 rounded-full border px-3 text-sm font-semibold",
              filter === f ? "border-transparent bg-brand text-brand-ink" : "border-line",
            )}
          >
            {f === "ALL"
              ? "All"
              : f === "XI"
                ? "My XI"
                : `${f} ${validation.countsByPosition[f]}/${TEAM_RULES.formation[f].max}`}
          </button>
        ))}
      </div>

      {players.length === 0 && (
        <Notice>No players loaded for this match yet. An admin needs to sync squads.</Notice>
      )}

      {/* Player list */}
      <ul className="space-y-2">
        {visible.map((p) => {
          const isSelected = selected.includes(p.id);
          const isBarca = p.teamId === barcaTeamId;
          const tag = LINEUP_TAG[p.lineupStatus];
          return (
            <li
              key={p.id}
              className={cx(
                "flex items-center gap-3 rounded-xl border bg-surface-raised p-2",
                isSelected ? "border-accent ring-1 ring-accent" : "border-line",
              )}
            >
              <button
                type="button"
                onClick={() => toggle(p.id)}
                className="flex min-w-0 flex-1 items-center gap-3 text-left"
                aria-pressed={isSelected}
                aria-label={`${isSelected ? "Remove" : "Add"} ${p.name}`}
              >
                <Initials name={p.name} barca={isBarca} />
                <span className="min-w-0">
                  <span className="block truncate font-semibold">{p.name}</span>
                  <span className="flex flex-wrap items-center gap-1 text-xs text-ink-muted">
                    {p.position} · {isBarca ? "Barça" : p.teamName}
                    {tag && (
                      <Badge tone={p.lineupStatus === "starting" ? "gold" : "neutral"}>{tag}</Badge>
                    )}
                  </span>
                </span>
              </button>
              {isSelected && (
                <div className="flex gap-1">
                  {(["C", "VC"] as const).map((role) => {
                    const active = role === "C" ? captainId === p.id : viceCaptainId === p.id;
                    return (
                      <button
                        key={role}
                        type="button"
                        onClick={() => setArmband(p.id, role)}
                        aria-label={`Make ${p.name} ${role === "C" ? "captain" : "vice-captain"}`}
                        className={cx(
                          "size-9 rounded-full text-xs font-bold",
                          active ? "bg-gold-400 text-blaugrana-950" : "border border-line",
                        )}
                      >
                        {role}
                      </button>
                    );
                  })}
                </div>
              )}
              <span className="w-10 shrink-0 text-right text-sm font-bold">
                {p.price.toFixed(1)}
              </span>
            </li>
          );
        })}
      </ul>

      {/* Sticky save bar */}
      <div className="fixed inset-x-0 bottom-0 border-t border-line bg-surface/95 p-3 backdrop-blur">
        <div className="mx-auto max-w-2xl space-y-2">
          {result && <Notice tone={result.ok ? "success" : "error"}>{result.message}</Notice>}
          {!result && !validation.valid && selected.length > 0 && (
            <p className="text-xs text-ink-muted">{validation.errors[0]?.message}</p>
          )}
          <Button className="w-full" onClick={save} disabled={!validation.valid || pending}>
            {pending ? "Saving…" : validation.valid ? "Save team" : "Complete your XI to save"}
          </Button>
        </div>
      </div>

      <p className="mt-4 text-xs text-ink-muted">
        {POSITIONS.map((pos) => {
          const { min, max } = TEAM_RULES.formation[pos];
          return `${POSITION_LABELS[pos]}: ${min === max ? min : `${min}–${max}`}`;
        }).join(" · ")}
        . Max {TEAM_RULES.maxPerTeam} per team, {TEAM_RULES.budget} credits.
      </p>
    </div>
  );
}
