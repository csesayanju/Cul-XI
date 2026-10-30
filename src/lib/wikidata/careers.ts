import type { Spell } from "@/features/career/career";

import { USER_AGENT, WIKIDATA_SPARQL } from "./barca-players";

/**
 * Club careers (Wikidata P54 "member of sports team" with start/end years) and club logos
 * (P154, always a file on Wikimedia Commons, so free to reuse with credit).
 */

type Binding = Record<string, { value: string } | undefined>;

/** Wikidata's query service rate-limits bulk use: on 429/5xx wait (Retry-After) and retry. */
async function sparql(query: string, fetchImpl: typeof fetch, tries = 6): Promise<Binding[]> {
  let res: Response;
  for (let attempt = 1; ; attempt++) {
    res = await fetchImpl(WIKIDATA_SPARQL, {
      method: "POST",
      headers: {
        "user-agent": USER_AGENT,
        accept: "application/sparql-results+json",
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ query }),
    });
    if (res.ok || attempt >= tries || !(res.status === 429 || res.status >= 500)) break;
    const wait = Number(res.headers.get("retry-after")) || 5 * attempt;
    await new Promise((r) => setTimeout(r, Math.min(wait, 60) * 1000));
  }
  if (!res.ok) throw new Error(`Wikidata HTTP ${res.status}`);
  const json = (await res.json()) as { results?: { bindings?: Binding[] } };
  return json.results?.bindings ?? [];
}

const qid = (uri: string | undefined) => uri?.split("/").pop() ?? "";
const valid = (ids: string[]) => ids.filter((id) => /^Q\d+$/.test(id));
const year = (iso: string | undefined) => {
  const y = iso ? Number.parseInt(iso.slice(0, 4), 10) : NaN;
  return Number.isFinite(y) && y > 1850 && y < 2200 ? y : null;
};

/** Every team spell for the given players (unordered; normalise with normaliseCareer). */
export async function fetchCareers(
  playerIds: string[],
  fetchImpl: typeof fetch = globalThis.fetch,
): Promise<Map<string, Spell[]>> {
  const ids = valid(playerIds);
  const out = new Map<string, Spell[]>();
  if (ids.length === 0) return out;
  const rows = await sparql(
    `SELECT ?p ?club ?clubLabel ?start ?end WHERE {
      VALUES ?p { ${ids.map((id) => `wd:${id}`).join(" ")} }
      ?p p:P54 ?st . ?st ps:P54 ?club .
      OPTIONAL { ?st pq:P580 ?start . }
      OPTIONAL { ?st pq:P582 ?end . }
      SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
    }`,
    fetchImpl,
  );
  for (const r of rows) {
    const p = qid(r.p?.value);
    const clubId = qid(r.club?.value);
    const clubName = r.clubLabel?.value?.trim() ?? "";
    if (!p || !clubId || !clubName || /^Q\d+$/.test(clubName)) continue;
    const list = out.get(p) ?? [];
    list.push({ clubId, clubName, from: year(r.start?.value), to: year(r.end?.value) });
    out.set(p, list);
  }
  return out;
}

/** Commons file name of each club's logo, where Wikidata has one. */
export async function fetchClubLogos(
  clubIds: string[],
  fetchImpl: typeof fetch = globalThis.fetch,
): Promise<Map<string, string>> {
  const ids = valid(clubIds);
  const out = new Map<string, string>();
  if (ids.length === 0) return out;
  const rows = await sparql(
    `SELECT ?c ?logo WHERE { VALUES ?c { ${ids.map((id) => `wd:${id}`).join(" ")} } ?c wdt:P154 ?logo . }`,
    fetchImpl,
  );
  for (const r of rows) {
    const file = decodeURIComponent(r.logo?.value.split("/").pop() ?? "");
    if (file && !out.has(qid(r.c?.value))) out.set(qid(r.c?.value), file);
  }
  return out;
}

/** A small rendering of a Commons file (Special:FilePath redirects to the thumbnail). */
export const commonsThumb = (file: string, width = 64) =>
  `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(file)}?width=${width}`;

/** The file's page on Commons (author and licence). */
export const commonsPage = (file: string) =>
  `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(file.replace(/ /g, "_"))}`;
