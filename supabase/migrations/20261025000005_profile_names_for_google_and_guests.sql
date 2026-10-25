-- Culé XI — better default display names for Google and guest (anonymous) users.
-- Order: explicit display_name > Google full name / name > email prefix > "Guest culé".
-- Users can change it on /join.

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    left(coalesce(nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''),
                  nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
                  nullif(trim(new.raw_user_meta_data ->> 'name'), ''),
                  nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
                  'Guest culé'), 40)
  );
  return new;
end;
$$;
