'use strict';

const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const { sql, stmt } = require('./db');
const express = require('express');
const { fields: CONTENT_SCHEMA, groupMeta: GROUP_META } = require('./content-schema');
const LEGAL = require('./legal-content');
const markup = require('./markup');
const contentFilter = require('./filter');

// ---------- Konfigurasi ----------
const PORT = Number(process.env.PORT) || 3000;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data'); // hanya untuk garam rahasia saat pengembangan lokal
const ON_VERCEL = !!process.env.VERCEL;
// Di Vercel semua permintaan lewat proxy, jadi IP pengguna harus dibaca dari X-Forwarded-For
const TRUST_PROXY = process.env.TRUST_PROXY === '1' || ON_VERCEL;
// Admin: ADMIN_TOKENS="nama:token,nama2:token2" (tiap orang punya token sendiri, namanya tercatat di riwayat)
// atau ADMIN_TOKEN tunggal (tercatat sebagai "admin"). Kosong semua = admin nonaktif.
const ADMINS = [];
for (const part of String(process.env.ADMIN_TOKENS || '').split(',')) {
  const i = part.indexOf(':');
  const name = part.slice(0, i).trim();
  const token = part.slice(i + 1).trim();
  if (i > 0 && /^[\w .-]{1,30}$/.test(name) && token.length >= 12) ADMINS.push({ name, token });
}
if (process.env.ADMIN_TOKEN) ADMINS.push({ name: 'admin', token: process.env.ADMIN_TOKEN });
const ADMIN_ENABLED = ADMINS.length > 0;
const CRON_SECRET = process.env.CRON_SECRET || '';
const TURNSTILE_SITE_KEY = process.env.TURNSTILE_SITE_KEY || '';
const TURNSTILE_SECRET = process.env.TURNSTILE_SECRET || '';
const TURNSTILE_ON = !!(TURNSTILE_SITE_KEY && TURNSTILE_SECRET);
const TURNSTILE_VERIFY_URL = process.env.TURNSTILE_VERIFY_URL || 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const EXPIRY_DAYS = new Set(['0', '7', '30', '90']); // masa berlaku link Personal (0 = tanpa batas)
const DAY = 24 * 3600 * 1000;
const CONTACT_EMAIL = process.env.CONTACT_EMAIL || '';
const AUTO_HIDE_AT = Math.max(1, Number(process.env.AUTO_HIDE_AT) || 3); // jumlah pelapor berbeda
const LIMITS = { to: 40, from: 40, message: 1000, minMessage: 5, detail: 300 };
const PAGE_SIZE = 12;
const LEGAL_UPDATED = '13 November 2026';
const REPORT_REASONS = {
  pelecehan: 'Pelecehan atau ancaman',
  data_pribadi: 'Membocorkan data pribadi',
  kebencian: 'Ujaran kebencian (SARA)',
  seksual: 'Konten seksual atau melibatkan anak',
  spam: 'Spam atau penipuan',
  lainnya: 'Lainnya',
};

// ---------- Database (Postgres / Supabase, skema di supabase/schema.sql) ----------
const insertStmt = stmt(
  `INSERT INTO confessions (mode, to_name, from_name, message, token_hash, created_at, expires_at, delete_hash)
   VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`
);
const bySecretStmt = stmt(
  `SELECT id, to_name, from_name, message, created_at, hidden, expires_at FROM confessions
   WHERE mode = 'personal' AND token_hash = $1`
);
const publicByIdStmt = stmt(`SELECT id FROM confessions WHERE mode = 'public' AND id = $1`);
const feedStmt = stmt(
  `SELECT id, to_name, from_name, message, created_at FROM confessions
   WHERE mode = 'public' AND hidden = 0 AND ($1::bigint IS NULL OR id < $1::bigint)
   ORDER BY id DESC LIMIT $2`
);
const feedSearchStmt = stmt(
  `SELECT id, to_name, from_name, message, created_at FROM confessions
   WHERE mode = 'public' AND hidden = 0 AND to_name ILIKE $1 ESCAPE '\\' AND ($2::bigint IS NULL OR id < $2::bigint)
   ORDER BY id DESC LIMIT $3`
);
const insertReportStmt = stmt(
  `INSERT INTO reports (confession_id, reason, detail, reporter_hash, created_at)
   VALUES ($1, $2, $3, $4, $5) ON CONFLICT (confession_id, reporter_hash) DO NOTHING`
);
const countReportsStmt = stmt('SELECT COUNT(*) AS n FROM reports WHERE confession_id = $1');
const hideStmt = stmt('UPDATE confessions SET hidden = 1, hidden_reason = $1 WHERE id = $2');
const autoHideStmt = stmt(`UPDATE confessions SET hidden = 1, hidden_reason = 'auto' WHERE id = $1 AND hidden = 0`);
const logStmt = stmt('INSERT INTO admin_log (action, confession_id, at, actor) VALUES ($1, $2, $3, $4)');
const logListStmt = stmt('SELECT id, action, confession_id, at, actor FROM admin_log ORDER BY id DESC LIMIT 60');
const logAction = (action, confessionId, actor = null) => logStmt.run(action, confessionId, Date.now(), actor);

const settingGetStmt = stmt('SELECT value FROM settings WHERE key = $1');
const settingSetStmt = stmt('INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value');
const queueCountStmt = stmt("SELECT COUNT(*) AS n FROM confessions WHERE hidden = 1 AND hidden_reason LIKE 'filter:%'");
const queueListStmt = stmt(
  `SELECT id, to_name, from_name, message, hidden_reason, created_at FROM confessions
   WHERE hidden = 1 AND hidden_reason LIKE 'filter:%' ORDER BY id DESC LIMIT 100`
);
const duplicateStmt = stmt(
  `SELECT COUNT(*) AS n FROM confessions WHERE mode = 'public' AND message = $1 AND created_at >= $2`
);
const deleteInfoStmt = stmt(`SELECT id, delete_hash FROM confessions WHERE mode = 'public' AND id = $1`);
const purgeReportsStmt = stmt(
  'DELETE FROM reports WHERE confession_id IN (SELECT id FROM confessions WHERE expires_at IS NOT NULL AND expires_at < $1)'
);
const purgeStmt = stmt('DELETE FROM confessions WHERE expires_at IS NOT NULL AND expires_at < $1');

const statsStmt = stmt(
  `SELECT COUNT(*) AS total,
          COALESCE(SUM((mode = 'public')::int), 0)   AS pub,
          COALESCE(SUM((mode = 'personal')::int), 0) AS per,
          COALESCE(SUM((hidden = 1)::int), 0)        AS hid,
          COALESCE(SUM((created_at >= $1::bigint)::int), 0) AS last24
   FROM confessions`
);
const pendingStmt = stmt('SELECT COUNT(DISTINCT confession_id) AS n FROM reports');
const reports24Stmt = stmt('SELECT COUNT(*) AS n FROM reports WHERE created_at >= $1');
const dailyStmt = stmt(
  `SELECT to_char(to_timestamp((created_at / 1000) + $1::bigint) AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS day,
          COALESCE(SUM((mode = 'public')::int), 0) AS pub, COALESCE(SUM((mode = 'personal')::int), 0) AS per
   FROM confessions WHERE created_at >= $2::bigint GROUP BY 1 ORDER BY 1`
);
const adminBrowseStmt = stmt(
  `SELECT c.id, c.mode, c.to_name, c.from_name, c.message, c.hidden, c.hidden_reason, c.created_at,
          (SELECT COUNT(*) FROM reports r WHERE r.confession_id = c.id) AS report_count
   FROM confessions c
   WHERE ($1::bigint IS NULL OR c.id < $1::bigint)
     AND ($2::text IS NULL OR c.mode = $2::text)
     AND ($3::int IS NULL OR c.hidden = $3::int)
     AND ($4::text IS NULL OR (c.mode = 'public' AND c.to_name ILIKE $4::text ESCAPE '\\'))
   ORDER BY c.id DESC LIMIT $5`
);
const restoreStmt = stmt('UPDATE confessions SET hidden = 0, hidden_reason = NULL WHERE id = $1');
const deleteReportsStmt = stmt('DELETE FROM reports WHERE confession_id = $1');
const deleteConfessionStmt = stmt('DELETE FROM confessions WHERE id = $1');
const confessionExistsStmt = stmt('SELECT id FROM confessions WHERE id = $1');
const adminListStmt = stmt(
  `SELECT c.id, c.mode, c.to_name, c.from_name, c.message, c.hidden, c.hidden_reason, c.created_at,
          COUNT(r.id) AS report_count, MAX(r.created_at) AS last_report_at
   FROM confessions c JOIN reports r ON r.confession_id = c.id
   GROUP BY c.id ORDER BY last_report_at DESC LIMIT 100`
);
const reportsForIdsStmt = stmt(
  'SELECT confession_id, reason, detail, created_at FROM reports WHERE confession_id = ANY($1::bigint[]) ORDER BY id'
);

const rateCountStmt = stmt('SELECT COUNT(*) AS n FROM rate_hits WHERE key = $1 AND at > $2');
const rateInsertStmt = stmt('INSERT INTO rate_hits (key, at) VALUES ($1, $2)');
const rateCleanupStmt = stmt('DELETE FROM rate_hits WHERE at < $1');

// ID dari pengguna harus bilangan bulat positif yang aman (kolom BIGINT menolak angka di luar jangkauan)
const asId = (v) => {
  const n = Number.parseInt(String(v ?? ''), 10);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
};

// ---------- Util ----------
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
const newToken = () => crypto.randomBytes(18).toString('base64url'); // 144 bit, tidak bisa ditebak

// Garam rahasia untuk menandai pelapor dan pembatas kirim tanpa menyimpan IP mentah.
// Di Vercel wajib lewat variabel lingkungan REPORT_SALT (disk tidak permanen).
const REPORT_SALT = (() => {
  if (process.env.REPORT_SALT) {
    if (process.env.REPORT_SALT.length < 16) {
      console.error('REPORT_SALT terlalu pendek (minimal 16 karakter). Buat dengan: openssl rand -hex 32');
      process.exit(1);
    }
    return process.env.REPORT_SALT;
  }
  if (ON_VERCEL) {
    console.error('REPORT_SALT belum diatur. Buat dengan: openssl rand -hex 32, lalu isi di Environment Variables Vercel.');
    process.exit(1);
  }
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const file = path.join(DATA_DIR, '.report-salt');
  try {
    return fs.readFileSync(file, 'utf8').trim();
  } catch {
    const s = crypto.randomBytes(32).toString('hex');
    fs.writeFileSync(file, s, { mode: 0o600 });
    return s;
  }
})();
const hmac = (s) => crypto.createHmac('sha256', REPORT_SALT).update(String(s)).digest('hex');
const reporterHash = (ip) => hmac(ip);

function clean(value, max) {
  if (typeof value !== 'string') return '';
  // buang karakter kontrol, rapikan spasi
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, max);
}

// Pembatas kirim yang disimpan di database (dipakai bersama semua instance serverless).
// Yang disimpan hanya HMAC dari IP + nama pembatas, bukan IP-nya.
function makeLimiter(name, windowMs, max, message) {
  return async (req, res, next) => {
    const now = Date.now();
    const key = hmac(`${name}:${req.ip}`);
    const { n } = await rateCountStmt.get(key, now - windowMs);
    if (n >= max) {
      res.set('Retry-After', String(Math.ceil(windowMs / 1000)));
      return res.status(429).json({ error: message });
    }
    await rateInsertStmt.run(key, now);
    if (Math.random() < 0.01) rateCleanupStmt.run(now - 2 * 3600 * 1000).catch(() => {}); // pembersihan kecil-kecilan
    next();
  };
}
const confessLimiter = makeLimiter('confess', 60 * 60 * 1000, 8, 'Terlalu banyak confess dalam waktu singkat. Coba lagi nanti ya.');
const reportLimiter = makeLimiter('report', 60 * 60 * 1000, 10, 'Terlalu banyak laporan dalam waktu singkat. Coba lagi nanti ya.');
const deleteLimiter = makeLimiter('delete', 60 * 60 * 1000, 10, 'Terlalu banyak percobaan. Coba lagi nanti ya.');
const adminLimiter = makeLimiter('admin', 60 * 1000, 120, 'Terlalu banyak permintaan.');

// ---------- Konten landing page yang bisa diedit ----------
// Teks bawaan diambil dari elemen ber-atribut data-cms di views/index.html.
// (Bukan di public/: di Vercel isi public/ dilayani CDN dan akan melewati render server ini.)
const INDEX_TEMPLATE = fs.readFileSync(path.join(__dirname, 'views', 'index.html'), 'utf8');
const SCHEMA_BY_KEY = new Map(CONTENT_SCHEMA.map((f) => [f.key, f]));

const escapeHtml = (s) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const unescapeHtml = (s) =>
  s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');

// Pola untuk menemukan elemen/atribut milik satu kunci
function contentPattern(field) {
  const k = field.key.replace(/\./g, '\\.');
  return field.attr
    ? new RegExp(`(<meta\\b[^>]*?\\b${field.attr}=")([^"]*)("[^>]*\\bdata-cms="${k}")`)
    : new RegExp(`(<([a-z][a-z0-9]*)\\b[^>]*\\bdata-cms="${k}"[^>]*>)([^<]*)(</\\2>)`);
}

// Teks multi-baris (halaman hukum): LF saja, ujung baris dirapikan, maksimal satu baris kosong berturut-turut
const normalizeMultiline = (s) =>
  s.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
    .replace(/[ \t]+$/gm, '').replace(/\n{3,}/g, '\n\n').trim();

const CONTENT_DEFAULTS = new Map();
for (const field of CONTENT_SCHEMA) {
  if (field.default !== undefined) {
    CONTENT_DEFAULTS.set(field.key, field.multiline ? normalizeMultiline(field.default) : field.default);
    continue;
  }
  const m = INDEX_TEMPLATE.match(contentPattern(field));
  if (!m) {
    console.warn(`Peringatan: bidang konten "${field.key}" tidak ditemukan di views/index.html (diabaikan).`);
    continue;
  }
  const raw = field.attr ? m[2] : m[3];
  CONTENT_DEFAULTS.set(field.key, unescapeHtml(raw).replace(/\s+/g, ' ').trim());
}

const contentRowsStmt = stmt('SELECT key, value, updated_at FROM site_content');
const CONTENT_UPSERT_SQL =
  `INSERT INTO site_content (key, value, updated_at) VALUES ($1, $2, $3)
   ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at`;

// Tanpa cache di memori: tiap instance serverless punya memori sendiri, jadi cache akan basi
// setelah admin menyimpan. Satu query kecil per tampilan halaman sudah cukup.
const contentRows = () => contentRowsStmt.all();
const rowsToMap = (rows) => new Map(rows.map((r) => [r.key, r.value]));
const currentOverrides = async () => rowsToMap(await contentRows());

async function renderIndex() {
  const over = await currentOverrides();
  let html = INDEX_TEMPLATE;
  for (const field of CONTENT_SCHEMA) {
    if (field.scope || !over.has(field.key) || !CONTENT_DEFAULTS.has(field.key)) continue;
    const value = escapeHtml(over.get(field.key)); // selalu di-escape: aman dari XSS
    html = html.replace(contentPattern(field), field.attr
      ? (m, a, b, c) => a + value + c
      : (m, a, tag, inner, close) => a + value + close);
  }
  return html;
}
// ---------- Halaman hukum: dirender dari teks bawaan + perubahan di admin ----------
const CONTACT_HTML = /^[^\s<>"'&@]+@[^\s<>"'&@]+\.[^\s<>"'&@]+$/.test(CONTACT_EMAIL)
  ? `<a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a>`
  : '<strong>[email kontak belum diatur]</strong>';
if (!CONTACT_EMAIL) console.warn('Peringatan: CONTACT_EMAIL belum diatur, halaman hukum menampilkan placeholder.');

const LEGAL_TEMPLATE = fs.readFileSync(path.join(__dirname, 'views', 'legal.html'), 'utf8');

function legalUpdatedLabel(name, rows) {
  const m = Math.max(0, ...rows.filter((r) => r.key.startsWith(name + '.')).map((r) => r.updated_at));
  if (!m) return LEGAL_UPDATED;
  return new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Jakarta' }).format(new Date(m));
}

async function renderLegal(name) {
  const rows = await contentRows();
  const over = rowsToMap(rows);
  const get = (key) => (over.has(`${name}.${key}`) ? over.get(`${name}.${key}`) : CONTENT_DEFAULTS.get(`${name}.${key}`));
  const other = name === 'disclaimer' ? 'privasi' : 'disclaimer';
  const ctx = { contact: CONTACT_HTML, updated: legalUpdatedLabel(name, rows) };
  const sections = LEGAL[name].sections
    .map((sec, i) => {
      const n = i + 1;
      return `    <h2 id="${sec.id}">${n}. ${markup.escapeHtml(get(`s${n}.h`))}</h2>\n` +
        markup.blocks(get(`s${n}.b`), ctx).split('\n').map((l) => '    ' + l).join('\n');
    })
    .join('\n\n');
  const plain = {
    title: get('title'), description: get('desc'), eyebrow: get('eyebrow'),
    updated: ctx.updated, other_href: LEGAL[other].path, other_label: over.get(`${other}.title`) || CONTENT_DEFAULTS.get(`${other}.title`),
  };
  const raw = { lead: markup.inline(get('lead'), ctx), sections };
  return LEGAL_TEMPLATE
    .replace(/\{\{@(\w+)\}\}/g, (m, k) => markup.escapeHtml(plain[k] ?? ''))
    .replace(/\{\{!(\w+)\}\}/g, (m, k) => raw[k] ?? '');
}

async function sendIndex(res, status = 200) {
  res.status(status).set('Cache-Control', 'no-cache').type('html').send(await renderIndex());
}

// Catat laporan; sembunyikan otomatis bila ambang terlewati
async function fileReport(confessionId, mode, req) {
  const body = req.body || {};
  const reason = typeof body.reason === 'string' ? body.reason : '';
  if (!Object.hasOwn(REPORT_REASONS, reason)) return { status: 400, error: 'Pilih alasan laporan dulu.' };
  const detail = clean(body.detail, LIMITS.detail) || null;

  await insertReportStmt.run(confessionId, reason, detail, reporterHash(req.ip), Date.now());
  const { n } = await countReportsStmt.get(confessionId);
  // Pesan Personal hanya punya satu pembaca, jadi satu laporan dari penerimanya cukup.
  const threshold = mode === 'personal' ? 1 : AUTO_HIDE_AT;
  if (n >= threshold && (await autoHideStmt.run(confessionId)).changes > 0) await logAction('auto_hide', confessionId);
  return { status: 200 };
}

// ---------- Filter konten dan pembersihan ----------
const DEFAULT_WORDS_TEXT = contentFilter.DEFAULT_WORDS.join('\n');
async function filterWordsText() {
  const row = await settingGetStmt.get('filter.words');
  return row ? row.value : DEFAULT_WORDS_TEXT;
}
// Tanpa cache di memori (lihat catatan di bagian konten): daftar kata dibaca dari database tiap pengiriman
const filterWords = async () => contentFilter.normalizeWordList((await filterWordsText()).split('\n'));

// Pesan Personal yang masa berlakunya habis dihapus permanen. Dijalankan cron harian (/api/cron/purge).
async function purgeExpired() {
  const now = Date.now();
  await purgeReportsStmt.run(now);
  const { changes } = await purgeStmt.run(now);
  await rateCleanupStmt.run(now - 2 * 3600 * 1000);
  return changes;
}

// Turnstile (opsional): diverifikasi di server, gagal = ditolak
async function verifyTurnstile(token, ip) {
  if (typeof token !== 'string' || !token || token.length > 2048) return false;
  try {
    const r = await fetch(TURNSTILE_VERIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ secret: TURNSTILE_SECRET, response: token, remoteip: String(ip || '') }),
      signal: AbortSignal.timeout(5000),
    });
    const j = await r.json();
    return j.success === true;
  } catch {
    return false;
  }
}

// Kode hapus untuk pengirim pesan Umum: "<id>-XXXX-XXXX-XXXX". Hanya hash bagian rahasianya yang disimpan.
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function newDeleteSecret() {
  const bytes = crypto.randomBytes(12);
  return Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
}
const formatDeleteCode = (id, secret) => `${id}-${secret.slice(0, 4)}-${secret.slice(4, 8)}-${secret.slice(8, 12)}`;
function parseDeleteCode(input) {
  const m = /^(\d{1,9})-([A-Z2-9-]{12,16})$/.exec(String(input || '').toUpperCase().replace(/\s+/g, ''));
  return m ? { id: Number(m[1]), secret: m[2].replace(/-/g, '') } : null;
}
const safeEqualHex = (a, b) => {
  const x = Buffer.from(a, 'hex'), y = Buffer.from(b, 'hex');
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

// ---------- App ----------
const app = express();
app.disable('x-powered-by');
if (TRUST_PROXY) app.set('trust proxy', 1);

app.use((req, res, next) => {
  res.set({
    'Content-Security-Policy':
      "default-src 'self'; style-src 'self' https://fonts.googleapis.com; " +
      "font-src https://fonts.gstatic.com; img-src 'self' data:; " +
      `script-src 'self'${TURNSTILE_ON ? ' https://challenges.cloudflare.com' : ''}; connect-src 'self'; ` +
      (TURNSTILE_ON ? 'frame-src https://challenges.cloudflare.com; ' : '') +
      "base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'X-Frame-Options': 'DENY',
  });
  next();
});
// Body kecil untuk semua rute; hanya penyimpanan konten admin yang boleh lebih besar
const jsonSmall = express.json({ limit: '10kb' });
const jsonLarge = express.json({ limit: '256kb' });
app.use((req, res, next) => (req.path === '/api/admin/content' ? jsonLarge : jsonSmall)(req, res, next));

// Cek kesehatan (untuk memastikan database tersambung). Tidak membocorkan detail.
app.get('/api/health', async (req, res) => {
  res.set('Cache-Control', 'no-store');
  try {
    await sql`SELECT 1`;
    res.json({ ok: true });
  } catch (err) {
    console.error('Health check gagal:', err.message);
    res.status(503).json({ ok: false });
  }
});

// Pembersihan harian oleh Vercel Cron. Dilindungi CRON_SECRET (dikirim Vercel sebagai Authorization: Bearer ...).
app.get('/api/cron/purge', async (req, res) => {
  res.set('Cache-Control', 'no-store');
  const given = crypto.createHash('sha256').update(req.get('authorization') || '').digest();
  const want = crypto.createHash('sha256').update(`Bearer ${CRON_SECRET}`).digest();
  if (!CRON_SECRET || !crypto.timingSafeEqual(given, want)) return res.status(401).json({ error: 'Tidak diizinkan.' });
  res.json({ ok: true, purged: await purgeExpired() });
});

// Pengaturan publik untuk frontend
app.get('/api/config', (req, res) => {
  res.set('Cache-Control', 'no-cache');
  res.json({ turnstileSiteKey: TURNSTILE_ON ? TURNSTILE_SITE_KEY : null });
});

// Kirim confess
app.post('/api/confess', confessLimiter, async (req, res) => {
  const body = req.body || {};

  // honeypot: bot biasanya mengisi kolom tersembunyi ini
  if (typeof body.website === 'string' && body.website.length > 0) {
    return res.status(201).json({ ok: true });
  }

  const mode = body.mode === 'personal' ? 'personal' : body.mode === 'public' ? 'public' : null;
  const to = clean(body.to, LIMITS.to);
  const from = clean(body.from, LIMITS.from);
  const message = clean(body.message, LIMITS.message);

  if (!mode) return res.status(400).json({ error: 'Pilih mode confess dulu.' });
  if (!to) return res.status(400).json({ error: 'Isi dulu untuk siapa confess ini.' });
  if (message.length < LIMITS.minMessage) {
    return res.status(400).json({ error: 'Pesannya terlalu singkat. Tulis sedikit lebih panjang ya.' });
  }
  const expiry = String(body.expiry ?? '0');
  if (mode === 'personal' && !EXPIRY_DAYS.has(expiry)) {
    return res.status(400).json({ error: 'Pilihan masa berlaku link tidak valid.' });
  }

  if (TURNSTILE_ON && !(await verifyTurnstile(body.turnstile, req.ip))) {
    return res.status(400).json({ error: 'Verifikasi anti-spam gagal. Selesaikan verifikasinya lalu coba lagi.' });
  }

  const now = Date.now();

  if (mode === 'personal') {
    const token = newToken();
    const expiresAt = expiry === '0' ? null : now + Number(expiry) * DAY;
    await insertStmt.run('personal', to, from || null, message, sha256(token), now, expiresAt, null);
    // hanya hash yang disimpan; token asli cuma dikirim sekali ke pengirim
    return res.status(201).json({ ok: true, mode, path: `/r/${token}`, expiresAt });
  }

  const secret = newDeleteSecret();
  const { id } = await insertStmt.get('public', to, from || null, message, null, now, null, sha256(secret));

  // Pesan Umum yang mencurigakan ditahan untuk ditinjau (tidak ditolak, tidak tampil di feed)
  const reasons = new Set([
    ...contentFilter.check(`${to}\n${from}\n${message}`, await filterWords()),
  ]);
  if ((await duplicateStmt.get(message, now - 3600 * 1000)).n > 1) reasons.add('duplikat');
  const held = reasons.size > 0;
  if (held) {
    await hideStmt.run('filter:' + [...reasons].join(','), id);
    await logAction('filter_hold', id);
  }
  return res.status(201).json({ ok: true, mode, id, held, deleteCode: formatDeleteCode(id, secret) });
});

// Hapus pesan Umum oleh pengirimnya (dengan kode hapus yang diberikan saat mengirim)
app.post('/api/delete', deleteLimiter, async (req, res) => {
  const fail = () => res.status(404).json({ error: 'Kode tidak cocok. Periksa lagi kodenya.' });
  const parsed = parseDeleteCode(req.body && req.body.code);
  if (!parsed) return fail();
  const row = await deleteInfoStmt.get(parsed.id);
  if (!row || !row.delete_hash || !safeEqualHex(row.delete_hash, sha256(parsed.secret))) return fail();
  await deleteReportsStmt.run(row.id);
  await deleteConfessionStmt.run(row.id);
  await logAction('sender_delete', row.id);
  res.json({ ok: true });
});

// Feed umum (mode personal dan pesan tersembunyi TIDAK pernah muncul di sini)
app.get('/api/feed', async (req, res) => {
  const q = clean(String(req.query.q || ''), LIMITS.to);
  const cursor = asId(req.query.before);

  let rows;
  if (q) {
    const like = `%${q.replace(/[\\%_]/g, (c) => '\\' + c)}%`;
    rows = await feedSearchStmt.all(like, cursor, PAGE_SIZE + 1);
  } else {
    rows = await feedStmt.all(cursor, PAGE_SIZE + 1);
  }
  const hasMore = rows.length > PAGE_SIZE;
  if (hasMore) rows = rows.slice(0, PAGE_SIZE);

  res.set('Cache-Control', 'no-cache');
  res.json({
    items: rows.map((r) => ({
      id: r.id,
      to: r.to_name,
      from: r.from_name,
      message: r.message,
      createdAt: r.created_at,
    })),
    next: hasMore ? rows[rows.length - 1].id : null,
  });
});

// Daftar alasan laporan (dipakai dialog di frontend)
app.get('/api/report-reasons', (req, res) => {
  res.json(Object.entries(REPORT_REASONS).map(([value, label]) => ({ value, label })));
});

// Laporkan confess umum
app.post('/api/report/:id', reportLimiter, async (req, res) => {
  const id = asId(req.params.id);
  if (id === null || !(await publicByIdStmt.get(id))) {
    return res.status(404).json({ error: 'Confess tidak ditemukan.' });
  }
  const r = await fileReport(id, 'public', req);
  if (r.error) return res.status(r.status).json({ error: r.error });
  res.json({ ok: true });
});

// Baca confess personal lewat token
app.get('/api/secret/:token', async (req, res) => {
  const token = String(req.params.token || '');
  res.set({ 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow, noarchive' });
  if (!/^[A-Za-z0-9_-]{20,40}$/.test(token)) return res.status(404).json({ error: 'Link tidak ditemukan.' });
  const row = await bySecretStmt.get(sha256(token));
  if (!row) return res.status(404).json({ error: 'Link tidak ditemukan.' });
  if (row.expires_at && row.expires_at <= Date.now()) {
    return res.status(410).json({ error: 'Link ini sudah kedaluwarsa.', expired: true });
  }
  if (row.hidden) {
    return res.status(410).json({ error: 'Pesan ini sudah dilaporkan dan disembunyikan.', hidden: true });
  }
  res.json({ to: row.to_name, from: row.from_name, message: row.message, createdAt: row.created_at, expiresAt: row.expires_at });
});

// Laporkan confess personal (oleh pemegang link)
app.post('/api/secret/:token/report', reportLimiter, async (req, res) => {
  const token = String(req.params.token || '');
  res.set({ 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow, noarchive' });
  if (!/^[A-Za-z0-9_-]{20,40}$/.test(token)) return res.status(404).json({ error: 'Link tidak ditemukan.' });
  const row = await bySecretStmt.get(sha256(token));
  if (!row || (row.expires_at && row.expires_at <= Date.now())) return res.status(404).json({ error: 'Link tidak ditemukan.' });
  const r = await fileReport(row.id, 'personal', req);
  if (r.error) return res.status(r.status).json({ error: r.error });
  res.json({ ok: true });
});

// ---------- Admin (aktif hanya bila ADMIN_TOKENS / ADMIN_TOKEN diatur) ----------
const adminDigests = ADMINS.map((a) => ({ name: a.name, digest: crypto.createHash('sha256').update(a.token).digest() }));
function adminAuth(req, res, next) {
  if (!ADMIN_ENABLED) return res.status(404).json({ error: 'Tidak ditemukan.' });
  const m = /^Bearer (.+)$/.exec(req.get('authorization') || '');
  const given = crypto.createHash('sha256').update(m ? m[1] : '').digest();
  let who = null;
  for (const a of adminDigests) if (crypto.timingSafeEqual(given, a.digest) && !who) who = a.name; // cek semua, tanpa keluar lebih awal
  if (!who) return res.status(401).json({ error: 'Tidak diizinkan.' });
  req.admin = who;
  res.set('Cache-Control', 'no-store');
  next();
}
app.use('/api/admin', adminLimiter, adminAuth);

app.get('/api/admin/reports', async (req, res) => {
  const rows = await adminListStmt.all();
  // satu query untuk semua laporan (hindari N+1 query ke database)
  const reps = rows.length ? await reportsForIdsStmt.all(`{${rows.map((r) => r.id).join(',')}}`) : [];
  const items = rows.map((r) => ({
    id: r.id,
    mode: r.mode,
    to: r.to_name,
    from: r.from_name,
    message: r.message,
    hidden: !!r.hidden,
    hiddenReason: r.hidden_reason,
    createdAt: r.created_at,
    reportCount: r.report_count,
    lastReportAt: r.last_report_at,
    reports: reps.filter((x) => x.confession_id === r.id).map((x) => ({ reason: x.reason, detail: x.detail, at: x.created_at })),
  }));
  res.json({ items });
});

async function adminTarget(req, res) {
  const id = asId(req.params.id);
  if (id === null || !(await confessionExistsStmt.get(id))) {
    res.status(404).json({ error: 'Confess tidak ditemukan.' });
    return null;
  }
  return id;
}
app.post('/api/admin/confessions/:id/hide', async (req, res) => {
  const id = await adminTarget(req, res);
  if (id === null) return;
  await hideStmt.run('admin', id);
  await logAction('hide', id, req.admin);
  res.json({ ok: true });
});
// restore = tampilkan lagi dan hapus laporannya (laporan dianggap sudah ditinjau)
app.post('/api/admin/confessions/:id/restore', async (req, res) => {
  const id = await adminTarget(req, res);
  if (id === null) return;
  await restoreStmt.run(id);
  await deleteReportsStmt.run(id);
  await logAction('restore', id, req.admin);
  res.json({ ok: true });
});
app.delete('/api/admin/confessions/:id', async (req, res) => {
  const id = await adminTarget(req, res);
  if (id === null) return;
  await deleteReportsStmt.run(id);
  await deleteConfessionStmt.run(id);
  await logAction('delete', id, req.admin);
  res.json({ ok: true });
});

// Antrean: pesan Umum yang ditahan filter otomatis
app.get('/api/admin/queue', async (req, res) => {
  res.json({
    items: (await queueListStmt.all()).map((r) => ({
      id: r.id, mode: 'public', to: r.to_name, from: r.from_name, message: r.message,
      hidden: true, hiddenReason: r.hidden_reason, createdAt: r.created_at,
      filterReasons: String(r.hidden_reason).slice(7).split(',').filter(Boolean),
    })),
  });
});
app.post('/api/admin/confessions/:id/approve', async (req, res) => {
  const id = await adminTarget(req, res);
  if (id === null) return;
  await restoreStmt.run(id);
  await logAction('approve', id, req.admin);
  res.json({ ok: true });
});

app.get('/api/admin/filter', async (req, res) => {
  res.json({ words: await filterWordsText(), isDefault: !(await settingGetStmt.get('filter.words')), defaultWords: DEFAULT_WORDS_TEXT });
});
app.put('/api/admin/filter', async (req, res) => {
  const raw = req.body && req.body.words;
  if (typeof raw !== 'string') return res.status(400).json({ error: 'Format data tidak valid.' });
  const lines = [...new Set(raw.replace(/\r\n?/g, '\n').split('\n').map((l) => clean(l, 40)).filter(Boolean))];
  if (lines.length > 300) return res.status(400).json({ error: 'Maksimal 300 kata.' });
  await settingSetStmt.run('filter.words', lines.join('\n'));
  await logAction('filter_update', 0, req.admin);
  res.json({ ok: true, count: lines.length });
});

// Ringkasan angka dan grafik 7 hari. ?tz = selisih zona waktu peramban dalam menit (mis. 420 untuk UTC+7)
app.get('/api/admin/stats', async (req, res) => {
  const now = Date.now();
  const tzMin = Number.parseInt(String(req.query.tz || '0'), 10);
  const offset = (Number.isFinite(tzMin) ? Math.max(-840, Math.min(840, tzMin)) : 0) * 60;
  const t = await statsStmt.get(now - 24 * 3600 * 1000);
  // mulai dari awal hari (zona peramban) 6 hari lalu
  const startLocal = Math.floor((now / 1000 + offset) / 86400) * 86400 - 6 * 86400;
  const daily = await dailyStmt.all(offset, (startLocal - offset) * 1000);
  res.json({
    total: t.total,
    public: t.pub,
    personal: t.per,
    hidden: t.hid,
    last24h: t.last24,
    pendingReview: (await pendingStmt.get()).n,
    queue: (await queueCountStmt.get()).n,
    admin: req.admin,
    reports24h: (await reports24Stmt.get(now - 24 * 3600 * 1000)).n,
    daily: daily.map((d) => ({ day: d.day, public: d.pub, personal: d.per })),
  });
});

// Telusuri semua pesan. Isi pesan Personal TIDAK ditampilkan kecuali sudah dilaporkan
// (sesuai Kebijakan Privasi: pengelola hanya membaca pesan yang dilaporkan).
app.get('/api/admin/confessions', async (req, res) => {
  const view = String(req.query.view || 'all');
  const mode = view === 'public' || view === 'personal' ? view : null;
  const hid = view === 'hidden' ? 1 : null;
  const q = clean(String(req.query.q || ''), LIMITS.to);
  const like = q ? `%${q.replace(/[\\%_]/g, (c) => '\\' + c)}%` : null;
  const cursor = asId(req.query.before);
  const limit = 20;

  let rows = await adminBrowseStmt.all(cursor, mode, hid, like, limit + 1);
  const hasMore = rows.length > limit;
  if (hasMore) rows = rows.slice(0, limit);

  res.json({
    items: rows.map((r) => {
      const masked = r.mode === 'personal' && r.report_count === 0;
      return {
        id: r.id,
        mode: r.mode,
        masked,
        to: masked ? null : r.to_name,
        from: masked ? null : r.from_name,
        message: masked ? null : r.message,
        hidden: !!r.hidden,
        hiddenReason: r.hidden_reason,
        createdAt: r.created_at,
        reportCount: r.report_count,
      };
    }),
    next: hasMore ? rows[rows.length - 1].id : null,
  });
});

// Konten landing page: ambil semua bidang beserta nilai saat ini dan bawaannya
app.get('/api/admin/content', async (req, res) => {
  const over = await currentOverrides();
  const groups = [];
  for (const field of CONTENT_SCHEMA) {
    if (!CONTENT_DEFAULTS.has(field.key)) continue;
    let g = groups.find((x) => x.name === field.group);
    if (!g) groups.push((g = { name: field.group, fields: [], ...(GROUP_META[field.group] || {}) }));
    const def = CONTENT_DEFAULTS.get(field.key);
    const custom = over.has(field.key);
    g.fields.push({
      key: field.key,
      label: field.label,
      max: field.max,
      multiline: !!field.multiline,
      default: def,
      value: custom ? over.get(field.key) : def,
      custom,
    });
  }
  res.json({ groups });
});

// Simpan perubahan: {values: {kunci: teks}}. Teks kosong atau sama dengan bawaan = kembali ke bawaan.
app.put('/api/admin/content', async (req, res) => {
  const values = req.body && req.body.values;
  if (!values || typeof values !== 'object' || Array.isArray(values)) {
    return res.status(400).json({ error: 'Format data tidak valid.' });
  }
  const plan = [];
  for (const [key, raw] of Object.entries(values)) {
    const field = SCHEMA_BY_KEY.get(key);
    if (!field || !CONTENT_DEFAULTS.has(key)) return res.status(400).json({ error: `Bidang tidak dikenal: ${key}` });
    if (typeof raw !== 'string') return res.status(400).json({ error: `Isi "${field.label}" harus berupa teks.` });
    const value = field.multiline
      ? normalizeMultiline(raw)
      : clean(raw.replace(/\s*[\r\n]+\s*/g, ' '), 2000).replace(/\s{2,}/g, ' ');
    if (value.length > field.max) {
      return res.status(400).json({ error: `"${field.label}" terlalu panjang (maksimal ${field.max} karakter).` });
    }
    plan.push([key, value]);
  }

  let changed = 0;
  await sql.begin(async (tx) => {
    for (const [key, value] of plan) {
      if (!value || value === CONTENT_DEFAULTS.get(key)) await tx.unsafe('DELETE FROM site_content WHERE key = $1', [key]);
      else await tx.unsafe(CONTENT_UPSERT_SQL, [key, value, Date.now()]);
      changed++;
    }
  });
  if (changed) await logAction('content_update', 0, req.admin);
  res.json({ ok: true, changed });
});

// Riwayat tindakan moderasi (hanya ID dan jenis tindakan)
app.get('/api/admin/log', async (req, res) => {
  res.json({
    items: (await logListStmt.all()).map((r) => ({ id: r.id, action: r.action, confessionId: r.confession_id, at: r.at, actor: r.actor })),
  });
});

// ---------- Halaman ----------
// Halaman baca link rahasia (tidak boleh diindeks)
app.get('/r/:token', (req, res) => {
  res.set({ 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow, noarchive' });
  res.sendFile(path.join(__dirname, 'public', 'read.html'));
});

// Halaman admin: tidak diindeks (API-nya tetap dilindungi ADMIN_TOKEN)
app.use(['/admin', '/admin.html'], (req, res, next) => {
  res.set({ 'X-Robots-Tag': 'noindex, nofollow, noarchive', 'Cache-Control': 'no-store' });
  next();
});
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));

// Landing page dirender di server supaya teks hasil edit admin langsung tampil (tanpa kedipan)
app.get(['/', '/index.html'], async (req, res) => sendIndex(res));

app.get(['/disclaimer', '/privasi'], async (req, res) => {
  res.set('Cache-Control', 'no-cache').type('html').send(await renderLegal(req.path.slice(1)));
});

app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'], maxAge: '1h' }));

app.use('/api', (req, res) => res.status(404).json({ error: 'Tidak ditemukan.' }));
app.use(async (req, res) => sendIndex(res, 404));

app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Pesan terlalu besar.' });
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Format data tidak valid.' });
  console.error(err);
  res.status(500).json({ error: 'Terjadi kesalahan di server.' });
});

if (require.main === module) {
  app.listen(PORT, () => console.log(`Titip Salam berjalan di http://localhost:${PORT}`));
}
module.exports = app;
