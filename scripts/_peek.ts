import { fetchArticleHtml } from "../src/lib/wikipedia/barca-history";
import {
  DATA_PAGES,
  parseBarcaSeasons,
  parseClasicos,
  parseLigaChampions,
} from "../src/lib/wikipedia/history-data";
const b = parseBarcaSeasons(await fetchArticleHtml(DATA_PAGES.barcaSeasons));
const l = parseLigaChampions(await fetchArticleHtml(DATA_PAGES.ligaChampions));
const c = parseClasicos(await fetchArticleHtml(DATA_PAGES.clasicos));
console.log(
  "barca",
  b.length,
  JSON.stringify(b[0]),
  "\n",
  JSON.stringify(b.find((s) => s.startYear === 2008)),
  "\n",
  JSON.stringify(b.at(-1)),
);
console.log("copa values", [...new Set(b.map((s) => s.copa))].join(" / "));
console.log("europe values", [...new Set(b.map((s) => s.europe?.result))].join(" / "));
console.log("liga", l.length, JSON.stringify(l[0]), "\n", JSON.stringify(l.at(-1)));
const by: Record<string, number> = {};
for (const x of c) by[x.competition] = (by[x.competition] ?? 0) + 1;
console.log(
  "clasicos",
  c.length,
  by,
  "\n",
  JSON.stringify(c[0]),
  "\n",
  JSON.stringify(c.find((x) => x.competition === "Copa del Rey" && x.note)),
);
