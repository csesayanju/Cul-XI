-- Culé XI — Barça history for Culé Ten: one-time Wikipedia import, people beyond players,
-- richer hints.

-- Raw facts parsed from Wikipedia, kept so lists can be rebuilt without refetching.
create table public.trivia_sources (
  key        text primary key,            -- e.g. "wp:players", "wp:seasons"
  title      text not null,               -- Wikipedia article title
  url        text not null,
  data       jsonb not null,
  fetched_at timestamptz not null default now()
);

alter table public.trivia_sources enable row level security;
create policy "trivia_sources: admin read" on public.trivia_sources
  for select to authenticated using (public.is_admin());

-- People can be players, managers and/or presidents.
alter table public.trivia_players
  add column roles text[] not null default '{player}'
    check (roles <@ array['player', 'manager', 'president']::text[]);

-- Where a list came from, and an optional era hint per answer (e.g. "1990s").
alter table public.trivia_lists
  add column source text not null default 'admin'
    check (source in ('admin', 'auto', 'wikidata', 'wikipedia'));
alter table public.trivia_list_entries
  add column era text;

update public.trivia_lists set source = 'auto' where kind = 'auto';
update public.trivia_lists set source = 'wikidata' where auto_key like 'wd:%';
