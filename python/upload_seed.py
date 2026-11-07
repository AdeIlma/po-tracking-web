#!/usr/bin/env python3
"""
upload_seed.py — mengunggah data tracking lama (Excel PR_TRACKING_LIST_WAREHOUSE) ke tabel `po` di Supabase.

  python upload_seed.py ../data/PR_TRACKING_LIST_WAREHOUSE_2026.xlsx --from 2026-11-01
  python upload_seed.py file.xlsx --from 2026-11-01 --dry-run      # hanya tampilkan ringkasan, tidak mengunggah
  python upload_seed.py file.xlsx --from 2026-11-01 --overwrite    # timpa baris yang sudah ada (default: lewati)

Format Excel: satu sheet per region (BALI, YOGYAKARTA, JATIM, JATENG, JELUPANG), baris 1 = header:
  Tanggal Input Sytem | Tanggal Input Grup Gudang | Supplier | No. PO | No. GR | ... | No. Invoice | Keterangan | (Nomor Inv Distirb)
Baris hasil import ditandai legacy=true dan TIDAK punya jam (po_at/gr_at/inv_at kosong) — hanya tanggal.

Env (atau .env): SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
"""
import os, re, sys, json, argparse, pathlib, datetime as dt

try:
    from dotenv import load_dotenv
    load_dotenv(pathlib.Path(__file__).with_name(".env"))
except Exception:
    pass

REGIONS = ["BALI", "YOGYAKARTA", "JATENG", "JATIM", "JELUPANG"]
TZ = dt.timezone(dt.timedelta(hours=7))


def s(v):
    if v is None:
        return ""
    if isinstance(v, float) and v.is_integer():
        v = int(v)
    return str(v).strip()


def d(v):
    return v.strftime("%Y-%m-%d") if hasattr(v, "year") else ""


def num(v):
    if isinstance(v, (int, float)):
        return float(v)
    t = s(v)
    if re.fullmatch(r"[\d.]+,\d{1,2}", t):
        return float(t.replace(".", "").replace(",", "."))
    t2 = t.replace(".", "").replace(",", "")
    return float(t2) if re.fullmatch(r"\d+", t2) else None


def doc_id(po):
    return re.sub(r"[^A-Za-z0-9_\-.:@+~]", "_", po)


def extract(path, date_from, date_to=None):
    import openpyxl
    wb = openpyxl.load_workbook(path, data_only=True)
    rows, seen = [], set()
    for ws in wb.worksheets:
        region = next((r for r in REGIONS if r in ws.title.upper()), None)
        if not region:
            print(f"  - sheet '{ws.title}' dilewati (bukan region)")
            continue
        hdr = [s(c.value) for c in ws[1]]
        def ix(prefix):
            for i, h in enumerate(hdr):
                if h.lower().startswith(prefix):
                    return i
            return None
        i_inv, i_ret, i_ket, i_dist = ix("no. invoice"), ix("no. gr return"), ix("keterangan"), ix("nomor inv")
        i_cat = ix("catatan") if ix("catatan") is not None else ix("note")
        n = 0
        for r in ws.iter_rows(min_row=2, values_only=True):
            po = s(r[4]).upper()
            if not po.startswith("PO"):
                continue
            tgl = d(r[1]) or d(r[2])
            if not tgl:
                m = re.search(r"(\d{4})(\d{2})(\d{2})", po)
                tgl = f"{m[1]}-{m[2]}-{m[3]}" if m else ""
            if not tgl or tgl < date_from or (date_to and tgl > date_to):
                continue
            ket = [x for x in [s(r[i_ket]) if i_ket is not None else "", s(r[i_cat]) if i_cat is not None else ""] if x]
            nominal = None
            if ket and num(ket[0]) is not None and re.fullmatch(r"[\d.,]+", ket[0]):
                nominal = num(ket[0]); ket = ket[1:]
            gr = s(r[5]).upper(); inv = s(r[i_inv]).upper() if i_inv is not None else ""
            if gr and not gr.startswith("GR"):
                ket.append("GR: " + gr); gr = ""
            if inv and not re.match(r"^V[I1]", inv):
                ket.append("INV: " + inv); inv = ""
            _id = doc_id(po)
            if _id in seen:
                continue
            seen.add(_id)
            created = dt.datetime.fromisoformat(tgl + "T00:00:00").replace(tzinfo=TZ).isoformat()
            rows.append({
                "id": _id, "region": region, "tgl": tgl, "tgl_gudang": d(r[2]) or None,
                "supplier": s(r[3]), "po_no": po, "gr_no": gr, "inv_no": inv,
                "gr_return": s(r[i_ret]) if i_ret is not None else "", "nominal": nominal,
                "inv_dist": s(r[i_dist]) if i_dist is not None else "", "keterangan": " | ".join(ket),
                "created": created, "updated": dt.datetime.now(TZ).isoformat(),
                "po_at": None, "po_by": None, "gr_at": None, "gr_by": None, "inv_at": None, "inv_by": None,
                "legacy": True, "cek": None, "check_status": None,
            })
            n += 1
        print(f"  - {ws.title}: {n} baris sejak {date_from}")
    return rows


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("xlsx")
    ap.add_argument("--from", dest="date_from", default="2026-11-01", help="YYYY-MM-DD (default 2026-11-01)")
    ap.add_argument("--to", dest="date_to", default=None, help="YYYY-MM-DD (optional upper date limit)")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--overwrite", action="store_true", help="timpa baris yang sudah ada di Supabase")
    a = ap.parse_args()

    print(f"Membaca {a.xlsx} …")
    rows = extract(a.xlsx, a.date_from, a.date_to)
    print(f"Total {len(rows)} PO | belum GR: {sum(1 for r in rows if not r['gr_no'])} | belum invoice: {sum(1 for r in rows if not r['inv_no'])}")
    if a.dry_run:
        print(json.dumps(rows[:2], indent=1, ensure_ascii=False)); return

    url, key = os.environ.get("SUPABASE_URL", "").rstrip("/"), os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
    if not (url and key):
        sys.exit("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY belum di-set (lihat .env.example)")
    from supabase import create_client
    sb = create_client(url, key)

    if not a.overwrite:
        existing = set()
        res = sb.table("po").select("id").execute()
        existing = {r["id"] for r in (res.data or [])}
        before = len(rows); rows = [r for r in rows if r["id"] not in existing]
        print(f"{before - len(rows)} sudah ada → dilewati; {len(rows)} akan diunggah")

    for i in range(0, len(rows), 200):
        chunk = rows[i:i + 200]
        sb.table("po").upsert(chunk, on_conflict="id").execute()
        print(f"  ✓ {min(i + 200, len(rows))}/{len(rows)}")
    print("Selesai.")


if __name__ == "__main__":
    main()
