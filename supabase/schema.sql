-- =====================================================================
-- PO Tracking & Cek Invoice — DTG × HWG  |  Supabase schema
-- Jalankan di Supabase → SQL Editor (atau otomatis via python/setup_supabase.py)
-- Aman dijalankan berulang (idempotent).
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------- profiles: nama tampilan & peran per user ----------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text,
  role text not null default 'staff' check (role in ('staff','admin')),
  created_at timestamptz not null default now()
);

-- otomatis buat profil saat user baru dibuat di Authentication
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, display_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email,'@',1)))
  on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

-- ---------- po: satu baris per PO ----------
create table if not exists public.po (
  id text primary key,                         -- = No PO (atau TMP-... bila PO belum dibuat)
  region text not null,
  supplier text,
  po_no text,
  tgl date,                                    -- tanggal baris (untuk filter periode)
  tgl_gudang date,                             -- tanggal input grup gudang / Purchase Date
  po_at timestamptz,  po_by uuid,              -- jam & petugas input PO
  gr_no text,  gr_at timestamptz,  gr_by uuid,
  inv_no text, inv_at timestamptz, inv_by uuid,
  nominal numeric(18,2),
  inv_dist text,                               -- nomor invoice distributor
  gr_return text,
  keterangan text,
  legacy boolean not null default false,       -- import Excel (tanpa jam)
  created timestamptz not null default now(),
  updated timestamptz,
  po_date date, gr_date date, inv_date date,   -- tanggal tercetak di dokumen ESB
  barang_terima date,                          -- barang diterima gudang
  inv_terima_at timestamptz,                   -- invoice distributor diterima
  tunggu_inv boolean not null default false,   -- menunggu invoice distributor
  tunggu_inv_at timestamptz, tunggu_inv_selesai timestamptz,
  cek jsonb,                                   -- hasil cek 4 dokumen (total, lampiran, status, siapa/jam)
  check_status text                            -- MATCH / SELISIH / MENUNGGU (denormalisasi dari cek)
);
create index if not exists po_region_idx on public.po(region);
create index if not exists po_tgl_idx on public.po(tgl);
create index if not exists po_created_idx on public.po(created desc);
create index if not exists po_check_idx on public.po(check_status);

-- ---------- settings ----------
create table if not exists public.settings (
  id int primary key default 1 check (id = 1),
  target_gr_h int not null default 24,
  target_inv_h int not null default 48,
  toleransi numeric(18,2) not null default 100,
  updated timestamptz
);
insert into public.settings (id) values (1) on conflict (id) do nothing;

-- ---------- RLS ----------
alter table public.profiles enable row level security;
alter table public.po enable row level security;
alter table public.settings enable row level security;

drop policy if exists "profiles read" on public.profiles;
create policy "profiles read" on public.profiles for select to authenticated using (true);
drop policy if exists "profiles self update" on public.profiles;
create policy "profiles self update" on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid() and (role = (select role from public.profiles p where p.id = auth.uid()) or public.is_admin()));
drop policy if exists "profiles self insert" on public.profiles;
create policy "profiles self insert" on public.profiles for insert to authenticated with check (id = auth.uid());

drop policy if exists "po read" on public.po;
create policy "po read" on public.po for select to authenticated using (true);
drop policy if exists "po insert" on public.po;
create policy "po insert" on public.po for insert to authenticated with check (true);
drop policy if exists "po update" on public.po;
create policy "po update" on public.po for update to authenticated using (true) with check (true);
drop policy if exists "po delete" on public.po;
create policy "po delete" on public.po for delete to authenticated using (public.is_admin() or id like 'TMP-%');

drop policy if exists "settings read" on public.settings;
create policy "settings read" on public.settings for select to authenticated using (true);
drop policy if exists "settings admin write" on public.settings;
create policy "settings admin write" on public.settings for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ---------- realtime ----------
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='po') then
    alter publication supabase_realtime add table public.po;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='settings') then
    alter publication supabase_realtime add table public.settings;
  end if;
end $$;

-- ---------- storage: bucket privat "dokumen" ----------
insert into storage.buckets (id, name, public, file_size_limit)
values ('dokumen','dokumen', false, 20971520)
on conflict (id) do update set public = false, file_size_limit = 20971520;

drop policy if exists "dokumen read" on storage.objects;
create policy "dokumen read" on storage.objects for select to authenticated using (bucket_id = 'dokumen');
drop policy if exists "dokumen upload" on storage.objects;
create policy "dokumen upload" on storage.objects for insert to authenticated with check (bucket_id = 'dokumen');
drop policy if exists "dokumen admin delete" on storage.objects;
create policy "dokumen admin delete" on storage.objects for delete to authenticated using (bucket_id = 'dokumen' and public.is_admin());

-- ---------- jadikan satu user admin (ganti emailnya) ----------
-- update public.profiles set role='admin' where email = 'achmadsamudro23@gmail.com';
