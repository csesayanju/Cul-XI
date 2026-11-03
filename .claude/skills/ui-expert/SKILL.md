---
name: ui-expert
description: Gen Z / Gen Alpha UI expert for Culé XI — bold, playful, "slikk" visual design (bento grids, chunky display type, glass, glow, stickers, micro-interactions, confetti) on top of the Blaugrana brand. Use for any visual revamp, new screen, hero/landing, celebration moment, or when something "looks boring / old / basic".
---

# Culé XI UI expert (Gen Z / Gen Alpha)

The audience grew up on TikTok, BeReal, Duolingo, Spotify Wrapped and FC Ultimate Team. They
judge an app in one scroll. The bar: **it feels like a game, not a form** — loud where it
matters, calm everywhere else, instant feedback on every tap, and moments worth a screenshot.

Works with the `frontend-engineer` skill (stack, performance, accessibility rules) — this one
owns the _look and feel_.

## Non-negotiables

- **No FC Barcelona crest, logos or kit images.** The "Culé XI" wordmark and our own XI mark
  are the brand. Club badges only as already wired (free Commons / linked Wikipedia files).
- Light **and** dark must both look intentional (dark is the hero; light is clean, not grey).
- Contrast ≥ 4.5:1 for text, visible focus rings, `prefers-reduced-motion` respected.
- 375px first; desktop gets more room, never a stretched phone.
- No heavy libraries for flair: CSS animations, small inline SVGs, no Lottie/framer for this.

## The language

1. **Chunky display type.** Headlines in the display face (`font-display`, Bricolage
   Grotesque), black weight, tight tracking, big (`text-4xl`+ on heroes). Numbers are heroes:
   `tabular`, black, oversized. Body stays the system face for speed and legibility.
2. **Bento grids.** Home and hubs are tiles of different sizes (`Tile` in `ui.tsx`): one big
   hero tile, smaller stat tiles. Every tile is tappable and says one thing.
3. **Glass + glow, used sparingly.** Translucent surfaces with blur for chrome (header, dock,
   sheets); a soft coloured glow behind the one focal element per screen. Never glow
   everything.
4. **Brand gradients, turned up.** Blaugrana → garnet with a gold spark. Neon-ish accents
   (`--color-volt` lime for "live/new", gold for wins). Gradient borders on hero tiles.
5. **Stickers & emoji.** Small rotated chips ("🔥 3-day streak", "NEW", "LIVE") that feel
   stuck on. One or two per screen, not confetti everywhere.
6. **Pill everything.** Buttons, tabs, chips are full pills with a chunky press (`active`
   scale + shadow drop). The bottom nav is a floating glass dock.
7. **Celebrate.** Wins get confetti (`<Confetti />`), a big score and a share-worthy line.
   Losses get a kind, funny line — never a scold.
8. **Copy is short and alive.** "You're cooking 🔥", "Locked in", "So close!", "W". Plain
   words, no corporate tone, no cringe overload (max one slang word per screen).
9. **Motion = feedback.** 150–250 ms ease-out on tap; `animate-pop` on wins, `animate-shake`
   on misses, `animate-rise` for new content; stagger lists slightly. Nothing loops except
   LIVE pulses.

## Tokens & pieces (extend, don't fork)

- `globals.css`: `--color-volt`, `font-display`, `.glass`, `.glow`, `.gradient-border`,
  `animate-float`, `animate-confetti`.
- `ui.tsx`: `Tile` (bento tile), `Sticker` (rotated chip), `Button` (pill, chunky press),
  `PageTitle` (display face), `SectionTitle`.
- `components/confetti.tsx`: CSS confetti burst for wins.
- `components/app-nav.tsx`: floating glass dock (mobile), pill nav (desktop).

## Workflow

1. Screenshot the current screen at 375px and desktop, light and dark.
2. Find the one focal element; make it loud (display type, glow, gradient). Calm the rest.
3. Upgrade shared primitives first, then the screen.
4. Add one moment: a sticker, a celebration, a playful empty state.
5. Re-screenshot the same four views; check contrast and reduced motion.
6. `pnpm format && pnpm typecheck && pnpm lint && pnpm test && pnpm build`, then ship.
