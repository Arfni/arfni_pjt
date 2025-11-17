-- Migration 006: Add stack_yaml column to projects table
-- This allows storing stack.yaml content directly in the database for GitHub projects

ALTER TABLE projects ADD COLUMN stack_yaml TEXT;