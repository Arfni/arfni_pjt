CREATE TABLE IF NOT EXISTS api_keys (
    id            TEXT PRIMARY KEY NOT NULL,
    provider      TEXT NOT NULL CHECK(provider IN ('openai','anthropic','google','etc')),
    label         TEXT NOT NULL,  -- 표시용 이름 (예: "개발용", "개인")
    key_cipher    BLOB NOT NULL,  -- 암호문
    nonce         BLOB NOT NULL,  -- AEAD Nonce (12 bytes)
    created_at    TEXT NOT NULL,
    updated_at    TEXT NOT NULL,
    last_used_at  TEXT,
    is_active     INTEGER NOT NULL DEFAULT 0,
    UNIQUE(provider, label)
);

CREATE INDEX IF NOT EXISTS idx_api_keys_active ON api_keys(is_active);