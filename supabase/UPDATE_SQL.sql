-- Jalankan di Supabase → SQL Editor (cukup sekali, aman diulang).
-- Menambah dua kolom untuk 1 invoice dengan lebih dari satu PO/GR (barang susulan),
-- lalu mengisinya dari data lama.

alter table public.po add column if not exists po_nos jsonb not null default '[]'::jsonb;
alter table public.po add column if not exists gr_nos jsonb not null default '[]'::jsonb;

update public.po set po_nos = to_jsonb(array[po_no])
  where po_nos = '[]'::jsonb and po_no is not null and po_no <> '';
update public.po set gr_nos = to_jsonb(array[gr_no])
  where gr_nos = '[]'::jsonb and gr_no is not null and gr_no <> '';
