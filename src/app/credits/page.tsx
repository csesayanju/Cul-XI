import type { Metadata } from "next";

import { Card, Notice, PageTitle } from "@/components/ui";
import { NO_LOGO } from "@/features/career/import";
import { createAdminClient } from "@/lib/supabase/admin";
import { commonsPage } from "@/lib/wikidata/careers";
import { articleUrl, HISTORY_PAGES } from "@/lib/wikipedia/barca-history";

export const metadata: Metadata = { title: "Credits" };
// Credits change as photos are found; render on request.
export const dynamic = "force-dynamic";

interface CreditRow {
  name: string;
  team_name: string;
  photo_credit: string | null;
  photo_page_url: string | null;
}

/**
 * Attribution for player photos from Wikimedia Commons (required by their CC licences).
 * Public page: player names and credits only, read with the service role since it's not
 * user data.
 */
export default async function CreditsPage() {
  const db = createAdminClient();
  const [{ data }, { data: logos }] = await Promise.all([
    db
      .from("players")
      .select("name, team_name, photo_credit, photo_page_url")
      .not("photo_url", "is", null)
      .not("photo_credit", "is", null)
      .order("team_name")
      .order("name"),
    db
      .from("trivia_clubs")
      .select("qid, name, short_name, logo_file")
      .not("logo_file", "is", null)
      .order("name"),
  ]);
  const rows = (data ?? []) as CreditRow[];
  const clubLogos = (
    (logos ?? []) as {
      qid: string;
      name: string;
      short_name: string | null;
      logo_file: string;
    }[]
  ).filter((l) => !NO_LOGO.has(l.qid));

  return (
    <>
      <PageTitle subtitle="Player photos come from Wikimedia Commons under free licences.">
        Photo credits
      </PageTitle>
      {rows.length === 0 ? (
        <Notice>No player photos yet.</Notice>
      ) : (
        <Card className="p-0">
          <ul className="divide-y divide-line text-sm">
            {rows.map((r) => (
              <li
                key={`${r.team_name}-${r.name}`}
                className="flex flex-wrap justify-between gap-2 p-3"
              >
                <span className="font-medium">
                  {r.name} <span className="text-ink-muted">· {r.team_name}</span>
                </span>
                {r.photo_page_url ? (
                  <a
                    href={r.photo_page_url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-ink-muted underline"
                  >
                    {r.photo_credit}
                  </a>
                ) : (
                  <span className="text-ink-muted">{r.photo_credit}</span>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}
      <p className="mt-4 text-xs text-ink-muted">
        Photos are cropped thumbnails of the original files; follow each link for the full image,
        author and licence terms. Culé XI is not affiliated with Wikimedia, the players or their
        clubs.
      </p>

      {clubLogos.length > 0 && (
        <>
          <h2 className="mt-8 mb-2 text-lg font-bold">Club badges</h2>
          <Card className="space-y-2 text-sm">
            <p>
              Badges in the trivia games are free files from Wikimedia Commons (no FC Barcelona
              crest is ever shown). Follow each link for the author and licence; the clubs own their
              trademarks.
            </p>
            <ul className="flex flex-wrap gap-x-3 gap-y-1">
              {clubLogos.map((l) => (
                <li key={l.qid}>
                  <a
                    href={commonsPage(l.logo_file)}
                    target="_blank"
                    rel="noreferrer"
                    className="underline"
                  >
                    {l.short_name ?? l.name}
                  </a>
                </li>
              ))}
            </ul>
          </Card>
        </>
      )}

      <h2 className="mt-8 mb-2 text-lg font-bold">Culé Ten facts</h2>
      <Card className="space-y-2 text-sm">
        <p>
          Culé Ten&apos;s history lists are built from facts in these Wikipedia articles (text
          licensed{" "}
          <a
            href="https://creativecommons.org/licenses/by-sa/4.0/"
            target="_blank"
            rel="noreferrer"
            className="underline"
          >
            CC BY-SA 4.0
          </a>
          ), imported once and stored:
        </p>
        <ul className="list-disc space-y-1 pl-5">
          {Object.values(HISTORY_PAGES).map((title) => (
            <li key={title}>
              <a href={articleUrl(title)} target="_blank" rel="noreferrer" className="underline">
                {title}
              </a>
            </li>
          ))}
        </ul>
        <p>
          Names, nationalities and career years come from{" "}
          <a
            href="https://www.wikidata.org/"
            target="_blank"
            rel="noreferrer"
            className="underline"
          >
            Wikidata
          </a>{" "}
          (CC0). Current-season lists use match data from Highlightly.
        </p>
      </Card>
    </>
  );
}
