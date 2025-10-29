import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

// ============= 프로젝트 관리 타입 (업데이트됨) =============
export interface Project {
  id: string;
  name: string;
  path: string;
  environment: 'local' | 'ec2'; // 새로 추가
  ec2_server_id?: string; // 새로 추가
  created_at: string;
  updated_at: string;
  stack_yaml_path?: string;
  description?: string;
}

// ============= EC2 서버 타입 (신규) =============
export interface EC2Server {
  id: string;
  name: string;
  host: string;
  user: string;
  pem_path: string;
  workdir?: string;
  mode?: 'all-in-one' | 'hybrid' | 'no-monitoring';
  created_at: string;
  updated_at: string;
  last_connected_at?: string;
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

// ============= 프로젝트 명령어 (업데이트됨) =============
export const projectCommands = {
  // 프로젝트 생성 (environment 추가)
  createProject: async (
    name: string,
    path: string,
    environment: 'local' | 'ec2',
    ec2ServerId?: string,
    description?: string
  ): Promise<Project> => {
    return await invoke('create_project', {
      name,
      path,
      environment,
      ec2ServerId,
      description,
    });
  },

  // 프로젝트 열기 (ID로)
  openProject: async (projectId: string): Promise<Project> => {
    return await invoke('open_project', { projectId });
  },

  // 프로젝트 경로로 열기
  openProjectByPath: async (path: string): Promise<Project> => {
    return await invoke('open_project_by_path', { path });
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

  // 모든 프로젝트 가져오기 (신규)
  getAllProjects: async (): Promise<Project[]> => {
    return await invoke('get_all_projects');
  },

  // 환경별 프로젝트 가져오기 (신규)
  getProjectsByEnvironment: async (environment: 'local' | 'ec2'): Promise<Project[]> => {
    return await invoke('get_projects_by_environment', { environment });
  },

  // 서버별 프로젝트 가져오기 (신규)
  getProjectsByServer: async (serverId: string): Promise<Project[]> => {
    return await invoke('get_projects_by_server', { serverId });
  },

  // 최근 프로젝트 목록
  getRecentProjects: async (): Promise<Project[]> => {
    return await invoke('get_recent_projects');
  },

  // 최근 프로젝트에 추가 (ID로)
  addToRecentProjects: async (projectId: string): Promise<void> => {
    return await invoke('add_to_recent_projects', { projectId });
  },

  // 최근 프로젝트 목록에서 제거 (ID로)
  removeFromRecentProjects: async (projectId: string): Promise<void> => {
    return await invoke('remove_from_recent_projects', { projectId });
  },

  // 프로젝트 완전 삭제 (ID로)
  deleteProject: async (projectId: string): Promise<void> => {
    return await invoke('delete_project', { projectId });
  },
};

// ============= EC2 서버 명령어 (신규) =============
export const ec2ServerCommands = {
  // EC2 서버 생성
  createServer: async (params: {
    name: string;
    host: string;
    user: string;
    pemPath: string;
    workdir?: string;
    mode?: 'all-in-one' | 'hybrid' | 'no-monitoring';
  }): Promise<EC2Server> => {
    return await invoke('create_ec2_server', {
      params: {
        name: params.name,
        host: params.host,
        user: params.user,
        pem_path: params.pemPath,  // snake_case로 변경
        workdir: params.workdir,
        mode: params.mode,
      }
    });
  },

  // 모든 EC2 서버 조회
  getAllServers: async (): Promise<EC2Server[]> => {
    return await invoke('get_all_ec2_servers');
  },

  // ID로 EC2 서버 조회
  getServerById: async (serverId: string): Promise<EC2Server> => {
    return await invoke('get_ec2_server_by_id', { serverId });
  },

  // EC2 서버 업데이트
  updateServer: async (params: {
    id: string;
    name?: string;
    host?: string;
    user?: string;
    pemPath?: string;
    workdir?: string;
    mode?: 'all-in-one' | 'hybrid' | 'no-monitoring';
  }): Promise<EC2Server> => {
    return await invoke('update_ec2_server', params);
  },

  // EC2 서버 삭제
  deleteServer: async (serverId: string): Promise<void> => {
    return await invoke('delete_ec2_server', { serverId });
  },

  // 마지막 접속 시간 업데이트
  updateLastConnected: async (serverId: string): Promise<void> => {
    return await invoke('update_ec2_server_last_connected', { serverId });
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

  // Docker 실행 확인
  checkDockerRunning: async (): Promise<boolean> => {
    return await invoke('check_docker_running');
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

// ============= 기존 SSH 명령어 (레거시 호환) =============
export interface SshParams {
  host: string;
  user: string;
  pemPath: string;
  cmd: string;
  [key: string]: unknown;
}

export const sshCommands = {
  execSystem: async (host: string, user: string, pemPath: string, cmd: string): Promise<string> => {
    return await invoke('ssh_exec_system', {
      params: {
        host,
        user,
        pem_path: pemPath,
        cmd,
      }
    });
  },

  // 레거시 (호환성 유지)
  addEntry: async (params: Omit<SshParams, 'cmd'>): Promise<void> => {
    return await invoke('ec2_add_entry', params);
  },

  readEntry: async (): Promise<SshParams[]> => {
    return await invoke('ec2_read_entry');
  },

  deleteEntry: async (host: string, user: string): Promise<void> => {
    return await invoke('ec2_delete_entry', { host, user });
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
