-- リード保存に D1 を使う場合のテーブル定義
-- 作成手順:
--   npx wrangler d1 create kaisen-leads
--   （出力された database_id を wrangler.jsonc に貼る）
--   npx wrangler d1 execute kaisen-leads --remote --file=./schema.sql

CREATE TABLE IF NOT EXISTS leads (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at  TEXT    NOT NULL,
  name        TEXT,
  contact     TEXT,
  answers     TEXT,
  result      TEXT,
  asn         INTEGER,
  as_org      TEXT,
  connection  TEXT,
  colo        TEXT
);

CREATE INDEX IF NOT EXISTS idx_leads_created ON leads(created_at);
