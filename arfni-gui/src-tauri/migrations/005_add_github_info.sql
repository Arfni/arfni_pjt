-- Migration 005: Add GitHub repository information to projects
-- GitHub 레포지토리 연동을 위한 컬럼 추가

ALTER TABLE projects ADD COLUMN github_repo_url TEXT;
ALTER TABLE projects ADD COLUMN github_branch TEXT DEFAULT 'main';
ALTER TABLE projects ADD COLUMN github_access_token TEXT;

-- GitHub 프로젝트를 위한 인덱스
CREATE INDEX idx_projects_github ON projects(github_repo_url) WHERE github_repo_url IS NOT NULL;
