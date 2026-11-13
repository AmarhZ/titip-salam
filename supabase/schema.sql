-- Skema Titip Salam untuk Postgres (Supabase).
-- Jalankan sekali di Supabase: SQL Editor, tempel seluruh isi berkas ini, lalu Run.
-- Aman dijalankan ulang (semua pakai IF NOT EXISTS).
--
-- Waktu disimpan sebagai epoch milidetik (BIGINT) supaya sama dengan versi SQLite sebelumnya.

CREATE TABLE IF NOT EXISTS confessions (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  mode          TEXT    NOT NULL CHECK (mode IN ('personal', 'public')),
  to_name       TEXT    NOT NULL,
  from_name     TEXT,
  message       TEXT    NOT NULL,
  token_hash    TEXT    UNIQUE,            -- hanya mode personal: SHA-256 dari token link
  created_at    BIGINT  NOT NULL,
  hidden        INTEGER NOT NULL DEFAULT 0,
  hidden_reason TEXT,                      -- auto | admin | filter:<alasan>
  expires_at    BIGINT,                    -- hanya mode personal, boleh kosong
  delete_hash   TEXT                       -- hanya mode public: SHA-256 dari rahasia kode hapus
);
CREATE INDEX IF NOT EXISTS idx_confessions_feed ON confessions (mode, hidden, id DESC);
CREATE INDEX IF NOT EXISTS idx_confessions_expiry ON confessions (expires_at) WHERE expires_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS reports (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  confession_id BIGINT  NOT NULL,
  reporter_hash TEXT    NOT NULL,          -- HMAC dari IP, bukan IP
  reason        TEXT    NOT NULL,
  detail        TEXT,
  created_at    BIGINT  NOT NULL,
  UNIQUE (confession_id, reporter_hash)
);

CREATE TABLE IF NOT EXISTS admin_log (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  action        TEXT    NOT NULL,
  confession_id BIGINT  NOT NULL,          -- hanya ID (0 untuk perubahan konten); isi pesan tidak dicatat
  at            BIGINT  NOT NULL,
  actor         TEXT                       -- nama admin; kosong = otomatis oleh sistem
);

CREATE TABLE IF NOT EXISTS site_content (
  key        TEXT PRIMARY KEY,
  value      TEXT   NOT NULL,
  updated_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Pembatas kirim yang dipakai bersama semua instance serverless.
-- "key" adalah HMAC dari IP + nama pembatas (bukan IP). Dibersihkan otomatis oleh cron harian.
CREATE TABLE IF NOT EXISTS rate_hits (
  key TEXT   NOT NULL,
  at  BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_rate_hits ON rate_hits (key, at);

-- Keamanan: aplikasi mengakses database langsung dari server (peran "postgres", melewati RLS).
-- RLS tanpa kebijakan + pencabutan hak peran API Supabase memastikan tabel TIDAK bisa dibaca
-- lewat API publik Supabase (anon / authenticated), meski kunci anon bocor.
ALTER TABLE confessions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE reports      ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_log    ENABLE ROW LEVEL SECURITY;
ALTER TABLE site_content ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings     ENABLE ROW LEVEL SECURITY;
ALTER TABLE rate_hits    ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON ALL TABLES    IN SCHEMA public FROM anon;
    REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON ALL TABLES    IN SCHEMA public FROM authenticated;
    REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM authenticated;
  END IF;
END $$;
