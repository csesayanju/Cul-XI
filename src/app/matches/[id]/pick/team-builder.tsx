"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";

import { saveTeam } from "@/app/actions/team";
import { PlayerAvatar } from "@/components/player-avatar";
import { Badge, Button, cx, Input, Notice } from "@/components/ui";
import { Pitch, pitchName } from "@/features/fantasy/components/pitch";
import {
  fitToFormation,
  formationFor,
  FORMATIONS,
  type Formation,
  type Slots,
} from "@/features/fantasy/formations";
import { POSITION_LABELS } from "@/features/fantasy/labels";
import type { MatchPlayer } from "@/features/fantasy/queries";
import { TEAM_RULES } from "@/features/fantasy/scoring/rules";
import { POSITIONS, type Position } from "@/features/fantasy/types";
import { validateTeam } from "@/features/fantasy/validation/validate-team";

interface Props {
  matchId: number;
  barcaTeamId: number;
  opponentName: string;
  players: MatchPlayer[];
  initial: { playerIds: number[]; captainId: number | null; viceCaptainId: number | null };
}

type Sheet =
  | { mode: "pick"; pos: Position; index: number }
  | { mode: "player"; pos: Position; index: number; playerId: number };

const LINEUP_TAG: Record<MatchPlayer["lineupStatus"], string | null> = {
  unknown: null,
  starting: "Starting",
  bench: "Bench",
  not_in_squad: "Not in squad",
};

/** "€70m" / "€800k" */
export function formatValue(v: number) {
  return v >= 1_000_000 ? `€${Math.round(v / 100_000) / 10}m` : `€${Math.round(v / 1000)}k`;
}

function formLine(p: MatchPlayer) {
  const f = p.form;
  const value = p.marketValue ? `${formatValue(p.marketValue)} · ` : "";
  if (!f || f.matches === 0) return `${value}No recent data`;
  const bits = [`${value}${f.apps}/${f.matches} apps`];
  if (f.goals || f.assists) bits.push(`${f.goals}G ${f.assists}A`);
  if (f.avgRating != null) bits.push(`★ ${f.avgRating.toFixed(1)}`);
  return bits.join(" · ");
}

export function TeamBuilder({ matchId, barcaTeamId, opponentName, players, initial }: Props) {
  const byId = useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);
  const allowedTeamIds = useMemo(() => [...new Set(players.map((p) => p.teamId))], [players]);

  const [formation, setFormation] = useState<Formation>(() => {
    const counts: Partial<Record<Position, number>> = {};
    for (const id of initial.playerIds) {
      const pos = byId.get(id)?.position;
      if (pos) counts[pos] = (counts[pos] ?? 0) + 1;
    }
    return formationFor(counts);
  });
  const [slots, setSlots] = useState<Slots>(() => {
    const idsByPos = Object.fromEntries(POSITIONS.map((p) => [p, [] as number[]])) as Record<
      Position,
      number[]
    >;
    for (const id of initial.playerIds) {
      const pos = byId.get(id)?.position;
      if (pos) idsByPos[pos].push(id);
    }
    return fitToFormation(formation, idsByPos).slots;
  });
  const [captainId, setCaptainId] = useState(initial.captainId);
  const [viceCaptainId, setViceCaptainId] = useState(initial.viceCaptainId);
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [notice, setNotice] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const selectedIds = POSITIONS.flatMap((p) => slots[p]).filter((id): id is number => id != null);
  const picked = selectedIds.map((id) => byId.get(id)).filter((p): p is MatchPlayer => !!p);

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

  const changed = () => setNotice(null);

  function changeFormation(next: Formation) {
    changed();
    const idsByPos = Object.fromEntries(
      POSITIONS.map((p) => [p, slots[p].filter((id): id is number => id != null)]),
    ) as Record<Position, number[]>;
    const { slots: nextSlots, dropped } = fitToFormation(next, idsByPos);
    if (captainId && dropped.includes(captainId)) setCaptainId(null);
    if (viceCaptainId && dropped.includes(viceCaptainId)) setViceCaptainId(null);
    setFormation(next);
    setSlots(nextSlots);
    if (dropped.length) {
      setNotice({
        ok: false,
        message: `Removed ${dropped.map((id) => byId.get(id)?.name).join(", ")} to fit ${next.name}.`,
      });
    }
  }

  function setSlot(pos: Position, index: number, playerId: number | null) {
    changed();
    const previous = slots[pos][index];
    if (previous && previous !== playerId) {
      if (captainId === previous) setCaptainId(null);
      if (viceCaptainId === previous) setViceCaptainId(null);
    }
    setSlots({ ...slots, [pos]: slots[pos].map((id, i) => (i === index ? playerId : id)) });
    setSheet(null);
  }

  function setArmband(playerId: number, role: "C" | "VC") {
    changed();
    if (role === "C") {
      setCaptainId(playerId);
      if (viceCaptainId === playerId) setViceCaptainId(null);
    } else {
      setViceCaptainId(playerId);
      if (captainId === playerId) setCaptainId(null);
    }
    setSheet(null);
  }

  function save() {
    startTransition(async () => {
      setNotice(await saveTeam({ matchId, playerIds: selectedIds, captainId, viceCaptainId }));
    });
  }

  const rows = Object.fromEntries(
    POSITIONS.map((pos) => [
      pos,
      slots[pos].map((id, index) => {
        const p = id != null ? byId.get(id) : undefined;
        if (!p) {
          return (
            <button
              key={`${pos}-${index}`}
              type="button"
              onClick={() => setSheet({ mode: "pick", pos, index })}
              className="flex w-16 flex-col items-center gap-1 text-white"
              aria-label={`Add a ${POSITION_LABELS[pos].toLowerCase().replace(/s$/, "")}`}
            >
              <span className="flex size-11 items-center justify-center rounded-full border-2 border-dashed border-white/70 bg-white/10 text-2xl leading-none">
                +
              </span>
              <span className="rounded bg-black/40 px-1.5 text-[11px] font-semibold">{pos}</span>
            </button>
          );
        }
        const role = captainId === p.id ? "C" : viceCaptainId === p.id ? "VC" : null;
        return (
          <button
            key={`${pos}-${index}`}
            type="button"
            onClick={() => setSheet({ mode: "player", pos, index, playerId: p.id })}
            className="relative flex w-16 flex-col items-center gap-0.5"
            aria-label={`${p.name}${role ? ` (${role === "C" ? "captain" : "vice-captain"})` : ""}`}
          >
            <span className="relative">
              <PlayerAvatar name={p.name} photoUrl={p.photoUrl} barca={p.teamId === barcaTeamId} />
              {role && (
                <span className="absolute -top-1 -right-2 rounded-full bg-gold-400 px-1 text-[10px] font-black text-blaugrana-950 ring-1 ring-white">
                  {role}
                </span>
              )}
            </span>
            <span className="max-w-full truncate rounded bg-white px-1 text-[11px] font-semibold text-blaugrana-950">
              {pitchName(p.name)}
            </span>
            <span className="rounded bg-blaugrana-900/80 px-1 text-[10px] font-bold text-white">
              {p.price.toFixed(1)}
            </span>
          </button>
        );
      }),
    ]),
  ) as Record<Position, React.ReactNode[]>;

  const overBudget = validation.remainingBudget < 0;

  return (
    <div className="space-y-4 pb-32">
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-xl border border-line bg-surface-raised p-2">
          <p className="text-xs text-ink-muted">Players</p>
          <p className="text-lg font-bold">
            {selectedIds.length}/{TEAM_RULES.squadSize}
          </p>
        </div>
        <div className="rounded-xl border border-line bg-surface-raised p-2">
          <p className="text-xs text-ink-muted">Bank</p>
          <p className={cx("text-lg font-bold", overBudget && "text-garnet-500")}>
            {validation.remainingBudget.toFixed(1)}
          </p>
        </div>
        <label className="rounded-xl border border-line bg-surface-raised p-2">
          <span className="block text-xs text-ink-muted">Formation</span>
          <select
            value={formation.name}
            onChange={(e) => changeFormation(FORMATIONS.find((f) => f.name === e.target.value)!)}
            className="w-full bg-transparent text-center text-lg font-bold"
          >
            {FORMATIONS.map((f) => (
              <option key={f.name} value={f.name}>
                {f.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      {players.length === 0 ? (
        <Notice>No players loaded for this match yet. An admin needs to sync squads.</Notice>
      ) : (
        <Pitch rows={rows} />
      )}

      <p className="text-center text-xs text-ink-muted">
        Tap <b>+</b> to add a player, tap a player for captain / vice-captain / remove.{" "}
        <Link href="/rules" className="underline">
          How points work
        </Link>
      </p>

      {sheet && (
        <PlayerSheet
          sheet={sheet}
          players={players}
          byId={byId}
          barcaTeamId={barcaTeamId}
          opponentName={opponentName}
          selectedIds={selectedIds}
          replacing={
            sheet.mode === "pick" ? (byId.get(slots[sheet.pos][sheet.index] ?? -1) ?? null) : null
          }
          countsByTeam={validation.countsByTeam}
          remainingBudget={validation.remainingBudget}
          captainId={captainId}
          viceCaptainId={viceCaptainId}
          onPick={(id) => setSlot(sheet.pos, sheet.index, id)}
          onRemove={() => setSlot(sheet.pos, sheet.index, null)}
          onReplace={() => setSheet({ mode: "pick", pos: sheet.pos, index: sheet.index })}
          onArmband={setArmband}
          onClose={() => setSheet(null)}
        />
      )}

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface/95 p-3 backdrop-blur">
        <div className="mx-auto max-w-2xl space-y-2">
          {notice && <Notice tone={notice.ok ? "success" : "error"}>{notice.message}</Notice>}
          {!notice && !validation.valid && selectedIds.length > 0 && (
            <p className="text-xs text-ink-muted">{validation.errors[0]?.message}</p>
          )}
          <Button className="w-full" onClick={save} disabled={!validation.valid || pending}>
            {pending ? "Saving…" : validation.valid ? "Save team" : "Complete your XI to save"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function PlayerSheet(props: {
  sheet: Sheet;
  players: MatchPlayer[];
  byId: Map<number, MatchPlayer>;
  barcaTeamId: number;
  opponentName: string;
  selectedIds: number[];
  /** Player currently in the slot being filled (their price and club slot are freed up). */
  replacing: MatchPlayer | null;
  countsByTeam: Record<number, number>;
  remainingBudget: number;
  captainId: number | null;
  viceCaptainId: number | null;
  onPick: (id: number) => void;
  onRemove: () => void;
  onReplace: () => void;
  onArmband: (id: number, role: "C" | "VC") => void;
  onClose: () => void;
}) {
  const { sheet, barcaTeamId, onClose } = props;
  const [team, setTeam] = useState<"all" | "barca" | "opp">("all");
  const [sort, setSort] = useState<"price" | "form">("price");
  const [query, setQuery] = useState("");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  let body: React.ReactNode;
  if (sheet.mode === "player") {
    const p = props.byId.get(sheet.playerId)!;
    body = (
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <PlayerAvatar
            name={p.name}
            photoUrl={p.photoUrl}
            barca={p.teamId === barcaTeamId}
            size="lg"
          />
          <div>
            <p className="text-lg font-bold">{p.name}</p>
            <p className="text-sm text-ink-muted">
              {p.position} · {p.teamId === barcaTeamId ? "Barça" : p.teamName} ·{" "}
              {p.price.toFixed(1)}
            </p>
            <p className="text-xs text-ink-muted">{formLine(p)}</p>
            {p.photoUrl && p.photoCredit && (
              <p className="text-[11px] text-ink-muted">
                Photo:{" "}
                {p.photoPageUrl ? (
                  <a href={p.photoPageUrl} target="_blank" rel="noreferrer" className="underline">
                    {p.photoCredit}
                  </a>
                ) : (
                  p.photoCredit
                )}
              </p>
            )}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant={props.captainId === p.id ? "primary" : "ghost"}
            onClick={() => props.onArmband(p.id, "C")}
          >
            {props.captainId === p.id ? "Captain ✓" : "Make captain"}
          </Button>
          <Button
            variant={props.viceCaptainId === p.id ? "primary" : "ghost"}
            onClick={() => props.onArmband(p.id, "VC")}
          >
            {props.viceCaptainId === p.id ? "Vice-captain ✓" : "Make vice-captain"}
          </Button>
          <Button variant="secondary" onClick={props.onReplace}>
            Replace
          </Button>
          <Button variant="ghost" onClick={props.onRemove}>
            Remove
          </Button>
        </div>
      </div>
    );
  } else {
    const { replacing } = props;
    const q = query.trim().toLowerCase();
    const list = props.players
      .filter((p) => p.position === sheet.pos)
      .filter((p) => team === "all" || (team === "barca") === (p.teamId === barcaTeamId))
      .filter((p) => !q || p.name.toLowerCase().includes(q))
      .sort((a, b) =>
        sort === "price"
          ? b.price - a.price || a.name.localeCompare(b.name)
          : (b.form?.avgRating ?? 0) - (a.form?.avgRating ?? 0) || b.price - a.price,
      );
    body = (
      <div className="space-y-3">
        <div className="flex flex-wrap gap-2">
          {(
            [
              ["all", "All"],
              ["barca", "Barça"],
              ["opp", props.opponentName],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setTeam(value)}
              className={cx(
                "min-h-9 rounded-full border px-3 text-sm font-semibold",
                team === value ? "border-transparent bg-brand text-brand-ink" : "border-line",
              )}
            >
              {label}
            </button>
          ))}
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as "price" | "form")}
            className="ml-auto min-h-9 rounded-full border border-line bg-surface px-3 text-sm"
            aria-label="Sort by"
          >
            <option value="price">Sort: price</option>
            <option value="form">Sort: form</option>
          </select>
        </div>
        <Input
          placeholder="Search players"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search players"
        />
        <ul className="space-y-2">
          {list.map((p) => {
            const inXi = props.selectedIds.includes(p.id);
            const freedSlot = replacing?.teamId === p.teamId ? 1 : 0;
            const teamFull =
              (props.countsByTeam[p.teamId] ?? 0) - freedSlot >= TEAM_RULES.maxPerTeam;
            const tooExpensive = p.price > props.remainingBudget + (replacing?.price ?? 0);
            const disabled = inXi || teamFull;
            const tag = LINEUP_TAG[p.lineupStatus];
            return (
              <li key={p.id}>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => props.onPick(p.id)}
                  className="flex w-full items-center gap-3 rounded-xl border border-line bg-surface-raised p-2 text-left disabled:opacity-50"
                >
                  <PlayerAvatar
                    name={p.name}
                    photoUrl={p.photoUrl}
                    barca={p.teamId === barcaTeamId}
                    size="sm"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{p.name}</span>
                    <span className="flex flex-wrap items-center gap-1 text-xs text-ink-muted">
                      {p.teamId === barcaTeamId ? "Barça" : p.teamName} · {formLine(p)}
                      {tag && (
                        <Badge tone={p.lineupStatus === "starting" ? "gold" : "neutral"}>
                          {tag}
                        </Badge>
                      )}
                      {inXi && <Badge tone="blue">In XI</Badge>}
                      {!inXi && teamFull && (
                        <Badge tone="neutral">Max {TEAM_RULES.maxPerTeam}</Badge>
                      )}
                    </span>
                  </span>
                  <span
                    className={cx(
                      "w-10 shrink-0 text-right text-sm font-bold",
                      tooExpensive && "text-garnet-500",
                    )}
                  >
                    {p.price.toFixed(1)}
                  </span>
                </button>
              </li>
            );
          })}
          {list.length === 0 && <li className="text-sm text-ink-muted">No players match.</li>}
        </ul>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-30 flex items-end justify-center"
      role="dialog"
      aria-modal="true"
    >
      <button
        type="button"
        aria-label="Close"
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
      />
      <div className="relative max-h-[80dvh] w-full max-w-2xl overflow-y-auto rounded-t-3xl bg-surface p-4 shadow-2xl">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold">
            {sheet.mode === "pick"
              ? `Choose a ${POSITION_LABELS[sheet.pos].replace(/s$/, "").toLowerCase()}`
              : "Player"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="px-2 text-2xl leading-none text-ink-muted"
            aria-label="Close"
          >
            ×
          </button>
        </div>
        {body}
      </div>
    </div>
  );
}
