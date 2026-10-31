-- Culé XI — points update live during a match (provisional until full time).
alter table public.matches add column points_live boolean not null default false;
comment on column public.matches.points_live is
  'True while points come from in-play stats; set false by the final full-time sync.';
