'use strict';

// Koneksi Postgres (Supabase). Aturan Supabase untuk serverless (pooler mode transaksi):
// satu koneksi per instance, tanpa prepared statement, SSL aktif.
const postgres = require('postgres');

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL belum diatur. Isi dengan connection string Supabase (lihat DEPLOY.md).');
  process.exit(1);
}

const sql = postgres(url, {
  max: Math.max(1, Number(process.env.PG_POOL_MAX) || 1),
  prepare: false,
  ssl: process.env.DATABASE_SSL === 'disable' ? false : 'require',
  idle_timeout: 20,
  connect_timeout: 10,
  onnotice: () => {},
  // BIGINT (id, waktu epoch ms, COUNT) dikembalikan sebagai angka JavaScript biasa
  types: { bigint: { to: 20, from: [20], serialize: (x) => String(x), parse: (x) => Number(x) } },
});

// Pembungkus bergaya prepared statement: stmt('SELECT ... $1').get(a) / .all(a) / .run(a)
// Semua metode async. Parameter memakai $1, $2, ... (beri cast ::bigint, ::text bila dipakai di "$1 IS NULL").
const exec = (text, params) => sql.unsafe(text, params.map((p) => (p === undefined ? null : p)));
function stmt(text) {
  return {
    get: async (...p) => (await exec(text, p))[0],
    all: async (...p) => [...(await exec(text, p))],
    run: async (...p) => ({ changes: (await exec(text, p)).count }),
  };
}

module.exports = { sql, stmt };
