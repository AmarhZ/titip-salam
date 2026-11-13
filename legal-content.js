'use strict';

// Teks bawaan halaman Disclaimer dan Kebijakan Privasi.
// Admin bisa mengubah judul, pembuka, dan isi tiap pasal dari /admin (tab Konten Landing).
// Jumlah dan urutan pasal serta id-nya (untuk tautan #moderasi, #kontak) tetap, karena
// dipakai tautan di bagian lain situs. Nomor pasal ditambahkan otomatis.
//
// Format isi pasal: lihat markup.js (baris kosong = paragraf, "- " = daftar, **tebal**, *miring*,
// [teks](/tautan), {{CONTACT}}).

const disclaimer = {
  path: '/disclaimer',
  title: 'Disclaimer',
  eyebrow: 'Aturan Main',
  description: 'Aturan penggunaan, batas tanggung jawab, dan cara kerja moderasi Titip Salam.',
  lead: 'Titip Salam adalah tempat untuk menyampaikan perasaan secara anonim. Supaya tempat ini tetap nyaman untuk semua orang, ada beberapa hal yang perlu kamu tahu sebelum menulis.',
  sections: [
    {
      id: 'layanan',
      h: 'Layanan apa adanya',
      b: `Titip Salam disediakan *sebagaimana adanya* dan gratis. Kami tidak menjamin layanan selalu tersedia tanpa gangguan, dan tidak menjamin pesan akan dibaca oleh orang yang kamu tuju. Pesan Umum bisa saja tidak pernah ditemukan, dan link Personal hanya berguna kalau kamu membagikannya.`,
    },
    {
      id: 'tanggung-jawab',
      h: 'Kamu bertanggung jawab atas pesanmu',
      b: `Setiap pesan ditulis oleh pengirimnya, bukan oleh pengelola. Pendapat atau klaim di dalam pesan tidak mewakili pandangan kami, dan kami tidak memeriksa kebenarannya sebelum pesan tampil. Dengan mengirim pesan, kamu menyatakan bahwa kamu yang menulisnya dan bertanggung jawab penuh atas isinya.`,
    },
    {
      id: 'larangan',
      h: 'Yang tidak boleh ditulis',
      b: `- Pelecehan, intimidasi, atau ancaman terhadap siapa pun.
- Membocorkan data pribadi orang lain, misalnya nomor telepon, alamat, tempat sekolah atau kerja, akun media sosial, atau foto tanpa izin.
- Ujaran kebencian berdasarkan suku, agama, ras, gender, orientasi, atau disabilitas.
- Konten seksual eksplisit, dan apa pun yang melibatkan anak dalam konteks seksual.
- Penipuan, pemerasan, promosi, dan spam.
- Menyamar sebagai orang lain atau mencemarkan nama baik seseorang.

Pesan yang melanggar bisa kami sembunyikan atau hapus kapan saja, tanpa pemberitahuan lebih dulu.`,
    },
    {
      id: 'mode',
      h: 'Mode Personal dan Mode Umum',
      b: `**Mode Personal.** Pesan hanya bisa dibuka lewat link rahasia. Siapa pun yang memegang link itu bisa membaca pesannya, jadi bagikan hanya kepada orang yang kamu tuju. Link tidak bisa dibuat ulang atau dipulihkan kalau hilang, karena kami hanya menyimpan versi acak (hash) dari link tersebut. Saat menulis, kamu bisa memberi masa berlaku (7, 30, atau 90 hari). Setelah masa itu habis, link tidak bisa dibuka lagi dan pesannya dihapus permanen dalam waktu singkat (paling lambat dua hari).

**Mode Umum.** Pesan tampil di feed yang bisa dilihat dan dicari siapa saja. Anggap itu seperti papan pengumuman terbuka: pesan bisa dibaca, disalin, atau di-screenshot oleh orang lain. Setelah mengirim, kamu menerima satu kode hapus yang bisa dipakai di halaman [Hapus Pesan](/hapus). Kode itu hanya diberikan sekali dan tidak bisa dipulihkan kalau hilang.`,
    },
    {
      id: 'anonim',
      h: 'Anonim bukan berarti kebal',
      b: `Kami tidak meminta akun dan tidak menampilkan identitas pengirim. Namun anonimitas tidak melindungi pesan yang melanggar hukum. Kami tidak menyimpan alamat IP di database, tetapi penyedia hosting dan database yang kami pakai mungkin mencatat log teknis sesuai kebijakan mereka. Bila ada kewajiban hukum yang sah, kami dapat diminta menyerahkan data yang kami miliki.`,
    },
    {
      id: 'moderasi',
      h: 'Pelaporan dan moderasi',
      b: `Setiap pesan di feed punya tombol **Laporkan**, dan penerima pesan Personal bisa melaporkan lewat halaman link rahasianya. Cara kerjanya:

- Kamu memilih alasan dan boleh menambah keterangan singkat. Kamu tidak perlu mendaftar.
- Pesan Umum yang dilaporkan oleh beberapa orang berbeda akan disembunyikan otomatis dari feed sambil menunggu ditinjau.
- Pesan Personal yang dilaporkan oleh pembacanya langsung disembunyikan dari link tersebut.
- Pengelola dapat membaca pesan yang dilaporkan, termasuk pesan Personal, untuk menentukan apakah pesan itu melanggar. Pesan lain yang tidak dilaporkan tidak kami baca secara rutin.
- Isi pesan Personal yang tidak dilaporkan tidak ditampilkan di panel admin kami.
- Pesan Umum yang memuat nomor telepon, tautan, email, akun media sosial, atau kata tertentu ditahan otomatis. Pesan itu baru tampil di feed setelah ditinjau pengelola, dan bisa saja tidak disetujui. Pesan Personal tidak disaring.
- Setelah ditinjau, pesan bisa ditampilkan kembali atau dihapus permanen.

Penyembunyian otomatis adalah langkah pencegahan, bukan putusan bahwa pesan itu melanggar. Kami berusaha menindaklanjuti laporan secepatnya, tetapi tidak bisa menjanjikan waktu tertentu.`,
    },
    {
      id: 'darurat',
      h: 'Kalau kamu atau seseorang dalam bahaya',
      b: `Titip Salam bukan layanan darurat dan tidak dipantau setiap saat. Jika ada ancaman terhadap keselamatan seseorang, segera hubungi 112 atau layanan bantuan setempat, jangan menunggu tindak lanjut dari kami.`,
    },
    {
      id: 'batas',
      h: 'Batas tanggung jawab',
      b: `Sejauh diizinkan hukum, pengelola tidak bertanggung jawab atas kerugian yang timbul dari isi pesan yang ditulis pengguna, dari link yang dibagikan ke orang yang salah, atau dari layanan yang terganggu atau berhenti. Ketentuan ini tidak membatasi hak yang tidak bisa dikesampingkan oleh hukum yang berlaku.`,
    },
    {
      id: 'perubahan',
      h: 'Perubahan',
      b: `Disclaimer ini bisa kami perbarui sewaktu-waktu. Tanggal pembaruan terakhir tercantum di bagian atas halaman. Dengan terus memakai layanan setelah perubahan, kamu dianggap menerima versi terbaru.`,
    },
    {
      id: 'kontak',
      h: 'Kontak',
      b: `Untuk permintaan penghapusan pesan, keberatan, atau pertanyaan lain, hubungi kami di {{CONTACT}}. Sertakan kutipan pesan yang dimaksud (untuk pesan Umum) atau link rahasianya (untuk pesan Personal) supaya kami bisa menemukannya. Baca juga [Kebijakan Privasi](/privasi).`,
    },
  ],
};

const privasi = {
  path: '/privasi',
  title: 'Kebijakan Privasi',
  eyebrow: 'Privasi',
  description: 'Data apa yang disimpan Titip Salam, untuk apa, dan bagaimana kamu bisa meminta penghapusan.',
  lead: 'Singkatnya: kami tidak meminta akun, email, atau nama aslimu, dan kami menyimpan sesedikit mungkin. Berikut rinciannya.',
  sections: [
    {
      id: 'data-disimpan',
      h: 'Data yang kami simpan',
      b: `Saat kamu mengirim confess, kami menyimpan:

- nama atau panggilan penerima yang kamu tulis;
- isi pesan;
- nama pengirim, *hanya jika* kamu mengisinya (kolom ini opsional);
- mode (Personal atau Umum) dan waktu pengiriman;
- untuk mode Personal: versi acak (hash) dari link rahasia, serta masa berlaku link bila kamu memilihnya. Link aslinya tidak kami simpan, sehingga kami sendiri tidak bisa memulihkannya;
- untuk mode Umum: versi acak (hash) dari kode hapus. Kode aslinya tidak kami simpan.

Karena nama dan isi pesan ditulis bebas, kamu yang menentukan seberapa banyak informasi pribadi yang masuk. Sebaiknya jangan menuliskan data sensitif milik siapa pun.`,
    },
    {
      id: 'tidak-disimpan',
      h: 'Data yang tidak kami simpan',
      b: `- Tidak ada akun, kata sandi, email, atau nomor telepon.
- Kami tidak memasang cookie, pelacak iklan, maupun analitik pihak ketiga di situs ini. Lihat bagian layanan pihak ketiga untuk font dan verifikasi anti-spam.
- Alamat IP mentah tidak disimpan di database kami. Untuk membatasi spam (jumlah kiriman per jam), kami menyimpan penanda acak hasil perhitungan dari IP dengan kunci rahasia, bersama waktu aksesnya. Penanda itu tidak bisa dibalik menjadi IP dan dihapus secara berkala.`,
    },
    {
      id: 'laporan',
      h: 'Data laporan',
      b: `Kalau kamu melaporkan sebuah pesan, kami menyimpan alasan, keterangan opsional yang kamu tulis, waktu laporan, dan penanda pelapor. Penanda itu berupa kode acak hasil perhitungan dari IP dengan kunci rahasia server, bukan IP itu sendiri. Gunanya hanya supaya satu orang tidak bisa melaporkan pesan yang sama berulang kali. Kami tidak bisa membalik penanda itu menjadi IP-mu.

Pesan yang dilaporkan, termasuk pesan Personal, dapat dibaca oleh pengelola untuk keperluan peninjauan. Lihat bagian [pelaporan dan moderasi](/disclaimer#moderasi) di Disclaimer.`,
    },
    {
      id: 'penggunaan',
      h: 'Untuk apa data dipakai',
      b: `- Menampilkan pesan Umum di feed dan membuat pencarian nama berfungsi.
- Menampilkan pesan Personal kepada pemegang link rahasia.
- Mencegah spam dan menindaklanjuti laporan pelanggaran.
- Menahan pesan Umum yang memuat nomor telepon, tautan, email, akun media sosial, atau kata tertentu supaya ditinjau pengelola lebih dulu. Penyaringan ini otomatis dan tidak membuat profil pengguna.
- Mencatat riwayat tindakan moderasi (jenis tindakan, nomor pesan, dan waktu; tanpa isi pesan).

Kami tidak menjual data dan tidak memakainya untuk iklan atau profil pengguna.`,
    },
    {
      id: 'pelihat',
      h: 'Siapa yang bisa melihat pesanmu',
      b: `- **Mode Umum:** siapa saja yang membuka situs ini. Pesan juga bisa disalin atau di-screenshot orang lain di luar kendali kami.
- **Mode Personal:** siapa saja yang memegang link rahasianya, tidak muncul di feed atau pencarian, dan halamannya diminta untuk tidak diindeks mesin pencari. Kami meminta peramban tidak menyimpan halaman itu di cache.
- **Pengelola:** pesan Umum yang memang publik (termasuk yang ditahan penyaring otomatis untuk ditinjau), serta pesan Personal hanya bila dilaporkan atau ada kewajiban hukum yang sah.`,
    },
    {
      id: 'pihak-ketiga',
      h: 'Layanan pihak ketiga',
      b: `Halaman kami memuat font dari Google Fonts. Saat itu terjadi, peramban kamu terhubung ke server Google dan Google dapat melihat alamat IP serta informasi teknis peramban sesuai kebijakan mereka sendiri. Situs ini dihosting di Vercel dan datanya disimpan di Supabase (Postgres). Kedua penyedia itu dapat memproses data atas nama kami dan mencatat log teknis akses sesuai kebijakan masing-masing. Kami tidak mengendalikan log tersebut. Bila verifikasi anti-spam Cloudflare Turnstile diaktifkan, peramban dan alamat IP-mu juga dikirim ke Cloudflare saat kamu mengirim confess, untuk memastikan pengirimnya manusia, sesuai kebijakan Cloudflare sendiri.`,
    },
    {
      id: 'retensi',
      h: 'Lama penyimpanan',
      b: `Saat ini tidak ada penghapusan otomatis: pesan tersimpan sampai dihapus oleh pengelola atau atas permintaan. Laporan yang sudah ditinjau dan dinyatakan tidak melanggar dihapus bersama penanda pelapornya. Ketika sebuah pesan dihapus, laporan terkaitnya ikut terhapus. Riwayat tindakan moderasi disimpan tanpa batas waktu karena tidak memuat isi pesan.

Pesan Personal yang diberi masa berlaku dihapus permanen paling lambat dua hari setelah masa itu habis. Pengirim pesan Umum bisa menghapus pesannya sendiri dengan kode hapus. Penyedia database kami dapat membuat salinan cadangan secara berkala, sehingga pesan yang sudah dihapus mungkin masih ada di cadangan sampai cadangan itu kedaluwarsa, umumnya dalam beberapa hari.`,
    },
    {
      id: 'hak',
      h: 'Hak kamu dan permintaan penghapusan',
      b: `Kalau kamu punya kode hapus, kamu bisa menghapus pesan Umum sendiri di halaman [Hapus Pesan](/hapus). Selain itu, kamu dapat meminta pesan dihapus. Karena kami tidak punya akun, kami memerlukan petunjuk untuk menemukannya: kutipan pesan dan nama penerima (untuk pesan Umum), atau link rahasia lengkap (untuk pesan Personal). Kami akan menghapusnya jika permintaan wajar dan dapat diverifikasi. Kamu juga berhak mengajukan pertanyaan atau keberatan terkait pemrosesan data sesuai peraturan perlindungan data pribadi yang berlaku di Indonesia.`,
    },
    {
      id: 'anak',
      h: 'Anak-anak',
      b: `Layanan ini ditujukan bagi pengguna yang sudah cukup umur untuk memakai internet secara mandiri. Anak di bawah 18 tahun sebaiknya didampingi orang tua atau wali, dan tidak boleh menuliskan data pribadi dirinya maupun anak lain.`,
    },
    {
      id: 'keamanan',
      h: 'Keamanan',
      b: `Kami memakai langkah teknis yang wajar: link rahasia berupa kode acak yang sulit ditebak dan hanya disimpan dalam bentuk hash, teks pengguna ditampilkan sebagai teks biasa, dan ada pembatasan kiriman. Meski begitu, tidak ada sistem yang aman sepenuhnya. Jangan menuliskan hal yang akan sangat merugikanmu jika sampai terbaca orang lain.`,
    },
    {
      id: 'perubahan',
      h: 'Perubahan',
      b: `Kebijakan ini bisa diperbarui. Tanggal pembaruan terakhir tercantum di bagian atas halaman.`,
    },
    {
      id: 'kontak',
      h: 'Kontak',
      b: `Pertanyaan atau permintaan terkait privasi bisa dikirim ke {{CONTACT}}. Baca juga [Disclaimer](/disclaimer).`,
    },
  ],
};

module.exports = { disclaimer, privasi };
