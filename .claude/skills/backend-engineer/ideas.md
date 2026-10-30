# Culé Ten list ideas

Status: ✅ built · 🟢 data already stored · 🟡 needs a one-time import · 🔴 hard / unreliable data

## Built (Wikipedia history, `wp:*`)

✅ All-time apps / goals · La Liga / Copa / Europe scorers · record signings & sales ·
foreign players apps & goals · Spanish scorers · Brazil / Netherlands apps · by position ·
by era (5 buckets) · captains · goals per game · most seasons as top scorer · best single
season · managers tenure & trophies · presidents tenure & trophies.

✅ La Liga (`liga:*`): all-time goals & apps, coach matches, foreign / Spanish scorers,
scorers by debut era, Real Madrid & Athletic scorers (drafts: hat-tricks, coach wins & titles,
Pichichi & Zamora counts, best Pichichi seasons, goals per game — ties for 10th).
✅ Tiki-Taka-Toe across La Liga: clubs × clubs, nations, positions, Pichichi / Zamora /
100-goal trophies, Barça decades — sets from `ttt_category_members` in one query.

## Next, from data we already have 🟢

- **La Masia graduates** with most league apps (needs a youth flag — Wikidata P54 on
  FC Barcelona Atlètic/youth teams, or a curated list).
- **Born in Catalonia** — most apps (Wikidata place of birth → Catalonia).
- **Same-surname / same-first-name lists:** "The 10 Barça players called Josep with most
  apps".
- **Players who also managed Barça** (`roles` contains player + manager) by apps.
- **Shortest-serving managers** (reverse sort, needs tie check).
- **Nationalities by count:** "The 10 countries with most Barça players" (answers =
  countries → needs a non-person answer type).
- **Decade top scorers:** top league scorer of each season grouped by decade.
- **Oldest / youngest at debut** (birth year + barca_from; coarse, check ties).
- **Current squad:** most valuable, tallest, youngest, most minutes in last 5 matches,
  most Culé XI fantasy points this season (our own data — unique to us!).

## Needs a one-time import 🟡

- Champions League final scorers / Barça European final line-ups (Wikipedia final pages).
- Ballon d'Or podiums while at Barça (Wikipedia Ballon d'Or list).
- El Clásico top scorers (Wikipedia "El Clásico" records tables).
- Pichichi winners while at Barça.
- Most trophies won as a Barça player.
- Biggest wins in club history (answers = opponents → non-person answer type).

## Avoid / caution 🔴

- Wikidata per-stint apps/goals (patchy — drafts only).
- Anything needing friendlies or unofficial matches.
- Lists where the 10th/11th are tied — `finalise()` rejects them; don't work around it.
