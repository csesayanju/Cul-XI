import { USER_AGENT, WIKIDATA_SPARQL } from "@/lib/wikidata/barca-players";

import { WIKIPEDIA_API } from "./barca-history";

/**
 * Club badges for clubs without a free Commons logo: the lead image of the club's English
 * Wikipedia article (its infobox crest), via the MediaWiki API. Only the URL is stored and the
 * image is hotlinked from upload.wikimedia.org; nothing is copied into the repo.
 */

export interface WikipediaBadge {
  url: string;
  /** The file's description page (source, licence and non-free use notes). */
  page: string;
}

/** Article lead images that are crests, not stadium or team photos. */
export function looksLikeBadge(file: string): boolean {
  const f = file.toLowerCase();
  if (/(logo|crest|badge|escudo|emblem|shield|insignia|coat[_ ]of[_ ]arms|wappen)/.test(f)) {
    return true;
  }
  // Untitled SVGs are almost always logos; photos are JPEGs.
  return f.endsWith(".svg") && !/(stadium|estadio|kit|map|location|flag)/.test(f);
}

const json = async <T>(url: string, init: RequestInit, fetchImpl: typeof fetch): Promise<T> => {
  const res = await fetchImpl(url, {
    ...init,
    headers: { "user-agent": USER_AGENT, ...(init.headers ?? {}) },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} (${new URL(url).host})`);
  return (await res.json()) as T;
};

/** English Wikipedia article titles of clubs (Wikidata sitelinks). */
async function articleTitles(qids: string[], fetchImpl: typeof fetch) {
  const out = new Map<string, string>();
  const ids = qids.filter((q) => /^Q\d+$/.test(q));
  for (let i = 0; i < ids.length; i += 300) {
    const data = await json<{
      results: { bindings: Record<string, { value: string }>[] };
    }>(
      WIKIDATA_SPARQL,
      {
        method: "POST",
        headers: {
          accept: "application/sparql-results+json",
          "content-type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          query: `SELECT ?c ?title WHERE {
            VALUES ?c { ${ids
              .slice(i, i + 300)
              .map((q) => `wd:${q}`)
              .join(" ")} }
            ?a schema:about ?c ; schema:isPartOf <https://en.wikipedia.org/> ; schema:name ?title .
          }`,
        }),
      },
      fetchImpl,
    );
    for (const b of data.results.bindings) {
      out.set(b.c!.value.split("/").pop()!, b.title!.value);
    }
  }
  return out;
}

/** Badge per club Wikidata id, where the article's lead image looks like a crest. */
export async function fetchWikipediaBadges(
  qids: string[],
  fetchImpl: typeof fetch = globalThis.fetch,
): Promise<Map<string, WikipediaBadge>> {
  const titles = await articleTitles(qids, fetchImpl);
  const byTitle = new Map([...titles].map(([q, t]) => [t, q]));
  const out = new Map<string, WikipediaBadge>();
  const all = [...byTitle.keys()];
  for (let i = 0; i < all.length; i += 50) {
    const batch = all.slice(i, i + 50);
    const params = new URLSearchParams({
      action: "query",
      format: "json",
      formatversion: "2",
      prop: "pageimages",
      piprop: "thumbnail|name",
      pithumbsize: "96",
      pilicense: "any",
      redirects: "1",
      titles: batch.join("|"),
    });
    const data = await json<{
      query?: {
        normalized?: { from: string; to: string }[];
        redirects?: { from: string; to: string }[];
        pages?: { title: string; pageimage?: string; thumbnail?: { source: string } }[];
      };
    }>(`${WIKIPEDIA_API}?${params}`, {}, fetchImpl);
    const q = data.query ?? {};
    // Map the final page title back to the title we asked for.
    const asked = new Map<string, string>(batch.map((t) => [t, t]));
    for (const n of q.normalized ?? []) asked.set(n.to, asked.get(n.from) ?? n.from);
    for (const r of q.redirects ?? []) asked.set(r.to, asked.get(r.from) ?? r.from);
    for (const p of q.pages ?? []) {
      const qid = byTitle.get(asked.get(p.title) ?? p.title);
      if (!qid || !p.pageimage || !p.thumbnail?.source || !looksLikeBadge(p.pageimage)) continue;
      out.set(qid, {
        url: p.thumbnail.source,
        page: `https://en.wikipedia.org/wiki/File:${encodeURIComponent(p.pageimage)}`,
      });
    }
  }
  return out;
}
