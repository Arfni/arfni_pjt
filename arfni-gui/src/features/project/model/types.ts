export interface Project {
  id: string;
  name: string;
  path: string;
  createdAt: string;
  updatedAt: string;
  stackYamlPath?: string;
  description?: string;
  status?: 'idle' | 'deploying' | 'deployed' | 'error';
  lastDeployment?: {
    timestamp: string;
    status: 'success' | 'failure';
    message?: string;
    outputs?: Record<string, string>;
  };
}

export interface ProjectState {
  currentProject: Project | null;
  recentProjects: Project[];
  isLoading: boolean;
  error: string | null;
}

export interface CreateProjectParams {
  name: string;
  path: string;
  description?: string;
}

export interface DeploymentLog {
  timestamp: string;
  level: 'info' | 'warning' | 'error' | 'success';
  message: string;
  data?: any;
}