-- Migration 003: Move mode and workdir from ec2_servers to projects
-- Reason: mode and workdir are project-specific, not server-specific
-- Multiple projects can share the same EC2 server with different settings

-- Add mode and workdir to projects table
ALTER TABLE projects ADD COLUMN mode TEXT CHECK(mode IN ('all-in-one', 'hybrid', 'no-monitoring', '') OR mode IS NULL);
ALTER TABLE projects ADD COLUMN workdir TEXT;

-- Note: SQLite doesn't support DROP COLUMN in older versions
-- Instead, we'll create a new ec2_servers table without mode/workdir and migrate data

-- Create new ec2_servers table without mode/workdir
CREATE TABLE ec2_servers_new (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    host TEXT NOT NULL UNIQUE,
    user TEXT NOT NULL,
    pem_path TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    last_connected_at TEXT,
    UNIQUE(host, user)
);

-- Copy data from old table (excluding mode and workdir)
INSERT INTO ec2_servers_new (id, name, host, user, pem_path, created_at, updated_at, last_connected_at)
SELECT id, name, host, user, pem_path, created_at, updated_at, last_connected_at
FROM ec2_servers;

-- Drop old table
DROP TABLE ec2_servers;

-- Rename new table to original name
ALTER TABLE ec2_servers_new RENAME TO ec2_servers;
