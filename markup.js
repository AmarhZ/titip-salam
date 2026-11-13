'use strict';

// Format teks sederhana untuk halaman hukum yang bisa diedit dari admin.
// Semua teks di-escape lebih dulu, lalu hanya konstruksi di bawah yang diubah menjadi HTML:
//
//   Baris kosong          memisahkan paragraf
//   - item                daftar (setiap baris "- " = satu butir)
//   **tebal**             <strong>
//   *miring*              <em>
//   [teks](/halaman#id)   tautan internal, atau [teks](https://situs.id) tautan luar
//   {{CONTACT}}           email kontak (tautan mailto, atau placeholder bila belum diatur)
//   {{UPDATED}}           tanggal pembaruan terakhir
//
// Tautan hanya boleh diawali "/", "#", "http://", atau "https://". Selain itu tampil sebagai teks.

const escapeHtml = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

function inline(text, ctx = {}) {
  let s = escapeHtml(text);

  s = s.replace(/\[([^\]\n]+)\]\(([^)\s]+)\)/g, (match, label, url) => {
    // url sudah ter-escape (tanda kutip tidak bisa keluar dari atribut)
    const allowed = /^(\/(?![\/\\])|#|https?:\/\/)/.test(url) && !/[\\*_]/.test(url);
    if (!allowed) return match;
    const external = /^https?:/.test(url);
    return `<a href="${url}"${external ? ' target="_blank" rel="noopener noreferrer"' : ''}>${label}</a>`;
  });
  s = s.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(^|[^*\w])\*([^*\n]+)\*(?![*\w])/g, '$1<em>$2</em>');

  // token (isinya dibuat server, bukan input pengguna)
  s = s.replaceAll('{{CONTACT}}', ctx.contact || '');
  s = s.replaceAll('{{UPDATED}}', escapeHtml(ctx.updated || ''));
  return s;
}

function blocks(text, ctx = {}) {
  const out = [];
  let para = [];
  let list = [];
  const flushPara = () => {
    if (para.length) out.push(`<p>${inline(para.join(' '), ctx)}</p>`);
    para = [];
  };
  const flushList = () => {
    if (list.length) out.push('<ul>' + list.map((i) => `<li>${inline(i, ctx)}</li>`).join('') + '</ul>');
    list = [];
  };
  for (const raw of String(text).replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trim();
    if (!line) { flushPara(); flushList(); continue; }
    const item = /^-\s+(.+)$/.exec(line);
    if (item) { flushPara(); list.push(item[1]); }
    else { flushList(); para.push(line); }
  }
  flushPara();
  flushList();
  return out.join('\n');
}

module.exports = { escapeHtml, inline, blocks };
