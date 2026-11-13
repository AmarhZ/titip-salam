'use strict';

// Daftar teks landing page yang bisa diedit dari /admin.
// Teks bawaan (default) TIDAK ditulis di sini: server mengambilnya dari elemen
// yang punya atribut data-cms="<key>" di public/index.html.
//
// Menambah teks baru yang bisa diedit:
//   1. beri elemen berisi teks polos itu atribut data-cms="kunci.baru" di index.html
//      (isinya harus teks saja, tanpa tag di dalamnya),
//   2. tambahkan satu baris di bawah ini.
//
// attr: 'content' berarti nilai diambil dari atribut content (untuk <meta>), bukan isi elemen.

const LEGAL = require('./legal-content');

const f = (key, group, label, max, extra = {}) => ({ key, group, label, max, ...extra });

const G = {
  meta: 'Judul tab dan mesin pencari',
  hero: 'Hero (bagian paling atas)',
  form: 'Kartu form',
  modes: 'Dua mode confess',
  steps: 'Cara kerja',
  feed: 'Feed umum',
  privacy: 'Privasi',
  faq: 'FAQ',
  closing: 'Penutup dan footer',
};

const INDEX_FIELDS = [
  f('meta.title', G.meta, 'Judul tab browser', 70),
  f('meta.description', G.meta, 'Deskripsi untuk Google dan media sosial', 200, { attr: 'content' }),

  f('hero.eyebrow', G.hero, 'Label kecil di atas judul', 40),
  f('hero.title1', G.hero, 'Judul, bagian pertama', 60),
  f('hero.title2', G.hero, 'Judul, bagian berwarna', 60),
  f('hero.lead', G.hero, 'Paragraf pembuka', 280),
  f('hero.cta1', G.hero, 'Tombol utama', 30),
  f('hero.cta2', G.hero, 'Tombol kedua', 30),
  f('hero.tick1', G.hero, 'Poin keunggulan 1', 40),
  f('hero.tick2', G.hero, 'Poin keunggulan 2', 40),
  f('hero.tick3', G.hero, 'Poin keunggulan 3', 40),

  f('form.title', G.form, 'Judul kartu form', 50),
  f('form.sub', G.form, 'Sub-judul kartu form', 80),

  f('modes.title', G.modes, 'Judul bagian', 80),
  f('modes.lead', G.modes, 'Kalimat pengantar', 160),
  f('mp.title', G.modes, 'Mode Personal: judul', 80),
  f('mp.b1', G.modes, 'Mode Personal: poin 1', 90),
  f('mp.b2', G.modes, 'Mode Personal: poin 2', 90),
  f('mp.b3', G.modes, 'Mode Personal: poin 3', 90),
  f('mu.title', G.modes, 'Mode Umum: judul', 80),
  f('mu.b1', G.modes, 'Mode Umum: poin 1', 90),
  f('mu.b2', G.modes, 'Mode Umum: poin 2', 90),
  f('mu.b3', G.modes, 'Mode Umum: poin 3', 90),

  f('steps.title', G.steps, 'Judul bagian', 80),
  f('step1.title', G.steps, 'Langkah 1: judul', 40),
  f('step1.text', G.steps, 'Langkah 1: penjelasan', 180),
  f('step2.title', G.steps, 'Langkah 2: judul', 40),
  f('step2.text', G.steps, 'Langkah 2: penjelasan', 180),
  f('step3.title', G.steps, 'Langkah 3: judul', 40),
  f('step3.text', G.steps, 'Langkah 3: penjelasan', 180),

  f('feed.title', G.feed, 'Judul bagian', 90),

  f('privacy.title', G.privacy, 'Judul bagian', 80),
  f('privacy.lead', G.privacy, 'Kalimat pengantar', 200),

  f('faq.title', G.faq, 'Judul bagian', 80),
  f('faq1.q', G.faq, 'Pertanyaan 1', 90),
  f('faq1.a', G.faq, 'Jawaban 1', 300),
  f('faq2.q', G.faq, 'Pertanyaan 2', 90),
  f('faq2.a', G.faq, 'Jawaban 2', 300),
  f('faq3.q', G.faq, 'Pertanyaan 3', 90),
  f('faq3.a', G.faq, 'Jawaban 3', 300),
  f('faq4.q', G.faq, 'Pertanyaan 4', 90),
  f('faq4.a', G.faq, 'Jawaban 4', 300),

  f('cta.title1', G.closing, 'Ajakan akhir, bagian pertama', 80),
  f('cta.title2', G.closing, 'Ajakan akhir, bagian berwarna', 60),
  f('cta.button', G.closing, 'Tombol ajakan akhir', 30),
  f('foot.copy', G.closing, 'Teks hak cipta footer', 120),
];

// ---------- Halaman hukum (teks bawaan ada di legal-content.js) ----------
const LEGAL_TITLES = { disclaimer: 'Halaman Disclaimer', privasi: 'Halaman Kebijakan Privasi' };
const groupMeta = {};
const legalFields = [];
for (const [page, def] of Object.entries(LEGAL)) {
  const group = LEGAL_TITLES[page];
  groupMeta[group] = {
    collapsible: true,
    link: def.path,
    note: 'Isi halaman ini harus sesuai dengan cara kerja aplikasi (data yang disimpan, moderasi, penggunaan IP). Ubah teksnya hanya bila perilakunya memang berubah, dan minta tinjauan hukum bila perlu. Tanggal "Terakhir diperbarui" ikut berubah otomatis.',
    help: true,
  };
  const L = (key, label, max, value, multiline = false) =>
    legalFields.push(f(`${page}.${key}`, group, label, max, { scope: page, default: value, multiline }));
  L('title', 'Judul halaman', 60, def.title);
  L('eyebrow', 'Label kecil di atas judul', 40, def.eyebrow);
  L('desc', 'Deskripsi untuk Google', 200, def.description);
  L('lead', 'Paragraf pembuka', 500, def.lead, true);
  def.sections.forEach((s, i) => {
    L(`s${i + 1}.h`, `Pasal ${i + 1}: judul`, 80, s.h);
    L(`s${i + 1}.b`, `Pasal ${i + 1}: isi`, 4000, s.b, true);
  });
}

module.exports = { fields: [...INDEX_FIELDS, ...legalFields], groupMeta };
