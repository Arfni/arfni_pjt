-- ARFNI Database Schema v1.0
-- 프로젝트, EC2 서버, 최근 프로젝트 관리

-- ============================================
-- EC2 서버 테이블
-- ============================================
CREATE TABLE IF NOT EXISTS ec2_servers (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    host TEXT NOT NULL,
    user TEXT NOT NULL,
    pem_path TEXT NOT NULL,
    workdir TEXT,
    mode TEXT CHECK(mode IN ('all-in-one', 'hybrid', '')),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    last_connected_at TEXT,
    UNIQUE(host, user)
);

CREATE INDEX idx_ec2_servers_host ON ec2_servers(host);
CREATE INDEX idx_ec2_servers_updated_at ON ec2_servers(updated_at DESC);

-- ============================================
-- 프로젝트 테이블
-- ============================================
CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    path TEXT NOT NULL UNIQUE,
    environment TEXT NOT NULL CHECK(environment IN ('local', 'ec2')),
    ec2_server_id TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    description TEXT,
    stack_yaml_path TEXT,
    FOREIGN KEY (ec2_server_id) REFERENCES ec2_servers(id) ON DELETE SET NULL
);

CREATE INDEX idx_projects_environment ON projects(environment);
CREATE INDEX idx_projects_ec2_server ON projects(ec2_server_id);
CREATE INDEX idx_projects_updated_at ON projects(updated_at DESC);

-- ============================================
-- 최근 프로젝트 테이블
-- ============================================
CREATE TABLE IF NOT EXISTS recent_projects (
    project_id TEXT PRIMARY KEY NOT NULL,
    opened_at TEXT NOT NULL,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE INDEX idx_recent_opened_at ON recent_projects(opened_at DESC);
