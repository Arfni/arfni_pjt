-- Migration 002: Add 'no-monitoring' option to mode field
-- SQLite doesn't support modifying CHECK constraints directly
-- So we need to recreate the table

-- Step 1: Create new table with updated constraint
CREATE TABLE IF NOT EXISTS ec2_servers_new (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    host TEXT NOT NULL,
    user TEXT NOT NULL,
    pem_path TEXT NOT NULL,
    workdir TEXT,
    mode TEXT CHECK(mode IN ('all-in-one', 'hybrid', 'no-monitoring', '')),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    last_connected_at TEXT,
    UNIQUE(host, user)
);

-- Step 2: Copy existing data
INSERT INTO ec2_servers_new
SELECT * FROM ec2_servers;

-- Step 3: Drop old table
DROP TABLE ec2_servers;

-- Step 4: Rename new table
ALTER TABLE ec2_servers_new RENAME TO ec2_servers;

-- Step 5: Recreate indexes
CREATE INDEX IF NOT EXISTS idx_ec2_servers_host ON ec2_servers(host);
CREATE INDEX IF NOT EXISTS idx_ec2_servers_updated_at ON ec2_servers(updated_at DESC);
