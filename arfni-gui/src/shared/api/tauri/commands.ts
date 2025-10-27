import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

// ============= 프로젝트 관리 타입 =============
export interface Project {
  id: string;
  name: string;
  path: string;
  created_at: string;
  updated_at: string;
  stack_yaml_path?: string;
  description?: string;
}

export interface StackYamlData {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  project_name: string;
  secrets: string[];
}

export interface CanvasNode {
  id: string;
  node_type: string; // "service", "target", "database"
  data: any;
  position: {
    x: number;
    y: number;
  };
}

export interface CanvasEdge {
  id: string;
  source: string;
  target: string;
}

// ============= 배포 관련 타입 =============
export interface DeploymentLog {
  timestamp: string;
  level: 'info' | 'warning' | 'error' | 'success';
  message: string;
  data?: any;
}

export interface DeploymentStatus {
  status: 'idle' | 'deploying' | 'success' | 'failed';
  message?: string;
  outputs?: Record<string, any>;
}

// ============= 파일 변경 이벤트 타입 =============
export interface FileChangePayload {
  path: string;
  event_type: 'modified' | 'created' | 'deleted';
}

// ============= 프로젝트 명령어 =============
export const projectCommands = {
  // 프로젝트 생성
  createProject: async (name: string, path: string, description?: string): Promise<Project> => {
    return await invoke('create_project', { name, path, description });
  },

  // 프로젝트 열기
  openProject: async (path: string): Promise<Project> => {
    return await invoke('open_project', { path });
  },

  // stack.yaml 저장
  saveStackYaml: async (
    projectPath: string,
    yamlContent: string,
    canvasData: StackYamlData
  ): Promise<void> => {
    return await invoke('save_stack_yaml', {
      projectPath,
      yamlContent,
      canvasData,
    });
  },

  // stack.yaml 읽기
  readStackYaml: async (projectPath: string): Promise<string> => {
    return await invoke('read_stack_yaml', { projectPath });
  },

  // Canvas 상태 불러오기
  loadCanvasState: async (projectPath: string): Promise<StackYamlData> => {
    return await invoke('load_canvas_state', { projectPath });
  },

  // 최근 프로젝트 목록
  getRecentProjects: async (): Promise<Project[]> => {
    return await invoke('get_recent_projects');
  },

  // 최근 프로젝트에 추가
  addToRecentProjects: async (project: Project): Promise<void> => {
    return await invoke('add_to_recent_projects', { project });
  },
};

// ============= 배포 명령어 =============
export const deploymentCommands = {
  // stack.yaml 검증
  validateStackYaml: async (yamlContent: string): Promise<boolean> => {
    return await invoke('validate_stack_yaml', { yamlContent });
  },

  // 배포 실행
  deployStack: async (projectPath: string, stackYamlPath: string): Promise<DeploymentStatus> => {
    return await invoke('deploy_stack', { projectPath, stackYamlPath });
  },

  // 배포 중단
  stopDeployment: async (): Promise<void> => {
    return await invoke('stop_deployment');
  },

  // Docker 설치 확인
  checkDocker: async (): Promise<boolean> => {
    return await invoke('check_docker');
  },

  // Docker Compose 설치 확인
  checkDockerCompose: async (): Promise<boolean> => {
    return await invoke('check_docker_compose');
  },
};

// ============= 파일 감시 명령어 =============
export const fileWatcherCommands = {
  // stack.yaml 감시 시작
  watchStackYaml: async (projectPath: string): Promise<void> => {
    return await invoke('watch_stack_yaml', { projectPath });
  },

  // 감시 중지
  stopWatching: async (projectPath: string): Promise<void> => {
    return await invoke('stop_watching', { projectPath });
  },
};

// ============= 이벤트 리스너 =============
export const eventListeners = {
  // stack.yaml 파일 변경 이벤트
  onStackYamlChanged: (callback: (payload: FileChangePayload) => void) => {
    return listen<FileChangePayload>('stack-yaml-changed', (event) => {
      callback(event.payload);
    });
  },

  // 배포 시작 이벤트
  onDeploymentStarted: (callback: (payload: DeploymentStatus) => void) => {
    return listen<DeploymentStatus>('deployment-started', (event) => {
      callback(event.payload);
    });
  },

  // 배포 로그 이벤트
  onDeploymentLog: (callback: (payload: DeploymentLog) => void) => {
    return listen<DeploymentLog>('deployment-log', (event) => {
      callback(event.payload);
    });
  },

  // 배포 완료 이벤트
  onDeploymentCompleted: (callback: (payload: DeploymentStatus) => void) => {
    return listen<DeploymentStatus>('deployment-completed', (event) => {
      callback(event.payload);
    });
  },

  // 배포 실패 이벤트
  onDeploymentFailed: (callback: (payload: DeploymentStatus) => void) => {
    return listen<DeploymentStatus>('deployment-failed', (event) => {
      callback(event.payload);
    });
  },
};

// ============= 기존 SSH 명령어 (유지) =============
export interface SshParams {
  host: string;
  user: string;
  pemPath: string;
  cmd: string;
}

export const sshCommands = {
  execSystem: async (params: SshParams): Promise<string> => {
    return await invoke('ssh_exec_system', params);
  },

  addEntry: async (params: Omit<SshParams, 'cmd'>): Promise<void> => {
    return await invoke('ec2_add_entry', params);
  },

  readEntry: async (): Promise<SshParams[]> => {
    return await invoke('ec2_read_entry');
  },

  deleteEntry: async (host: string): Promise<void> => {
    return await invoke('ec2_delete_entry', { host });
  },
};

// ============= 플러그인 명령어 (유지) =============
export const pluginCommands = {
  runPlugin: async (plugin: string): Promise<string> => {
    return await invoke('run_plugin', { plugin });
  },

  listTargets: async (): Promise<string[]> => {
    return await invoke('list_targets');
  },

  readPlugins: async (): Promise<any> => {
    return await invoke('read_plugins');
  },
};