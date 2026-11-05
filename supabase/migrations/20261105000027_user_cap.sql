-- Seat limit: no new accounts (email, Google or guest) once the app holds `max_users`.
-- Enforced in the database, so every sign-up path is covered. Existing users still sign in.
-- Idle guests are deleted after 7 days by the cleanup job, which frees their seats.
-- Change the limit with: update public.app_limits set max_users = 150;

create table public.app_limits (
  id         boolean primary key default true check (id),
  max_users  integer not null default 100 check (max_users > 0),
  updated_at timestamptz not null default now()
);
insert into public.app_limits default values;

-- Server-only: RLS on, no policies (the service role and the trigger below bypass it).
alter table public.app_limits enable row level security;
revoke all on public.app_limits from anon, authenticated;

create function public.enforce_user_cap() returns trigger
  language plpgsql security definer set search_path = ''
as $$
declare
  cap  integer;
  used integer;
begin
  -- Two sign-ups at once: the lock makes them count one after the other.
  perform pg_advisory_xact_lock(hashtext('culexi:user-cap'));
  select max_users into cap from public.app_limits where id;
  select count(*) into used from auth.users;
  if cap is not null and used >= cap then
    raise exception 'CULEXI_FULL: all % seats are taken', cap using errcode = 'P0001';
  end if;
  return new;
end;
$$;

revoke execute on function public.enforce_user_cap() from public, anon, authenticated;

create trigger enforce_user_cap
  before insert on auth.users
  for each row execute function public.enforce_user_cap();
