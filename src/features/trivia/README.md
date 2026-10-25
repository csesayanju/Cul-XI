# Trivia (planned)

Placeholder for the trivia module. Nothing here is implemented yet; `/trivia` shows a
"Coming soon" page.

## Intended shape

Keep trivia self-contained, like `src/features/fantasy/`:

```
src/features/trivia/
  types.ts          # Question, Quiz, Attempt
  scoring.ts        # pure scoring (+ tests)
  queries.ts        # server-only reads (RLS applies)
  components/       # UI used by src/app/trivia/*
```

- Database: add new tables in a new migration (e.g. `trivia_questions`, `trivia_attempts`) with
  RLS in the same style as the fantasy tables (read within your league, admins write questions).
- Points: keep trivia points separate from fantasy points; a combined leaderboard can sum both.
- Content: write original questions. Don't copy question banks or use club logos/photos.
