-- Culé XI — keep guests while they use the app (cleanup only after 7 days away), and badges
-- for clubs without a free Commons logo (taken from the club's English Wikipedia article).

-- ---------------------------------------------------------------------------
-- Last seen: refreshed at most every 12 hours while signed in. Everyone starts "now", so
-- existing guests get a full 7 days.
-- ---------------------------------------------------------------------------
alter table public.profiles add column last_seen_at timestamptz not null default now();

create or replace function public.touch_last_seen() returns void
language sql security definer set search_path = '' as $$
  update public.profiles
     set last_seen_at = now()
   where id = auth.uid() and last_seen_at < now() - interval '12 hours';
$$;

revoke execute on function public.touch_last_seen() from public, anon;
grant execute on function public.touch_last_seen() to authenticated;

-- ---------------------------------------------------------------------------
-- Badges from Wikipedia: the image URL (hotlinked from upload.wikimedia.org, never copied
-- into the repo) and the file page that holds its source and licence notes.
-- ---------------------------------------------------------------------------
alter table public.trivia_clubs
  add column logo_url  text,
  add column logo_page text;
