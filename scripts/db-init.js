'use strict';
// Menjalankan supabase/schema.sql lewat DATABASE_URL (alternatif dari menempelnya di SQL Editor).
//   DATABASE_URL=... npm run db:init
const fs = require('node:fs');
const path = require('node:path');
const { sql } = require('../db');

(async () => {
  const file = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'schema.sql'), 'utf8');
  await sql.unsafe(file);
  console.log('Skema siap.');
  await sql.end();
})().catch((err) => {
  console.error('Gagal membuat skema:', err.message);
  process.exit(1);
});
