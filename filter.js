'use strict';

// Filter konten untuk pesan Umum. Tujuannya MENAHAN pesan mencurigakan untuk ditinjau admin,
// bukan menolaknya: pengirim tetap mendapat balasan sukses, tetapi pesan belum tampil di feed.
// Hasil berupa daftar kode alasan: telepon, tautan, email, akun, kata.

// Kata yang ditahan secara bawaan. Admin bisa mengubahnya di tab Antrean.
const DEFAULT_WORDS = [
  'bangsat', 'bajingan', 'kontol', 'memek', 'pepek', 'ngentot', 'jancok', 'jancuk', 'asu', 'keparat',
  'anjing lu', 'anjing kau', 'mati aja', 'mampus', 'bunuh diri aja',
];

const LEET = { 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't', '@': 'a', $: 's', '!': 'i' };

// Huruf kecil, tanpa aksen, angka/simbol pengelabuan jadi huruf, selain huruf jadi spasi,
// huruf berulang 3x atau lebih dipadatkan ("kontooool" jadi "kontol"), huruf tunggal berderet digabung ("k o n t o l").
function wordTokens(text) {
  let s = String(text).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  s = s.replace(/[0134 57@$!]/g, (c) => LEET[c] ?? c);
  s = s.replace(/[^a-z]+/g, ' ').replace(/([a-z])\1{2,}/g, '$1').trim();
  const raw = s ? s.split(' ') : [];
  const out = [];
  let run = '';
  for (const t of raw) {
    if (t.length === 1) { run += t; continue; }
    if (run) { out.push(run); run = ''; }
    out.push(t);
  }
  if (run) out.push(run);
  return out;
}

function normalizeWordList(words) {
  return words.map((w) => wordTokens(w).join(' ')).filter(Boolean);
}

const PATTERNS = {
  // nomor Indonesia (0812..., +62 812..., 62812...) dengan spasi/titik/strip, atau 10+ angka berurutan
  telepon: /(?:\+?62|\b0)[\s.\-()]*8(?:[\s.\-()]*\d){8,12}|\d{10,}/,
  tautan: /(?:https?:\/\/|www\.)\S+|\b[a-z0-9-]+\.(?:com|net|org|id|co|me|io|link|xyz|ly|gl|be|app|site|online)\b/i,
  email: /[^\s@]+@[^\s@]+\.[a-z]{2,}/i,
  akun: /(?:^|\s)@[a-z0-9._]{3,30}|\b(?:ig|instagram|tiktok|wa|whatsapp|line|telegram|tele|snap|twitter)\s*[:=@]\s*\S+/i,
};

// words: daftar yang SUDAH dinormalisasi (lihat normalizeWordList)
function check(text, words) {
  const reasons = [];
  const s = String(text);
  for (const [code, re] of Object.entries(PATTERNS)) if (re.test(s)) reasons.push(code);
  if (words.length) {
    const tokens = wordTokens(s);
    const hay = ' ' + tokens.join(' ') + ' ';
    const hit = words.some(
      (w) => hay.includes(' ' + w + ' ') || (!w.includes(' ') && w.length >= 5 && tokens.some((t) => t.startsWith(w)))
    );
    if (hit) reasons.push('kata');
  }
  return reasons;
}

module.exports = { DEFAULT_WORDS, wordTokens, normalizeWordList, check };
