-- Migration 007: Add persistent_session column to ec2_servers table
-- Keep remote work running through disconnects by wrapping SSH sessions with tmux; disabled by default

ALTER TABLE ec2_servers ADD COLUMN persistent_session INTEGER NOT NULL DEFAULT 0;
