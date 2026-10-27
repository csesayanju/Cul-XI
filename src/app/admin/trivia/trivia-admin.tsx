"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  createTriviaList,
  importTriviaRepository,
  saveTriviaList,
  setTriviaListStatus,
} from "@/app/actions/trivia";
import { Badge, Button, Card, Input, Notice } from "@/components/ui";
import { PlayerSearch } from "@/features/trivia/components/player-search";

type Msg = { ok: boolean; message: string } | null;

export function ImportButton() {
  const [msg, setMsg] = useState<Msg>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <div className="space-y-2">
      <Button
        variant="secondary"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setMsg(await importTriviaRepository());
            router.refresh();
          })
        }
      >
        {pending ? "Importing… (about 30 s)" : "Import Barça players from Wikidata"}
      </Button>
      {msg && <Notice tone={msg.ok ? "success" : "error"}>{msg.message}</Notice>}
    </div>
  );
}

export function NewListForm() {
  const [title, setTitle] = useState("");
  const [msg, setMsg] = useState<Msg>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <Card className="space-y-2">
      <p className="text-sm font-semibold">New list</p>
      <div className="flex gap-2">
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Barça's top 10 scorers in El Clásico"
        />
        <Button
          disabled={pending || title.trim().length < 3}
          onClick={() =>
            start(async () => {
              const res = await createTriviaList(title);
              setMsg(res);
              if (res.ok) {
                setTitle("");
                router.refresh();
              }
            })
          }
        >
          Create
        </Button>
      </div>
      {msg && <Notice tone={msg.ok ? "success" : "error"}>{msg.message}</Notice>}
    </Card>
  );
}

export interface EditableList {
  id: string;
  title: string;
  subtitle: string | null;
  status: "draft" | "approved";
  fromWikidata: boolean;
  entries: { playerId: number; name: string; nationality: string | null; statLabel: string }[];
}

type Row = { playerId: number; name: string; statLabel: string } | null;

export function ListEditor({ list }: { list: EditableList }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(list.title);
  const [subtitle, setSubtitle] = useState(list.subtitle ?? "");
  const [rows, setRows] = useState<Row[]>(() =>
    Array.from({ length: 10 }, (_, i) => list.entries[i] ?? null),
  );
  const [msg, setMsg] = useState<Msg>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  const complete = rows.every((r) => r);
  const setRow = (i: number, row: Row) => setRows(rows.map((r, j) => (j === i ? row : r)));
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j > 9) return;
    const next = [...rows];
    [next[i], next[j]] = [next[j]!, next[i]!];
    setRows(next);
  };

  function save(thenApprove: boolean) {
    start(async () => {
      if (!complete) {
        setMsg({ ok: false, message: "Fill all 10 rows first." });
        return;
      }
      const res = await saveTriviaList({
        listId: list.id,
        title,
        subtitle,
        entries: rows.map((r) => ({ playerId: r!.playerId, statLabel: r!.statLabel })),
      });
      if (!res.ok || !thenApprove) {
        setMsg(res);
        router.refresh();
        return;
      }
      setMsg(await setTriviaListStatus(list.id, "approved"));
      router.refresh();
    });
  }

  return (
    <Card className="space-y-3">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-start gap-2 text-left"
      >
        <span className="flex-1 font-semibold">{list.title}</span>
        {list.fromWikidata && <Badge tone="neutral">Wikidata</Badge>}
        <Badge tone={list.status === "approved" ? "gold" : "garnet"}>{list.status}</Badge>
      </button>

      {open && (
        <div className="space-y-3">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Title" />
          <Input
            value={subtitle}
            onChange={(e) => setSubtitle(e.target.value)}
            placeholder="Subtitle (optional), e.g. League goals, all-time"
            aria-label="Subtitle"
          />
          <ol className="space-y-2">
            {rows.map((r, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="w-6 pt-3 text-center font-black text-ink-muted">{i + 1}</span>
                <div className="flex-1 space-y-1">
                  {r ? (
                    <div className="flex items-center gap-2">
                      <span className="flex-1 font-medium">{r.name}</span>
                      <button
                        type="button"
                        className="text-xs underline"
                        onClick={() => setRow(i, null)}
                      >
                        change
                      </button>
                    </div>
                  ) : (
                    <PlayerSearch
                      placeholder="Search a player…"
                      onPick={(p) => setRow(i, { playerId: p.id, name: p.name, statLabel: "" })}
                    />
                  )}
                  {r && (
                    <Input
                      value={r.statLabel}
                      onChange={(e) => setRow(i, { ...r, statLabel: e.target.value })}
                      placeholder="Stat shown when revealed, e.g. 474 goals"
                      aria-label={`Stat for rank ${i + 1}`}
                    />
                  )}
                </div>
                <div className="flex flex-col">
                  <button
                    type="button"
                    aria-label="Move up"
                    onClick={() => move(i, -1)}
                    className="px-2"
                  >
                    ▲
                  </button>
                  <button
                    type="button"
                    aria-label="Move down"
                    onClick={() => move(i, 1)}
                    className="px-2"
                  >
                    ▼
                  </button>
                </div>
              </li>
            ))}
          </ol>
          <div className="flex flex-wrap gap-2">
            <Button variant="ghost" disabled={pending} onClick={() => save(false)}>
              Save
            </Button>
            {list.status !== "approved" && (
              <Button disabled={pending || !complete} onClick={() => save(true)}>
                Save &amp; approve
              </Button>
            )}
            {list.status === "approved" && (
              <Button
                variant="ghost"
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    setMsg(await setTriviaListStatus(list.id, "draft"));
                    router.refresh();
                  })
                }
              >
                Unapprove
              </Button>
            )}
            <Button
              variant="ghost"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  setMsg(await setTriviaListStatus(list.id, "archived"));
                  router.refresh();
                })
              }
            >
              Archive
            </Button>
          </div>
          {msg && <Notice tone={msg.ok ? "success" : "error"}>{msg.message}</Notice>}
        </div>
      )}
    </Card>
  );
}
