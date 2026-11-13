# Panduan Deploy: Vercel + Supabase

Waktu yang dibutuhkan sekitar 30 menit. Semua langkah bisa dilakukan dengan paket gratis.

> **Catatan jujur.** Kode dan skema sudah diuji penuh terhadap Postgres sungguhan (semua uji alur lolos). Yang **belum** bisa diuji dari lingkungan pengembangan: perilaku `vercel.json` di Vercel sungguhan, koneksi lewat pooler Supabase, dan widget Turnstile di browser. Karena itu ikuti daftar periksa di bagian 7 dan lihat bagian 9 bila ada masalah.
> Paket **Hobby** Vercel hanya untuk penggunaan non-komersial. Kalau situs akan mencari uang (iklan, donasi berulang, dsb.), pakai paket Pro.

## 0. Yang kamu butuhkan
- Akun GitHub, Vercel, dan Supabase
- Node.js 22 dan Git di komputermu
- Terminal (untuk `openssl`; di Windows pakai Git Bash)

## 1. Buat proyek Supabase
1. Masuk ke supabase.com, **New project**.
2. Isi nama, buat **Database Password** yang kuat (simpan!), pilih region **Southeast Asia (Singapore)**.
3. Tunggu proyek siap (1-2 menit).

## 2. Buat tabel
Pilih salah satu:
- **SQL Editor** (paling mudah): buka `supabase/schema.sql`, salin seluruh isinya ke SQL Editor Supabase, klik **Run**.
- **Lewat terminal**: isi `.env` (langkah 3), lalu `npm install && npm run db:init`.

Skema aman dijalankan berulang kali. Semua tabel memakai Row Level Security tanpa kebijakan, jadi akses langsung lewat API publik Supabase ditolak. Aplikasi mengakses database lewat koneksi server.

## 3. Ambil connection string
Di Supabase klik **Connect** > **Transaction pooler** (port **6543**). Salin URI-nya dan ganti `[YOUR-PASSWORD]` dengan password tadi. Bentuknya:

```
postgres://postgres.abcdefgh:PASSWORD@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres
```

Harus pooler port 6543, bukan Direct connection: Direct hanya IPv6 dan tidak cocok untuk serverless. Bila password berisi karakter khusus (`@ : / # ?`), ubah password agar hanya huruf dan angka, atau URL-encode.

## 4. Siapkan rahasia
```bash
openssl rand -hex 32   # REPORT_SALT
openssl rand -hex 16   # CRON_SECRET
openssl rand -hex 24   # token admin (satu per orang)
```
`REPORT_SALT` **jangan pernah diganti** setelah situs berjalan: penggantian membuat pembatas kirim dan penanda pelapor lama tidak berlaku lagi.

## 5. Push ke GitHub
```bash
cd titip-salam
git init && git add . && git commit -m "Titip Salam"
# buat repo PRIVAT di GitHub, lalu:
git remote add origin git@github.com:USERNAME/titip-salam.git
git push -u origin main
```
`.gitignore` sudah mencegah `.env`, `data/`, dan `node_modules/` ikut terunggah. Periksa dengan `git status` bahwa tidak ada `.env`.

## 6. Deploy di Vercel
1. Vercel > **Add New > Project**, impor repo tadi. Framework terdeteksi sebagai Express; biarkan pengaturan bawaan.
2. Buka **Environment Variables** dan isi (untuk Production, Preview boleh sama):

| Nama | Nilai |
|------|-------|
| `DATABASE_URL` | connection string pooler langkah 3 |
| `REPORT_SALT` | hasil `openssl rand -hex 32` |
| `CONTACT_EMAIL` | email kontak publik |
| `ADMIN_TOKENS` | `Rina:token1,Budi:token2` (min. 12 karakter per token) |
| `CRON_SECRET` | hasil `openssl rand -hex 16` |
| `AUTO_HIDE_AT` | opsional, bawaan `3` |
| `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET` | opsional (bagian 8) |

3. Klik **Deploy**. Wilayah fungsi sudah diset ke Singapura (`sin1`) di `vercel.json`, sejajar dengan Supabase.
4. Domain sendiri: **Settings > Domains > Add**, ikuti petunjuk DNS. Tanpa itu kamu mendapat `nama-proyek.vercel.app`.

Setiap push ke `main` akan men-deploy ulang. Mengubah variabel lingkungan butuh **Redeploy** agar berlaku.

## 7. Daftar periksa setelah deploy
Ganti `DOMAIN` dengan domainmu.

- [ ] `https://DOMAIN/api/health` menampilkan `{"ok":true}` (bila `503`, lihat bagian 9)
- [ ] `/` tampil dengan benar, tulis confess Umum, muncul di feed
- [ ] Tulis confess Personal, salin link, buka link itu (alamat `/r/...`)
- [ ] `/disclaimer`, `/privasi`, `/hapus` terbuka dan email kontak benar
- [ ] `/admin`: masuk dengan salah satu token, tab Pesan dan Konten terbuka
- [ ] Vercel > **Settings > Cron Jobs** menampilkan `/api/cron/purge`. Klik **Run** untuk uji; hasilnya harus status 200
- [ ] Buka `/api/cron/purge` tanpa header: harus `401`
- [ ] Beberapa pengunjung dari jaringan berbeda tidak kena `429` bersamaan (tanda pembatas kirim membaca IP dengan benar)

Catatan cron: cron hanya berjalan di deployment **production**. Di paket Hobby cron maksimal sekali sehari dan waktunya bisa bergeser dalam jam yang sama, jadi pesan kedaluwarsa dihapus permanen paling lambat sekitar dua hari. Link yang kedaluwarsa tetap langsung tidak bisa dibuka karena dicek saat dibaca.

## 8. Opsional: Cloudflare Turnstile
1. Di dash.cloudflare.com > Turnstile, **Add widget**, masukkan domainmu, mode Managed.
2. Isi `TURNSTILE_SITE_KEY` dan `TURNSTILE_SECRET` di Vercel, lalu Redeploy. Keduanya harus diisi, kalau salah satu kosong fitur nonaktif.
3. CSP halaman landing otomatis mengizinkan `challenges.cloudflare.com`. Uji kirim confess; widget harus muncul dan pengiriman lolos.

## 9. Pemecahan masalah

| Gejala | Penyebab dan solusi |
|--------|---------------------|
| Server error 500 di `/`, `/disclaimer`, atau `/privasi`, log Vercel menyebut `ENOENT ... views/` | Berkas template tidak ikut paket fungsi. Tambahkan ke `vercel.json`: `"functions": { "server.js": { "includeFiles": "views/**" } }` lalu push. (Bila `server.js` ditolak sebagai kunci, coba `"api/**"`/lihat nama fungsi di log build.) |
| `/api/health` 503 atau "Cannot connect" | `DATABASE_URL` salah/kata sandi salah, atau memakai Direct connection. Pakai Transaction pooler port 6543. Pastikan proyek Supabase tidak ter-pause (paket gratis di-pause bila tidak aktif lama; klik Restore di dashboard) |
| Kesalahan "prepared statement ... does not exist" | Koneksi bukan lewat pooler transaksi atau kode diubah. Kode memakai `prepare:false`; jangan diubah |
| `relation ... does not exist` | Skema belum dijalankan (langkah 2) |
| Semua orang kena `429` | Alamat IP tidak terbaca benar. Di Vercel `trust proxy` otomatis aktif; periksa tidak ada proxy lain di depan yang menyembunyikan IP |
| Aplikasi langsung keluar dengan pesan soal `REPORT_SALT` | Variabel belum diisi atau kurang dari 16 karakter |
| `/admin` selalu menolak token | `ADMIN_TOKENS`/`ADMIN_TOKEN` kosong, atau Redeploy belum dilakukan sesudah mengubahnya |
| Cron tidak berjalan | Hanya di production; periksa `CRON_SECRET` terisi dan lihat log di tab Cron Jobs |
| Halaman `/admin` atau `/r/...` tampil 404 | `cleanUrls`/rewrite di `vercel.json` tidak terbaca. Pastikan berkas itu ada di akar repo dan deployment terbaru memakainya |

## 10. Backup
- **Paket berbayar Supabase**: backup harian otomatis tersedia di Database > Backups.
- **Paket gratis**: tidak ada backup. Pakai `deploy/backup-workflow.yml.example` (GitHub Actions, enkripsi dengan gpg, simpan 7 hari). Ikuti petunjuk di dalam berkas.
- Backup berisi **semua pesan termasuk Personal**. Simpan terenkripsi dan jangan di repo publik. Pesan yang sudah dihapus bisa tetap ada di backup sampai backup itu kedaluwarsa; hal ini tertulis di Kebijakan Privasi.

## 11. Keamanan
- `DATABASE_URL` dan `REPORT_SALT` jangan pernah masuk Git atau kode di browser.
- Jangan memakai atau menyebarkan anon key / service role key Supabase untuk aplikasi ini; tidak dibutuhkan.
- Ganti token admin: ubah `ADMIN_TOKENS` di Vercel, Redeploy.
- Teks Disclaimer/Privasi bawaan sudah diperbarui untuk Vercel dan Supabase. Bila sebelumnya kamu sudah menyunting teks itu lewat editor admin, sunting tidak ikut berubah otomatis; periksa kembali isinya.
- Minta tinjauan hukum atas teks hukum sebelum rilis publik.
