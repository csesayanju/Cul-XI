import type { Metadata } from "next";
import Link from "next/link";

import { Card, PageTitle } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

import { ImportButton, ListEditor, NewListForm, type EditableList } from "./trivia-admin";

export const metadata: Metadata = { title: "Culé Ten admin" };
// The Wikidata import (a server action on this page) takes ~30 s.
export const maxDuration = 60;

export default async function TriviaAdminPage() {
  await requireAdmin();
  const db = await createClient(); // admin RLS: can read drafts and answers

  const [{ count: repoSize }, { data: lists }, { data: schedule }] = await Promise.all([
    db.from("trivia_players").select("id", { count: "exact", head: true }),
    db
      .from("trivia_lists")
      .select(
        "id, title, subtitle, kind, status, auto_key, trivia_list_entries(rank, stat_label, trivia_players(id, name, nationality))",
      )
      .neq("status", "archived")
      .order("kind")
      .order("updated_at", { ascending: false }),
    db
      .from("trivia_daily")
      .select("day, trivia_lists(title)")
      .order("day", { ascending: false })
      .limit(7),
  ]);

  const editable = (
    (lists ?? []) as unknown as {
      id: string;
      title: string;
      subtitle: string | null;
      kind: "auto" | "curated";
      status: "draft" | "approved";
      auto_key: string | null;
      trivia_list_entries: {
        rank: number;
        stat_label: string | null;
        trivia_players: { id: number; name: string; nationality: string | null };
      }[];
    }[]
  )
    .filter((l) => l.kind === "curated")
    .map((l): EditableList => ({
      id: l.id,
      title: l.title,
      subtitle: l.subtitle,
      status: l.status,
      fromWikidata: !!l.auto_key?.startsWith("wd:"),
      entries: [...l.trivia_list_entries]
        .sort((a, b) => a.rank - b.rank)
        .map((e) => ({
          playerId: Number(e.trivia_players.id),
          name: e.trivia_players.name,
          nationality: e.trivia_players.nationality,
          statLabel: e.stat_label ?? "",
        })),
    }));

  return (
    <div className="space-y-8">
      <PageTitle subtitle="The daily top-10 game. Approved lists are used first; otherwise an automatic current-season list is picked.">
        Culé Ten
      </PageTitle>
      <p className="text-sm">
        <Link href="/admin" className="underline">
          ← Back to admin
        </Link>
      </p>

      <section className="space-y-3">
        <h2 className="text-lg font-bold">Player repository</h2>
        <Card className="space-y-3 text-sm">
          <p>
            {repoSize ?? 0} players stored. The import fetches every FC Barcelona player from
            Wikidata once (≈30 s, free, no API quota), links today&apos;s squad and drafts
            historical lists for you to check below. Re-run it any time to refresh.
          </p>
          <ImportButton />
        </Card>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-bold">Recent days</h2>
        <Card className="p-0 text-sm">
          <ul className="divide-y divide-line">
            {(
              (schedule ?? []) as unknown as {
                day: string;
                trivia_lists: { title: string } | null;
              }[]
            ).map((d) => (
              <li key={d.day} className="flex justify-between gap-3 p-3">
                <span className="text-ink-muted">{d.day}</span>
                <span className="text-right">{d.trivia_lists?.title}</span>
              </li>
            ))}
            {(schedule ?? []).length === 0 && (
              <li className="p-3 text-ink-muted">Nothing scheduled yet.</li>
            )}
          </ul>
        </Card>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-bold">Historical lists</h2>
        <p className="text-sm text-ink-muted">
          Drafts from Wikidata can contain mistakes — check each name, rank and stat, fix
          what&apos;s wrong, then approve. Only approved lists are ever played.
        </p>
        <NewListForm />
        {editable.map((l) => (
          <ListEditor key={l.id} list={l} />
        ))}
      </section>
    </div>
  );
}
