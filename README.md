# PO Tracking & Cek Invoice — DTG × HWG (versi website)

Website statis (HTML/JS, tanpa server sendiri) + **Supabase** (login, database, penyimpanan dokumen, realtime)
+ **Gemini** (membaca total dari foto/scan invoice fisik). Bisa di-host gratis di **Netlify** atau **GitHub Pages**.

```
po-web/
├─ index.html, app.js, styles.css     ← website
├─ config.example.js                  ← salin → config.js, isi URL & anon key Supabase (+ Gemini)
├─ netlify.toml
├─ supabase/
│  ├─ schema.sql                      ← tabel, RLS, bucket storage, realtime
│  └─ functions/gemini-total/index.ts ← Edge Function (kunci Gemini tetap rahasia)
├─ python/
│  ├─ setup_supabase.py               ← jalankan schema + settings + admin
│  ├─ upload_seed.py                  ← unggah Excel tracking lama → tabel po
│  ├─ requirements.txt, .env.example
└─ data/PR_TRACKING_LIST_WAREHOUSE_2026.xlsx
```

---

## 1. Supabase (±10 menit)

1. Buat project di <https://supabase.com> (region Singapore). Catat dari **Project Settings → API**:
   `Project URL`, `anon public key`, `service_role key` (rahasia), dan dari **Project Settings → Database** connection string (mode *Session*).
2. **Skema database** — pilih salah satu:
   - **Python** (otomatis): 
     ```bash
     cd python
     pip install -r requirements.txt
     cp .env.example .env        # isi SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_DB_URL, ADMIN_EMAIL
     python setup_supabase.py
     ```
   - **Manual**: buka **SQL Editor**, tempel isi `supabase/schema.sql`, Run.
3. **Buat user** untuk tim: **Authentication → Users → Add user** (email + password, centang *Auto Confirm*).
   Profil (nama tampilan, peran `staff`) dibuat otomatis. Jadikan diri Anda admin:
   `update public.profiles set role='admin' where email='achmadsamudro23@gmail.com';`
   (atau isi `ADMIN_EMAIL` di `.env` lalu jalankan `setup_supabase.py` lagi).
4. **Unggah data November dari Excel**:
   ```bash
   python upload_seed.py ../data/PR_TRACKING_LIST_WAREHOUSE_2026.xlsx --from 2026-11-01
   ```
   Baris lama masuk sebagai `legacy` (tanpa jam) — hanya tanggal; PO yang sudah ada dilewati (pakai `--overwrite` untuk menimpa).
   `--dry-run` menampilkan ringkasan tanpa mengunggah.

## 2. Gemini (deteksi total invoice fisik)

Ambil API key di <https://aistudio.google.com/apikey>. Dua cara:

**A. Edge Function (disarankan — kunci tidak pernah sampai ke browser)**
```bash
npm i -g supabase            # atau: brew install supabase/tap/supabase
supabase login
supabase link --project-ref <ref-project>
supabase secrets set GEMINI_API_KEY=AIza...        # opsional: GEMINI_MODEL=gemini-2.5-flash
supabase functions deploy gemini-total
```
Di `config.js`: `GEMINI_MODE: "edge"`.

**B. Langsung dari browser (lebih cepat dipasang)**
Di `config.js`: `GEMINI_MODE: "direct"`, isi `GEMINI_API_KEY`. **Wajib** batasi kunci itu per *HTTP referrer*
(domain situs Anda) di Google AI Studio / Cloud Console, karena kunci terlihat oleh siapa pun yang membuka situs.

PDF dari ESB (PO, GR, Purchase Invoice) **tidak memakai Gemini** — nomor, supplier, branch, tanggal, dan total dibaca langsung dari teks PDF.

## 3. Deploy website

Salin `config.example.js` → `config.js`, isi `SUPABASE_URL`, `SUPABASE_ANON_KEY` (+ Gemini). Anon key memang dirancang publik;
yang melindungi data adalah RLS (hanya user yang login bisa membaca/menulis).

**Netlify**: drag-and-drop folder ini ke <https://app.netlify.com/drop>, atau hubungkan repo GitHub (publish directory `.`).
**GitHub Pages**: push ke repo → Settings → Pages → Branch `main` / root. Karena `config.js` ada di `.gitignore`,
hapus baris itu dari `.gitignore` (hanya anon key yang ada di sana) atau buat file-nya lewat GitHub Action.

Setelah deploy, tambahkan URL situs di Supabase → **Authentication → URL Configuration → Site URL / Redirect URLs**.

## 4. Cara pakai (ringkas)

- **PO Tracking → + PO Baru** → upload PDF PO dari ESB → No PO, supplier, branch, tanggal, Grand Total terisi otomatis. Simpan (jam PO terekam).
- GR dibuat → buka baris → upload PDF GR (No GR + tanggal terisi) → Simpan (jam GR terekam).
- Invoice fisik datang → upload foto/PDF → **Baca total dengan AI** (Gemini) → total terisi → selisih PO vs Fisik langsung muncul.
- Invoice diinput di ESB → upload PDF Purchase Invoice → No Invoice, No invoice distributor, Invoice Total terisi → MATCH / SELISIH final.
- Barang sudah di gudang tapi invoice distributor belum ada: centang **📦 menunggu invoice distributor** (No PO boleh kosong); masa tunggu tidak masuk KPI.
- **Outstanding**: live daftar belum GR / belum invoice / menunggu distributor. **Dashboard KPI**: rata-rata jam per region & per petugas, % tepat target.
- **Import & Setting**: nama tampilan, target KPI & toleransi selisih (admin), import Excel.

## Struktur data (tabel `po`)
Satu baris per PO (`id` = No PO, atau `TMP-…` bila PO belum dibuat). Jam & petugas: `po_at/po_by`, `gr_at/gr_by`, `inv_at/inv_by`.
Hasil cek dokumen ada di kolom JSON `cek` (`total_po/fisik/esb`, `*_asset` path file di bucket `dokumen`, `status`, `detail`, siapa & kapan tiap dokumen diunggah) dan diringkas di `check_status`.
