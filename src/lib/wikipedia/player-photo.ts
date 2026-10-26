/**
 * Player photos from Wikipedia / Wikimedia Commons (free, no API key).
 *
 * Lookup = 2 requests per player:
 *  1. Wikipedia search (+ description, page image and intro) for "<name> footballer <club>".
 *  2. Commons file info for the chosen image (thumbnail URL, author, licence).
 *
 * Precision over recall: a candidate is only accepted if its description says footballer,
 * its title and its image's file name share a real name token with the player, and its intro
 * mentions the player's club. Images not hosted on Commons (i.e. non-free "fair use" files)
 * are rejected.
 */

const WIKIPEDIA_API = "https://en.wikipedia.org/w/api.php";
const COMMONS_API = "https://commons.wikimedia.org/w/api.php";
/** Wikimedia asks API clients to identify themselves. */
export const USER_AGENT = "CuleXI/1.0 (private fantasy app; https://github.com/csesayanju/Cul-XI)";
export const THUMB_SIZE = 240;

export interface WikiSearchPage {
  index?: number;
  title: string;
  description?: string;
  pageimage?: string;
  thumbnail?: { source: string };
  extract?: string;
}

export interface CommonsImageInfo {
  thumburl?: string;
  url?: string;
  descriptionurl?: string;
  extmetadata?: Record<string, { value?: string } | undefined>;
}

export interface PlayerPhoto {
  url: string;
  credit: string;
  pageUrl: string;
}

export interface PlayerLookup {
  name: string;
  fullName?: string | null;
  teamName: string;
}

/** Lower-case, strip accents and punctuation: "Cubarsí" -> "cubarsi". */
export function normalise(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Name tokens worth matching on: drops initials ("A.") and very short words. */
export function nameTokens(...names: (string | null | undefined)[]): string[] {
  const tokens = new Set<string>();
  for (const n of names) {
    for (const t of normalise(n ?? "").split(" ")) if (t.length >= 3) tokens.add(t);
  }
  return [...tokens];
}

/** Club words to look for in the article intro: "FC Barcelona" -> "barcelona". */
export function clubNeedle(teamName: string): string {
  return normalise(teamName)
    .replace(/\b(fc|cf|afc|sc|cd|ud|rcd|sd|club|de|futbol)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function searchUrl(p: PlayerLookup): string {
  const params = new URLSearchParams({
    action: "query",
    format: "json",
    formatversion: "2",
    generator: "search",
    gsrsearch: `${p.fullName || p.name} footballer ${p.teamName}`,
    gsrlimit: "5",
    prop: "pageimages|description|extracts",
    piprop: "thumbnail|name",
    pithumbsize: String(THUMB_SIZE),
    exintro: "1",
    explaintext: "1",
    exlimit: "max",
  });
  return `${WIKIPEDIA_API}?${params}`;
}

export function commonsUrl(fileName: string): string {
  const params = new URLSearchParams({
    action: "query",
    format: "json",
    formatversion: "2",
    titles: `File:${fileName}`,
    prop: "imageinfo",
    iiprop: "url|extmetadata",
    iiurlwidth: String(THUMB_SIZE),
  });
  return `${COMMONS_API}?${params}`;
}

/** Picks the first search result that is clearly this player (or null). */
export function chooseCandidate(pages: WikiSearchPage[], p: PlayerLookup): WikiSearchPage | null {
  const tokens = nameTokens(p.name, p.fullName);
  const club = clubNeedle(p.teamName);
  if (tokens.length === 0 || !club) return null;

  return (
    [...pages]
      .sort((a, b) => (a.index ?? 99) - (b.index ?? 99))
      .find((page) => {
        if (!page.pageimage) return false;
        if (!/football|soccer/i.test(page.description ?? "")) return false;
        const title = normalise(page.title.replace(/\(.*?\)/g, ""));
        if (!tokens.some((t) => title.split(" ").includes(t))) return false;
        // The lead image must be named after the player: rejects team/match/event photos
        // (e.g. a ceremony picture) that would show someone else.
        const file = normalise(page.pageimage.replace(/\.[a-z0-9]+$/i, "")).split(" ");
        if (!tokens.some((t) => file.includes(t))) return false;
        return normalise(page.extract ?? "").includes(club);
      }) ?? null
  );
}

/** Plain text from Commons' HTML metadata (author names often come wrapped in links). */
export function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Builds the photo + attribution from Commons file info; null if the file isn't free/on Commons. */
export function photoFromImageInfo(info: CommonsImageInfo | undefined): PlayerPhoto | null {
  const url = info?.thumburl ?? info?.url;
  if (!info || !url || !info.descriptionurl) return null;
  const meta = info.extmetadata ?? {};
  const license = stripHtml(meta.LicenseShortName?.value ?? "");
  if (!license || /fair use|non-free/i.test(license)) return null;
  const artist = stripHtml(meta.Artist?.value ?? "") || "Unknown author";
  return { url, credit: `${artist.slice(0, 120)} · ${license}`, pageUrl: info.descriptionurl };
}

/**
 * Looks up a player's photo. Returns null when no confident, freely licensed match exists.
 * Network errors propagate so the caller can retry later instead of recording "no photo".
 */
export async function findPlayerPhoto(
  p: PlayerLookup,
  fetchImpl: typeof fetch = globalThis.fetch,
): Promise<PlayerPhoto | null> {
  const get = async <T>(url: string): Promise<T> => {
    const res = await fetchImpl(url, {
      headers: { "user-agent": USER_AGENT, accept: "application/json" },
    });
    if (!res.ok) throw new Error(`Wikimedia HTTP ${res.status}`);
    return (await res.json()) as T;
  };

  const search = await get<{ query?: { pages?: WikiSearchPage[] } }>(searchUrl(p));
  const page = chooseCandidate(search.query?.pages ?? [], p);
  if (!page?.pageimage) return null;

  const file = await get<{
    query?: { pages?: { missing?: boolean; imageinfo?: CommonsImageInfo[] }[] };
  }>(commonsUrl(page.pageimage));
  const filePage = file.query?.pages?.[0];
  if (!filePage || filePage.missing) return null; // not on Commons => likely non-free
  return photoFromImageInfo(filePage.imageinfo?.[0]);
}
