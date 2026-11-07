#!/usr/bin/env python3
"""
setup_supabase.py — menyiapkan database Supabase untuk PO Tracking.

Yang dilakukan:
  1. Menjalankan supabase/schema.sql (tabel po, profiles, settings, RLS, bucket storage, realtime)
     -> butuh SUPABASE_DB_URL (connection string Postgres dari Supabase: Project Settings → Database → Connection string, mode "Session"/"Direct").
     Kalau SUPABASE_DB_URL tidak diisi, langkah ini dilewati: jalankan schema.sql manual di SQL Editor.
  2. Memastikan baris settings (target KPI, toleransi) ada.
  3. (opsional) Menjadikan ADMIN_EMAIL sebagai admin.

Variabel lingkungan (bisa lewat file .env di folder ini):
  SUPABASE_URL=https://xxxx.supabase.co
  SUPABASE_SERVICE_ROLE_KEY=eyJ...        (service role — RAHASIA, hanya dipakai di komputer Anda, jangan di browser)
  SUPABASE_DB_URL=postgresql://postgres.xxxx:PASSWORD@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres
  ADMIN_EMAIL=achmadsamudro23@gmail.com   (opsional)

Pakai:
  pip install -r requirements.txt
  python setup_supabase.py
"""
import os, sys, pathlib

try:
    from dotenv import load_dotenv
    load_dotenv(pathlib.Path(__file__).with_name(".env"))
except Exception:
    pass

URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
SRK = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
DB_URL = os.environ.get("SUPABASE_DB_URL", "")
ADMIN_EMAIL = os.environ.get("ADMIN_EMAIL", "")
SCHEMA = pathlib.Path(__file__).resolve().parents[1] / "supabase" / "schema.sql"


def run_schema():
    if not DB_URL:
        print("! SUPABASE_DB_URL kosong → lewati eksekusi schema.sql. Jalankan isi file ini di Supabase → SQL Editor:")
        print("  ", SCHEMA)
        return False
    import psycopg
    sql = SCHEMA.read_text(encoding="utf-8")
    with psycopg.connect(DB_URL, autocommit=True) as conn:
        with conn.cursor() as cur:
            cur.execute(sql)
    print("✓ schema.sql dijalankan (tabel, RLS, bucket 'dokumen', realtime)")
    return True


def ensure_settings_and_admin():
    if not (URL and SRK):
        print("! SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY kosong → lewati settings/admin")
        return
    from supabase import create_client
    sb = create_client(URL, SRK)
    sb.table("settings").upsert({"id": 1, "target_gr_h": 24, "target_inv_h": 48, "toleransi": 100}).execute()
    print("✓ settings: target GR 24 jam, target Invoice 48 jam, toleransi Rp 100 (ubah di aplikasi → Import & Setting)")
    if ADMIN_EMAIL:
        res = sb.table("profiles").update({"role": "admin"}).eq("email", ADMIN_EMAIL).execute()
        if res.data:
            print(f"✓ {ADMIN_EMAIL} dijadikan admin")
        else:
            print(f"! {ADMIN_EMAIL} belum ada di profiles — buat user-nya dulu di Authentication → Users, lalu jalankan lagi")
    # cek bucket
    try:
        buckets = [b.name if hasattr(b, "name") else b["name"] for b in sb.storage.list_buckets()]
        if "dokumen" not in buckets:
            sb.storage.create_bucket("dokumen", options={"public": False, "file_size_limit": 20971520})
            print("✓ bucket 'dokumen' dibuat")
        else:
            print("✓ bucket 'dokumen' ada")
    except Exception as e:
        print("! cek bucket gagal:", e)


if __name__ == "__main__":
    ok = run_schema()
    ensure_settings_and_admin()
    print("\nSelesai." + ("" if ok else " (ingat: jalankan schema.sql di SQL Editor dulu sebelum upload_seed.py)"))
