-- Home Inventory storage: one record table plus a private photo bucket.
-- Already applied to the TheGarden project; run this to set up a fresh Supabase project.

create table if not exists public.hi_records (
  id text primary key,
  kind text not null,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default clock_timestamp()
);
create index if not exists hi_records_updated_at_idx on public.hi_records (updated_at);
create index if not exists hi_records_kind_idx on public.hi_records (kind);

create or replace function public.hi_touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := clock_timestamp();
  return new;
end $$;

drop trigger if exists hi_records_touch on public.hi_records;
create trigger hi_records_touch before insert or update on public.hi_records
for each row execute function public.hi_touch_updated_at();

-- Only the server (service role) may touch this table; no client policies on purpose.
alter table public.hi_records enable row level security;
revoke all on public.hi_records from anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('home-inventory', 'home-inventory', false, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;
