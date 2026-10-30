-- Culé XI — streamlined sign-in: everyone plays in a Global league from the first second
-- (invite codes now add a private league on top), every name is unique, and guests get an
-- automatic football name.

-- ---------------------------------------------------------------------------
-- Global league
-- ---------------------------------------------------------------------------
alter table public.leagues add column is_global boolean not null default false;
create unique index leagues_one_global_idx on public.leagues (is_global) where is_global;

insert into public.leagues (name, invite_code, is_global)
select 'Global', 'global', true
where not exists (select 1 from public.leagues where is_global);

-- ---------------------------------------------------------------------------
-- Unique display names
-- ---------------------------------------------------------------------------

/** A football-flavoured guest name, e.g. "Tiki Kubala 27". */
create or replace function public.random_guest_name() returns text
language sql volatile set search_path = '' as $$
  select (array['Tiki', 'Taka', 'Rondo', 'Falso', 'Blaugrana', 'Culé', 'Masia', 'Camp Nou',
                'Golden', 'Rapid', 'Clever', 'Flying', 'Silky', 'Lucky', 'Brave', 'Cosmic'])
           [1 + floor(random() * 16)::int]
      || ' '
      || (array['Kubala', 'Cruyff', 'Xavi', 'Iniesta', 'Puyol', 'Messi', 'Pedri', 'Gavi',
                'Yamal', 'Ronaldinho', 'Romário', 'Stoichkov', 'Koeman', 'Rivaldo', 'Eto''o',
                'Busquets', 'Valdés', 'Laudrup', 'Samitier', 'Suárez', 'Neymar', 'Raphinha',
                'Cubarsí', 'Lewandowski'])
           [1 + floor(random() * 24)::int]
      || ' '
      || (10 + floor(random() * 90)::int)::text
$$;

/** `base`, or "base 2", "base 3"… — the first one nobody else uses (case-insensitive). */
create or replace function public.unique_display_name(base text, p_user uuid default null)
returns text
language plpgsql stable set search_path = '' as $$
declare
  candidate text := left(trim(base), 40);
  n int := 1;
begin
  if candidate is null or candidate = '' then
    candidate := 'Culé';
  end if;
  while exists (
    select 1 from public.profiles
     where lower(display_name) = lower(candidate) and id is distinct from p_user
  ) loop
    n := n + 1;
    candidate := left(trim(base), 40 - length(n::text) - 1) || ' ' || n;
  end loop;
  return candidate;
end;
$$;

-- Rename today's duplicates (the oldest keeps the name; guests get a generated one).
do $$
declare
  r record;
begin
  for r in
    select p.id, p.display_name, u.is_anonymous
      from public.profiles p
      left join auth.users u on u.id = p.id
     where exists (
       select 1 from public.profiles q
        where lower(q.display_name) = lower(p.display_name)
          and (q.created_at, q.id) < (p.created_at, p.id)
     )
     order by p.created_at
  loop
    update public.profiles
       set display_name = public.unique_display_name(
             case when coalesce(r.is_anonymous, false) then public.random_guest_name()
                  else r.display_name end, r.id)
     where id = r.id;
  end loop;
end;
$$;

create unique index profiles_display_name_key on public.profiles (lower(display_name));

-- ---------------------------------------------------------------------------
-- New users: a unique name (generated for guests) and a seat in the Global league.
-- Order for real users: display_name > Google full name / name > email prefix.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_name text;
begin
  if coalesce(new.is_anonymous, false) then
    v_name := public.unique_display_name(public.random_guest_name());
  else
    v_name := public.unique_display_name(
      coalesce(nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''),
               nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
               nullif(trim(new.raw_user_meta_data ->> 'name'), ''),
               nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
               public.random_guest_name()));
  end if;

  insert into public.profiles (id, display_name) values (new.id, v_name);
  insert into public.league_members (league_id, user_id)
  select l.id, new.id from public.leagues l where l.is_global
  on conflict do nothing;
  return new;
end;
$$;

-- Everyone already signed up joins the Global league too.
insert into public.league_members (league_id, user_id)
select l.id, p.id from public.leagues l cross join public.profiles p where l.is_global
on conflict do nothing;

-- Leaving a private league is allowed; leaving Global isn't (it's where everyone plays).
create or replace function public.leave_league(p_league uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  delete from public.league_members m
   using public.leagues l
   where m.league_id = p_league and m.user_id = auth.uid()
     and l.id = m.league_id and not l.is_global;
end;
$$;

revoke execute on function public.leave_league(uuid) from public, anon;
grant execute on function public.leave_league(uuid) to authenticated;
