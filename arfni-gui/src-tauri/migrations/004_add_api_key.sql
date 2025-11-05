-- 004_add_api_key.sql
PRAGMA foreign_keys = OFF;

-- api_keys 테이블이 없으면 생성 (평문 api_key 버전)
CREATE TABLE IF NOT EXISTS api_keys (
    id            TEXT PRIMARY KEY NOT NULL,
    provider      TEXT NOT NULL CHECK(provider IN ('openai','anthropic','google','etc')),
    label         TEXT NOT NULL,
    api_key       TEXT NOT NULL,
    created_at    TEXT NOT NULL,
    updated_at    TEXT NOT NULL,
    last_used_at  TEXT,
    is_active     INTEGER NOT NULL DEFAULT 0,
    UNIQUE(provider, label)
);

-- 인덱스도 존재 시 재생성 안 함
CREATE INDEX IF NOT EXISTS idx_api_keys_active ON api_keys(is_active);

PRAGMA foreign_keys = ON;
