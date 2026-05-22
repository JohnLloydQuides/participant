create table if not exists public.participants (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  age integer not null,
  gender text not null,
  email text not null,
  contact text not null,
  address text not null,
  batch text not null,
  batch_name text not null,
  event text not null,
  photo_data text,
  created_at timestamptz not null default now()
);

alter table public.participants enable row level security;

grant usage on schema public to anon;
grant select, insert, delete on table public.participants to anon;

drop policy if exists "Public can read participants" on public.participants;
create policy "Public can read participants"
on public.participants
for select
to anon
using (true);

drop policy if exists "Public can add participants" on public.participants;
create policy "Public can add participants"
on public.participants
for insert
to anon
with check (true);

drop policy if exists "Public can delete participants" on public.participants;
create policy "Public can delete participants"
on public.participants
for delete
to anon
using (true);
