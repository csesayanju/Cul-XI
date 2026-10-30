import { parse, type HTMLElement } from "node-html-parser";

import { personIn, text, type PersonRef } from "./barca-history";

/**
 * European club finals from Wikipedia: which finals involved a Spanish club (from the list
 * articles) and each final's starting line-ups (the "football box" tables: position, shirt
 * number, linked name; substitutes follow a "Substitutes:" row).
 */

export const FINALS_LISTS = [
  { title: "List of European Cup and UEFA Champions League finals", competition: "European Cup" },
  { title: "List of UEFA Cup and Europa League finals", competition: "UEFA Cup" },
  { title: "List of UEFA Cup Winners' Cup finals", competition: "Cup Winners' Cup" },
] as const;

export interface FinalRef {
  title: string;
  year: number;
  competition: string;
}

/** Finals with a Spanish club on either side ("Spain" in the row's country cells). */
export function parseFinalsList(html: string, competition: string): FinalRef[] {
  const out = new Map<string, FinalRef>();
  for (const table of parse(html).querySelectorAll("table.wikitable")) {
    for (const tr of table.querySelectorAll("tr")) {
      // The country cells read "Spain" (linking to the Spanish federation).
      if (!/\bSpain\b/.test(tr.text)) continue;
      const links = tr.querySelectorAll("a");
      const final = links
        .map((a) => a.getAttribute("title") ?? "")
        .find((t) => /^\d{4}(–\d{2,4})? .*\bfinal$/i.test(t) && !/page does not exist/.test(t));
      if (!final) continue;
      const year = Number(final.match(/^\d{4}/)![0]);
      out.set(final, { title: final, year, competition });
    }
  }
  return [...out.values()].sort((a, b) => a.year - b.year);
}

export interface LineupPlayer {
  pos: string;
  number: number | null;
  person: PersonRef;
  captain: boolean;
}

const POSITION =
  /^(GK|SW|RB|CB|LB|RWB|LWB|DF|DM|CM|RM|LM|MF|AM|RW|LW|SS|RF|LF|CF|ST|FW|IF|OF|OR|OL|IR|IL|CH|RH|LH|WH|FB)$/;

/** Both teams' starting XIs, in page order (empty if the page has no football boxes). */
export function parseLineups(html: string): LineupPlayer[][] {
  const sides: LineupPlayer[][] = [];
  for (const table of parse(html).querySelectorAll("table")) {
    if (table.querySelector("table")) continue; // only the innermost tables
    const xi: LineupPlayer[] = [];
    for (const tr of table.querySelectorAll("tr")) {
      const cells = tr.querySelectorAll("td, th") as HTMLElement[];
      const first = text(cells[0]);
      if (/^Substitutes/i.test(first) || /Substitutes:/i.test(tr.text)) break;
      if (!POSITION.test(first) || cells.length < 3) continue;
      const person = personIn(cells[2]);
      if (!person) continue;
      xi.push({
        pos: first,
        number: Number.parseInt(text(cells[1]), 10) || null,
        person,
        captain: /\(c\)/i.test(cells[2]!.text),
      });
    }
    if (xi.length === 11 && xi[0]!.pos === "GK") sides.push(xi);
  }
  return sides;
}
