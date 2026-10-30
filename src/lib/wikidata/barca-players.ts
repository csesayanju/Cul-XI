/**
 * One-time import of every FC Barcelona player from Wikidata (free, no key) for Culé Ten:
 * names + aliases (for autocomplete), nationality (the hint), position, birth year, years at
 * the club and — where Wikidata has them — Barça league appearances/goals (used only to draft
 * lists that an admin reviews; they're patchy).
 */

export const WIKIDATA_SPARQL = "https://query.wikidata.org/sparql";
export const USER_AGENT = "CuleXI/1.0 (private fantasy app; https://github.com/csesayanju/Cul-XI)";
/** FC Barcelona (men's football club). */
export const FC_BARCELONA = "Q7156";

/**
 * England, Scotland, Wales and Northern Ireland play as separate football nations but have no
 * ISO country code of their own: use their ISO 3166-2 codes (flagcdn has their flags).
 */
const HOME_NATIONS = '(wd:Q21 "GB-ENG") (wd:Q22 "GB-SCT") (wd:Q25 "GB-WLS") (wd:Q26 "GB-NIR")';

export const BARCA_PLAYERS_QUERY = `
SELECT ?player ?playerLabel ?st ?start ?end ?apps ?goals
       (SAMPLE(?sportCc) AS ?sportCode) (SAMPLE(?sportLbl) AS ?sportCountry)
       (SAMPLE(?citCc) AS ?citizenCode) (SAMPLE(?citLbl) AS ?citizenCountry)
       (SAMPLE(?posLbl) AS ?position) (SAMPLE(?birth) AS ?born)
       (GROUP_CONCAT(DISTINCT ?alias; separator="|") AS ?aliases)
WHERE {
  ?player p:P54 ?st .
  ?st ps:P54 wd:${FC_BARCELONA} .
  ?player wdt:P106 wd:Q937857 .
  OPTIONAL { ?st pq:P580 ?start . }
  OPTIONAL { ?st pq:P582 ?end . }
  OPTIONAL { ?st pq:P1350 ?apps . }
  OPTIONAL { ?st pq:P1351 ?goals . }
  OPTIONAL {
    ?player wdt:P1532 ?sportNation .
    { ?sportNation wdt:P297 ?sportCc . } UNION { VALUES (?sportNation ?sportCc) { ${HOME_NATIONS} } }
    ?sportNation rdfs:label ?sportLbl . FILTER(LANG(?sportLbl) = "en")
  }
  OPTIONAL {
    ?player wdt:P27 ?citizenship .
    ?citizenship wdt:P297 ?citCc .
    ?citizenship rdfs:label ?citLbl . FILTER(LANG(?citLbl) = "en")
  }
  OPTIONAL { ?player wdt:P413 ?pos . ?pos rdfs:label ?posLbl . FILTER(LANG(?posLbl) = "en") }
  OPTIONAL { ?player wdt:P569 ?birth . }
  OPTIONAL { ?player skos:altLabel ?alias . FILTER(LANG(?alias) IN ("en", "es", "ca")) }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en,es,ca". }
}
GROUP BY ?player ?playerLabel ?st ?start ?end ?apps ?goals`;

type Binding = Record<string, { value: string } | undefined>;

export interface WikidataPlayer {
  wikidataId: string;
  name: string;
  aliases: string[];
  nationality: string | null;
  countryCode: string | null;
  position: string | null;
  birthYear: number | null;
  /** Wikipedia language editions with an article (a fame proxy); people queries only. */
  fame: number | null;
  barcaFrom: number | null;
  barcaTo: number | null;
  apps: number | null;
  goals: number | null;
}

/** Wikidata's formal names -> what fans say. */
const COUNTRY_NAMES: Record<string, string> = {
  "Kingdom of the Netherlands": "Netherlands",
  "People's Republic of China": "China",
  "United States of America": "United States",
};
const countryName = (n: string | undefined) => (n ? (COUNTRY_NAMES[n] ?? n) : null);

const year = (iso: string | undefined) => {
  const y = iso ? Number.parseInt(iso.slice(0, 4), 10) : NaN;
  return Number.isFinite(y) && y > 1800 && y < 2200 ? y : null;
};
const int = (v: string | undefined) => {
  const n = v == null ? NaN : Number.parseInt(v, 10);
  return Number.isFinite(n) && n >= 0 ? n : null;
};

/** Wikidata position labels -> the app's short positions (null if unknown/other). */
export function shortPosition(label: string | null): "GK" | "DEF" | "MID" | "FWD" | null {
  const l = (label ?? "").toLowerCase();
  if (!l) return null;
  if (l.includes("goalkeeper")) return "GK";
  if (/(defender|back|sweeper|libero)/.test(l)) return "DEF";
  if (/(midfielder|playmaker)/.test(l)) return "MID";
  if (/(forward|striker|winger|attacker)/.test(l)) return "FWD";
  return null;
}

/**
 * Turns SPARQL rows (one per player × Barça stint) into one record per player: stints are
 * merged (earliest start, latest end, apps/goals summed across stints), labels that are just
 * the Q-id (no English label) are skipped.
 */
export function parseBarcaPlayers(bindings: Binding[]): WikidataPlayer[] {
  type Working = WikidataPlayer & {
    stints: Set<string>;
    nationalitySource: "sport" | "citizenship" | null;
  };
  const players = new Map<string, Working>();
  for (const b of bindings) {
    const id = b.player?.value.split("/").pop();
    const name = b.playerLabel?.value?.trim();
    if (!id || !name || /^Q\d+$/.test(name)) continue;

    const p =
      players.get(id) ??
      ({
        wikidataId: id,
        name,
        aliases: [],
        nationality: null,
        countryCode: null,
        position: null,
        birthYear: null,
        fame: null,
        barcaFrom: null,
        barcaTo: null,
        apps: null,
        goals: null,
        stints: new Set<string>(),
        nationalitySource: null,
      } satisfies Working);

    // Prefer "country for sport" (Messi -> Argentina) over citizenship (he's also Spanish).
    if (b.sportCode?.value && (!p.countryCode || p.nationalitySource !== "sport")) {
      p.countryCode = b.sportCode.value.toUpperCase();
      p.nationality = countryName(b.sportCountry?.value);
      p.nationalitySource = "sport";
    } else if (!p.countryCode && b.citizenCode?.value) {
      p.countryCode = b.citizenCode.value.toUpperCase();
      p.nationality = countryName(b.citizenCountry?.value);
      p.nationalitySource = "citizenship";
    }
    p.position ??= shortPosition(b.position?.value ?? null);
    p.birthYear ??= year(b.born?.value);
    p.fame ??= int(b.sitelinks?.value);
    for (const a of (b.aliases?.value ?? "").split("|")) {
      const alias = a.trim();
      if (alias && alias !== name && !p.aliases.includes(alias)) p.aliases.push(alias);
    }

    const stint = b.st?.value ?? "";
    if (!p.stints.has(stint)) {
      p.stints.add(stint);
      const from = year(b.start?.value);
      const to = year(b.end?.value);
      if (from != null) p.barcaFrom = p.barcaFrom == null ? from : Math.min(p.barcaFrom, from);
      if (to != null) p.barcaTo = p.barcaTo == null ? to : Math.max(p.barcaTo, to);
      const apps = int(b.apps?.value);
      const goals = int(b.goals?.value);
      if (apps != null) p.apps = (p.apps ?? 0) + apps;
      if (goals != null) p.goals = (p.goals ?? 0) + goals;
    }
    players.set(id, p);
  }
  return [...players.values()].map(({ stints: _s, nationalitySource: _n, ...p }) => ({
    ...p,
    aliases: p.aliases.slice(0, 8),
  }));
}

/** Runs the query (one request). */
export async function fetchBarcaPlayers(fetchImpl: typeof fetch = globalThis.fetch) {
  const res = await fetchImpl(
    `${WIKIDATA_SPARQL}?format=json&query=${encodeURIComponent(BARCA_PLAYERS_QUERY)}`,
    {
      headers: { "user-agent": USER_AGENT, accept: "application/sparql-results+json" },
    },
  );
  if (!res.ok) throw new Error(`Wikidata HTTP ${res.status}`);
  const json = (await res.json()) as { results?: { bindings?: Binding[] } };
  return refineHomeNations(parseBarcaPlayers(json.results?.bindings ?? []), fetchImpl);
}

/** Same fields for given people (managers, presidents, players missing a Barça stint). */
export const peopleQuery = (ids: string[]) => `
SELECT ?player ?playerLabel
       (SAMPLE(?sportCc) AS ?sportCode) (SAMPLE(?sportLbl) AS ?sportCountry)
       (SAMPLE(?citCc) AS ?citizenCode) (SAMPLE(?citLbl) AS ?citizenCountry)
       (SAMPLE(?posLbl) AS ?position) (SAMPLE(?birth) AS ?born)
       (SAMPLE(?links) AS ?sitelinks)
       (GROUP_CONCAT(DISTINCT ?alias; separator="|") AS ?aliases)
WHERE {
  VALUES ?player { ${ids.map((id) => `wd:${id}`).join(" ")} }
  OPTIONAL {
    ?player wdt:P1532 ?sportNation .
    { ?sportNation wdt:P297 ?sportCc . } UNION { VALUES (?sportNation ?sportCc) { ${HOME_NATIONS} } }
    ?sportNation rdfs:label ?sportLbl . FILTER(LANG(?sportLbl) = "en")
  }
  OPTIONAL {
    ?player wdt:P27 ?citizenship .
    ?citizenship wdt:P297 ?citCc .
    ?citizenship rdfs:label ?citLbl . FILTER(LANG(?citLbl) = "en")
  }
  OPTIONAL { ?player wdt:P413 ?pos . ?pos rdfs:label ?posLbl . FILTER(LANG(?posLbl) = "en") }
  OPTIONAL { ?player wdt:P569 ?birth . }
  OPTIONAL { ?player wikibase:sitelinks ?links . }
  OPTIONAL { ?player skos:altLabel ?alias . FILTER(LANG(?alias) IN ("en", "es", "ca")) }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en,es,ca". }
}
GROUP BY ?player ?playerLabel`;

/** Looks up people by Wikidata id (`batch` per request). */
export async function fetchPeople(
  ids: string[],
  fetchImpl: typeof fetch = globalThis.fetch,
  batch = 100,
) {
  const out: WikidataPlayer[] = [];
  const valid = [...new Set(ids)].filter((id) => /^Q\d+$/.test(id));
  for (let i = 0; i < valid.length; i += batch) {
    const res = await fetchImpl(WIKIDATA_SPARQL, {
      method: "POST",
      headers: {
        "user-agent": USER_AGENT,
        accept: "application/sparql-results+json",
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ query: peopleQuery(valid.slice(i, i + batch)) }),
    });
    if (!res.ok) throw new Error(`Wikidata HTTP ${res.status}`);
    const json = (await res.json()) as { results?: { bindings?: Binding[] } };
    out.push(...parseBarcaPlayers(json.results?.bindings ?? []));
  }
  return refineHomeNations(out, fetchImpl);
}

/** Every other club (association football clubs only) that Barça players played for. */
export const PLAYER_CLUBS_QUERY = `
SELECT ?player ?club ?clubLabel WHERE {
  ?player p:P54/ps:P54 wd:${FC_BARCELONA} ; wdt:P106 wd:Q937857 .
  ?player wdt:P54 ?club .
  FILTER(?club != wd:${FC_BARCELONA})
  ?club wdt:P31 wd:Q476028 .
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}`;

export interface PlayerClub {
  playerId: string;
  clubId: string;
  clubName: string;
}

export function parsePlayerClubs(bindings: Binding[]): PlayerClub[] {
  const seen = new Set<string>();
  const out: PlayerClub[] = [];
  for (const b of bindings) {
    const playerId = b.player?.value.split("/").pop();
    const clubId = b.club?.value.split("/").pop();
    const clubName = b.clubLabel?.value?.trim();
    if (!playerId || !clubId || !clubName || /^Q\d+$/.test(clubName)) continue;
    // Barça's own reserve and youth sides aren't "other clubs".
    if (/^FC Barcelona\b/.test(clubName)) continue;
    const key = `${playerId}:${clubId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ playerId, clubId, clubName });
  }
  return out;
}

/** Runs the clubs query (one request, a few seconds). */
export async function fetchPlayerClubs(fetchImpl: typeof fetch = globalThis.fetch) {
  const res = await fetchImpl(WIKIDATA_SPARQL, {
    method: "POST",
    headers: {
      "user-agent": USER_AGENT,
      accept: "application/sparql-results+json",
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ query: PLAYER_CLUBS_QUERY }),
  });
  if (!res.ok) throw new Error(`Wikidata HTTP ${res.status}`);
  const json = (await res.json()) as { results?: { bindings?: Binding[] } };
  return parsePlayerClubs(json.results?.bindings ?? []);
}

/** Everyone who played for a club (all P54 statements, not just the preferred ones). */
export async function fetchClubMembers(clubId: string, fetchImpl: typeof fetch = globalThis.fetch) {
  if (!/^Q\d+$/.test(clubId)) return [];
  const query = `SELECT DISTINCT ?player WHERE {
    ?player p:P54/ps:P54 wd:${clubId} ; wdt:P106 wd:Q937857 .
  }`;
  const res = await fetchImpl(WIKIDATA_SPARQL, {
    method: "POST",
    headers: {
      "user-agent": USER_AGENT,
      accept: "application/sparql-results+json",
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ query }),
  });
  if (!res.ok) throw new Error(`Wikidata HTTP ${res.status} (${clubId})`);
  const json = (await res.json()) as { results?: { bindings?: Binding[] } };
  return (json.results?.bindings ?? []).flatMap((b) => {
    const id = b.player?.value.split("/").pop();
    return id && /^Q\d+$/.test(id) ? [id] : [];
  });
}

const HOME_NATION_NAMES: Record<string, string> = {
  "GB-ENG": "England",
  "GB-SCT": "Scotland",
  "GB-WLS": "Wales",
  "GB-NIR": "Northern Ireland",
};

/**
 * UK players without a "country for sport" come back as United Kingdom (GB); give them the
 * home nation they were born in instead. A separate, small query (walking up from birthplaces
 * is too heavy for the main ones), in the written order (optimizer off) so it stays fast.
 */
export async function refineHomeNations<
  T extends Pick<WikidataPlayer, "wikidataId" | "countryCode" | "nationality">,
>(players: T[], fetchImpl: typeof fetch = globalThis.fetch): Promise<T[]> {
  const uk = players.filter((p) => p.countryCode === "GB");
  for (let i = 0; i < uk.length; i += 50) {
    const batch = uk.slice(i, i + 50);
    const query = `SELECT ?player ?code WHERE {
      hint:Query hint:optimizer "None" .
      VALUES ?player { ${batch.map((p) => `wd:${p.wikidataId}`).join(" ")} }
      ?player wdt:P19 ?birth .
      ?birth wdt:P131* ?home .
      VALUES (?home ?code) { ${HOME_NATIONS} }
    }`;
    const res = await fetchImpl(WIKIDATA_SPARQL, {
      method: "POST",
      headers: {
        "user-agent": USER_AGENT,
        accept: "application/sparql-results+json",
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ query }),
    });
    if (!res.ok) continue; // keep United Kingdom rather than fail an import
    const json = (await res.json()) as { results?: { bindings?: Binding[] } };
    const codes = new Map(
      (json.results?.bindings ?? []).map((b) => [b.player!.value.split("/").pop()!, b.code!.value]),
    );
    for (const p of batch) {
      const code = codes.get(p.wikidataId);
      if (code) {
        p.countryCode = code;
        p.nationality = HOME_NATION_NAMES[code] ?? p.nationality;
      }
    }
  }
  return players;
}
