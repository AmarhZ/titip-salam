# Titip Salam

Web confess anonim: **mode Personal** (link rahasia, hanya pemegang link yang bisa membaca) dan **mode Umum** (terbit di feed publik, bisa dicari lewat nama). Dilengkapi tombol laporan, moderasi, serta halaman Disclaimer dan Kebijakan Privasi.

Berjalan di **Vercel** (Express sebagai satu Vercel Function) dengan database **Supabase** (Postgres). **Panduan deploy lengkap ada di [DEPLOY.md](DEPLOY.md).**

## Menjalankan secara lokal

Butuh Node.js 22 dan sebuah database Postgres (paling mudah: proyek Supabase gratis, atau Postgres lokal).

```bash
npm install
cp .env.example .env       # lalu isi (lihat DEPLOY.md untuk cara mendapat nilainya)
npm run db:init            # membuat tabel dari supabase/schema.sql (sekali saja)
node --env-file=.env server.js
# http://localhost:3000
```

Variabel lingkungan:

| Variabel        | Default  | Fungsi                                                                 |
|-----------------|----------|------------------------------------------------------------------------|
| `DATABASE_URL`  | wajib    | Connection string Postgres. Di Supabase pakai **Transaction pooler** (port 6543) |
| `REPORT_SALT`   | wajib di Vercel | Garam rahasia (min. 16 karakter, `openssl rand -hex 32`) untuk menandai pelapor dan pembatas kirim tanpa menyimpan IP. Jangan diganti setelah dipakai. Lokal: dibuat otomatis di `DATA_DIR/.report-salt` |
| `CONTACT_EMAIL` | kosong   | Email kontak di halaman Disclaimer dan Privasi. **Wajib diisi sebelum rilis** |
| `ADMIN_TOKENS`  | kosong   | Token admin per orang: `Rina:token-panjang,Budi:token-lain` (token min. 12 karakter). Nama pelaku tercatat di riwayat |
| `ADMIN_TOKEN`   | kosong   | Token admin tunggal (tercatat sebagai "admin"). Boleh dipakai bersama `ADMIN_TOKENS`. Kalau keduanya kosong, admin nonaktif |
| `CRON_SECRET`   | kosong   | Rahasia untuk `/api/cron/purge`. Vercel mengirimnya otomatis. Kosong berarti endpoint itu menolak semua permintaan |
| `AUTO_HIDE_AT`  | `3`      | Jumlah pelapor berbeda yang membuat pesan Umum disembunyikan otomatis  |
| `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET` | kosong | Aktifkan verifikasi anti-spam Cloudflare Turnstile di form kirim. Keduanya harus diisi |
| `TRUST_PROXY`   | kosong   | Isi `1` bila di belakang proxy lain. Di Vercel sudah otomatis aktif    |
| `PG_POOL_MAX`   | `1`      | Jumlah koneksi database per instance. Biarkan `1` di serverless        |
| `DATABASE_SSL`  | aktif    | Isi `disable` hanya untuk Postgres lokal tanpa SSL                     |
| `PORT`          | `3000`   | Port server (hanya lokal)                                              |

## Struktur

```
server.js            API, moderasi, editor konten, dan render halaman (diekspor sebagai app Express)
db.js                Koneksi Postgres (postgres.js, siap pooler Supabase)
supabase/schema.sql  Skema tabel + RLS, dijalankan sekali di Supabase
scripts/db-init.js   Menjalankan schema.sql lewat DATABASE_URL (npm run db:init)
vercel.json          Rewrite, header keamanan halaman statis, cron harian, wilayah
DEPLOY.md            Panduan deploy Vercel + Supabase
content-schema.js    Daftar teks landing page dan halaman hukum yang bisa diedit dari /admin
filter.js            Filter konten pesan Umum (telepon, tautan, email, akun, kata)
legal-content.js     Teks bawaan Disclaimer dan Kebijakan Privasi (per pasal)
markup.js            Format teks aman untuk halaman hukum (paragraf, daftar, tebal, tautan)
views/legal.html     Template bersama halaman hukum
views/index.html     Landing page (teks yang bisa diedit ditandai data-cms). Sengaja di luar public/ supaya dirender server
public/read.html     Halaman baca link rahasia (/r/:token)
public/admin.html    Halaman admin (/admin)
public/app.js        Logika form dan feed
public/read.js       Logika halaman baca
public/report.js     Dialog laporan bersama
public/admin.js      Logika halaman admin
public/hapus.html    Halaman hapus pesan Umum dengan kode hapus (/hapus)
public/styles.css    Gaya (palet Navy, Teal, Beige, Sky Blue, White)
public/robots.txt    Melarang pengindeksan /admin, /r/, dan /api/
```

## API publik

| Method | Path                         | Keterangan                                                          |
|--------|------------------------------|---------------------------------------------------------------------|
| POST   | `/api/confess`               | `{mode, to, message, from?}`. Personal mengembalikan `path` link rahasia, Umum mengembalikan `id` |
| GET    | `/api/feed`                  | `?q=nama&before=id`. Hanya mode Umum yang tidak disembunyikan       |
| GET    | `/api/secret/:token`         | Isi confess Personal. `410` bila sudah dilaporkan dan disembunyikan |
| GET    | `/api/report-reasons`        | Daftar alasan laporan                                               |
| POST   | `/api/report/:id`            | `{reason, detail?}` melaporkan pesan Umum                           |
| POST   | `/api/secret/:token/report`  | `{reason, detail?}` melaporkan pesan Personal (oleh pembacanya)     |
| POST   | `/api/delete`                | `{code}` menghapus pesan Umum milik pengirim (10 percobaan per jam per IP) |
| GET    | `/api/health`                | Cek hidup + koneksi database (`503` bila database mati)             |
| GET    | `/api/cron/purge`            | Pembersihan harian. Wajib `Authorization: Bearer <CRON_SECRET>`     |
| GET    | `/api/config`                | Pengaturan publik untuk frontend (kunci situs Turnstile bila aktif)  |
| GET    | `/disclaimer`, `/privasi`, `/hapus` | Halaman hukum dan halaman hapus pesan                        |

`POST /api/confess` menerima juga `expiry` (`"0"`, `"7"`, `"30"`, `"90"`, hanya mode Personal) dan `turnstile` (token, bila Turnstile aktif). Respons mode Umum memuat `held` (pesan ditahan filter) dan `deleteCode` (hanya diberikan sekali).

## Cara kerja laporan

- Pesan Umum disembunyikan otomatis dari feed setelah `AUTO_HIDE_AT` pelapor **berbeda** (default 3). Pelapor dibedakan lewat HMAC dari IP dengan kunci rahasia `REPORT_SALT`; IP mentah tidak disimpan. Karena itu satu orang tidak bisa melaporkan pesan yang sama dua kali.
- Pesan Personal langsung disembunyikan setelah **satu** laporan, karena hanya ada satu pembaca.
- Penyembunyian otomatis hanyalah pencegahan. Pesan tetap ada di database sampai kamu meninjaunya.
- Batas: 10 laporan per jam per IP.

## Fitur perlindungan dan kendali

**Filter konten (pesan Umum).** Pesan Umum yang memuat nomor telepon, tautan, email, akun media sosial, kata dalam daftar, atau pesan yang sama berulang dalam satu jam **ditahan**: pengirim tetap mendapat balasan sukses, tetapi pesan tidak tampil di feed sampai admin menyetujuinya di tab **Antrean**. Pesan tidak ditolak, supaya salah deteksi tidak menghalangi pengirim yang jujur. Daftar kata bisa diubah di tab Antrean (satu kata atau frasa per baris; pencocokan mengabaikan huruf besar, aksen, dan angka pengelabuan seperti b4ngs4t). Pesan Personal tidak disaring. Filter adalah jaring pertama, bukan jaminan: tetap andalkan laporan dan tinjauan manusia.

**Masa berlaku link Personal.** Pengirim memilih tanpa batas, 7, 30, atau 90 hari. Setelah habis, link menampilkan "kedaluwarsa", dan pesan dihapus permanen oleh cron harian (`/api/cron/purge`), jadi paling lambat sekitar dua hari kemudian.

**Kode hapus (pesan Umum).** Tepat setelah mengirim, pengirim menerima kode seperti `128-K7M2-9QXA-B4TH`. Server hanya menyimpan hash bagian rahasianya. Kode dipakai di `/hapus` untuk menghapus pesan permanen. Pesan Personal tidak punya kode hapus (gunakan masa berlaku).

**Backup.** Ditangani Supabase, bukan aplikasi. Backup harian otomatis tersedia di paket berbayar Supabase; di paket gratis tidak ada, jadi pakai contoh GitHub Actions di `deploy/backup-workflow.yml.example` (lihat DEPLOY.md). Backup berisi semua pesan termasuk Personal, jadi perlakukan seperti database itu sendiri. Pesan yang sudah dihapus bisa masih ada di backup sampai backup itu kedaluwarsa, dan hal ini sudah dinyatakan di Kebijakan Privasi.

**Pembatas kirim.** Disimpan di tabel `rate_hits` (bukan di memori), jadi berlaku sama di semua instance serverless dan bertahan saat server dimulai ulang. Yang disimpan hanya HMAC dari IP, bukan IP. Dibersihkan cron harian.

**Token admin per orang.** Dengan `ADMIN_TOKENS`, setiap admin punya token sendiri dan namanya tercatat di tab Aktivitas ("oleh Rina"). Mencabut akses cukup dengan menghapus satu entri lalu deploy ulang (di Vercel: Redeploy).

**Verifikasi anti-spam (opsional).** Isi `TURNSTILE_SITE_KEY` dan `TURNSTILE_SECRET` (dari dashboard Cloudflare Turnstile). Form kirim akan menampilkan widget, dan server memverifikasi tokennya sebelum menyimpan pesan. Jika Cloudflare tidak bisa dihubungi, pengiriman ditolak (gagal tertutup). Saat aktif, CSP halaman landing otomatis mengizinkan `challenges.cloudflare.com`. Turnstile mengirim IP dan data peramban ke Cloudflare, dan hal ini sudah tercantum di Kebijakan Privasi. Bagian widget di peramban belum pernah diuji dengan Cloudflare sungguhan, jadi cobalah dengan kunci uji Cloudflare sebelum rilis.

## Halaman admin

Buka `/admin` (lokal: `http://localhost:3000/admin`) lalu tempel token admin kamu. Halaman ini hanya hidup bila `ADMIN_TOKENS` atau `ADMIN_TOKEN` diatur, tidak diindeks mesin pencari, dan token hanya disimpan di `sessionStorage` (hilang saat tab ditutup atau klik **Keluar**).

| Tab               | Fungsi                                                                                                   |
|-------------------|----------------------------------------------------------------------------------------------------------|
| (atas)            | Angka ringkas (perlu ditinjau, total, disembunyikan, 24 jam terakhir) dan grafik pesan baru 7 hari       |
| **Antrean**       | Pesan Umum yang ditahan filter, lengkap dengan alasannya. Aksi: setujui dan tampilkan, atau hapus. Di sini juga daftar kata filter diubah |
| **Dilaporkan**    | Pesan yang punya laporan, lengkap dengan alasan dan keterangan. Aksi: sembunyikan, tampilkan dan tutup laporan, tidak melanggar, hapus |
| **Semua pesan**   | Telusuri semua pesan dengan filter Umum, Personal, Tersembunyi, serta pencarian nama penerima            |
| **Konten Landing**| Ubah teks landing page (lihat di bawah)                                                                  |
| **Aktivitas**     | Riwayat tindakan moderasi dan perubahan konten beserta pelakunya (hanya jenis tindakan dan ID, bukan isi pesan) |

**Privasi di admin:** isi pesan Personal **tidak** ditampilkan di tab Semua pesan. Pesan itu baru terbaca setelah dilaporkan, sesuai Kebijakan Privasi. Pesan Umum memang publik, jadi tampil penuh.

### Mengubah isi landing page

Tab **Konten Landing** berisi 98 bidang teks: 46 untuk landing page (hero, form, dua mode, cara kerja, FAQ, penutup, judul tab, deskripsi mesin pencari) dan 52 untuk halaman **Disclaimer** serta **Kebijakan Privasi**. Perubahan langsung tampil di `/` setelah disimpan: halaman dirender di server, jadi tanpa kedipan dan tetap tampil bila JavaScript dimatikan. Kolom kosong, atau tombol **Kembalikan bawaan**, memulihkan teks asli. Hanya teks yang diubah yang disimpan di database (tabel `site_content`). Semua teks di-escape, jadi tag HTML yang diketik tampil sebagai teks biasa.

Yang **belum** bisa diedit dari admin: nama brand, warna, gambar, dan urutan bagian.

**Halaman Disclaimer dan Privasi.** Dua grup lipat di bawah daftar landing page. Yang bisa diubah: judul, label kecil, deskripsi Google, paragraf pembuka, serta judul dan isi tiap pasal. Jumlah, urutan, dan id pasal (untuk tautan `#moderasi` dan `#kontak`) tetap, dan nomor pasal ditambahkan otomatis. Teks bawaan ada di `legal-content.js`. "Terakhir diperbarui" otomatis memakai tanggal simpan terakhir (zona WIB); bila semua teks dikembalikan ke bawaan, tanggal kembali ke tanggal bawaan di `server.js` (`LEGAL_UPDATED`).

Isi pasal ditulis dengan format sederhana. Semua teks di-escape lebih dulu, jadi HTML tidak bisa disisipkan:

| Tulis                         | Hasil                                                        |
|-------------------------------|--------------------------------------------------------------|
| baris kosong                  | paragraf baru                                                |
| `- butir`                     | daftar                                                       |
| `**tebal**`, `*miring*`       | tebal, miring                                                |
| `[teks](/privasi#kontak)`     | tautan. Hanya `/…`, `#…`, `http://`, dan `https://` yang diizinkan |
| `{{CONTACT}}`                 | email dari `CONTACT_EMAIL`                                   |

**Penting:** isi halaman hukum harus tetap sesuai perilaku aplikasi. Admin bukan pengganti tinjauan hukum.

**Menambah teks baru yang bisa diedit:**

1. Beri elemen berisi teks polos (tanpa tag di dalamnya) atribut `data-cms="kunci.baru"` di `views/index.html`.
2. Tambahkan satu baris di `INDEX_FIELDS` pada `content-schema.js`: `f('kunci.baru', G.hero, 'Label di admin', 60)`.

Teks bawaan otomatis diambil dari HTML, jadi tidak perlu ditulis dua kali. Bila kunci ada di skema tetapi tidak ketemu di HTML, server memberi peringatan saat start.

### API admin

Semua permintaan memakai header `Authorization: Bearer <token admin>` dan dibatasi 120 permintaan per menit per IP.

| Method | Path                                | Keterangan                                                    |
|--------|-------------------------------------|---------------------------------------------------------------|
| GET    | `/api/admin/stats?tz=<menit>`       | Angka ringkas dan data grafik 7 hari                          |
| GET    | `/api/admin/reports`                | Pesan yang dilaporkan beserta laporannya                      |
| GET    | `/api/admin/confessions`            | `?view=all|public|personal|hidden&q=&before=`. Isi Personal tanpa laporan disamarkan |
| GET    | `/api/admin/queue`                  | Pesan Umum yang ditahan filter                                |
| POST   | `/api/admin/confessions/:id/approve`| Setujui pesan di antrean dan tampilkan                        |
| GET/PUT| `/api/admin/filter`                 | Daftar kata filter: `{words: "satu\ndua"}`                    |
| POST   | `/api/admin/confessions/:id/hide`   | Sembunyikan                                                   |
| POST   | `/api/admin/confessions/:id/restore`| Tampilkan lagi dan hapus laporannya                           |
| DELETE | `/api/admin/confessions/:id`        | Hapus permanen (pesan dan laporannya)                         |
| GET    | `/api/admin/content`                | Semua bidang konten beserta nilai dan teks bawaannya          |
| PUT    | `/api/admin/content`                | `{values: {kunci: teks}}`. Kosong atau sama dengan bawaan berarti kembali ke bawaan |
| GET    | `/api/admin/log`                    | 60 tindakan terakhir                                          |

Contoh tanpa antarmuka:

```bash
H="Authorization: Bearer tokenmu"
curl -s -H "$H" http://localhost:3000/api/admin/reports
curl -s -X POST -H "$H" http://localhost:3000/api/admin/confessions/12/hide
```

Admin memakai token (bukan akun dengan kata sandi). Beri tiap orang token sendiri lewat `ADMIN_TOKENS`, pakai token panjang dan acak (`openssl rand -hex 24`), akses lewat HTTPS, dan ganti token dengan mengubah variabel lingkungan lalu deploy ulang (di Vercel: Redeploy).

## Catatan keamanan dan privasi

- Token link rahasia acak 144-bit; di database hanya **hash SHA-256**-nya yang disimpan. Link yang hilang tidak bisa dipulihkan.
- Pesan Personal tidak pernah muncul di feed atau pencarian; halamannya `noindex` dan tidak di-cache.
- Semua teks pengguna dirender dengan `textContent` (tanpa `innerHTML`) dan ada CSP ketat.
- Rate limit disimpan di database (tabel `rate_hits`, hanya HMAC IP), jadi konsisten di semua instance serverless.
- Teks bawaan Disclaimer dan Privasi ditulis agar cocok dengan perilaku kode ini (apa yang disimpan, bagaimana IP dipakai, bagaimana moderasi bekerja). **Kalau kamu mengubah perilakunya, ubah juga teksnya**, dan sebaiknya minta tinjauan hukum sebelum rilis publik.
