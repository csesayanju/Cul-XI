# Contributing to Culé XI

Thanks for helping out! This is a small private project, so the process is light.

## Workflow

1. Branch off `main` (`feat/team-builder-filters`, `fix/lineup-sync`, …).
2. Make small, focused commits using [Conventional Commits](https://www.conventionalcommits.org/):
   `feat:`, `fix:`, `chore:`, `test:`, `docs:`, `refactor:`, `ci:`.
3. Before pushing, make sure these pass (CI runs the same checks):

   ```bash
   pnpm lint && pnpm format:check && pnpm typecheck && pnpm test
   ```

4. Open a pull request with a short description of what changed and why.

## Ground rules

- **Never commit secrets.** Only `.env.example` (placeholders) is tracked. Real keys live in
  `.env.local` (git-ignored) or in Vercel/Supabase settings.
- **Respect the API budget.** All API-Football calls go through
  `src/lib/api-football/client.ts`, which caches responses in the database. Don't add polling or
  call the API from the browser. Tests must use the mock JSON in `__fixtures__/`, never the real API.
- **Schema changes = new migration.** Add a new file in `supabase/migrations/` and keep RLS on
  every table. Extend `src/test/db/schema.test.ts` when you change policies.
- **Scoring changes** go in `src/features/fantasy/scoring/rules.ts` and need tests (and an
  update to the README scoring table).
- **No club IP.** Don't add the FC Barcelona crest, logos, kits or player photos. Names and
  initials only.
- Organise code by feature under `src/features/<feature>/`.
