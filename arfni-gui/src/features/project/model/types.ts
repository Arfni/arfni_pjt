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

// ProjectState는 projectSlice.ts에 정의되어 있음

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