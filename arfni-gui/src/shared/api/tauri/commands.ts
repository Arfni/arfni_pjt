import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

export interface StackYaml {
  apiVersion: string;
  name: string;
  targets: Record<string, any>;
  services: Record<string, any>;
  secrets?: string[];
  outputs?: Record<string, string>;
}

export interface DeploymentResult {
  success: boolean;
  message: string;
  outputs?: Record<string, string>;
}

export interface LogEntry {
  timestamp: string;
  level: 'INFO' | 'ERROR' | 'SUCCESS' | 'WARN';
  message: string;
}

// Tauri 명령어들
export const tauriCommands = {
  // 스택 검증
  validateStack: async (yaml: string): Promise<{ valid: boolean; errors?: string[] }> => {
    return await invoke('validate_stack', { yaml });
  },

  // 스택 실행
  runStack: async (yaml: string): Promise<DeploymentResult> => {
    return await invoke('run_stack', { yaml });
  },

  // 스택 생성 (템플릿에서)
  generateStack: async (template: string, params: Record<string, any>): Promise<string> => {
    return await invoke('generate_stack', { template, params });
  },

  // 로그 스트림 구독
  subscribeToLogs: (callback: (log: LogEntry) => void) => {
    return listen<LogEntry>('log_stream', (event) => {
      callback(event.payload);
    });
  },

  // 파일 시스템 작업
  readFile: async (path: string): Promise<string> => {
    return await invoke('read_file', { path });
  },

  writeFile: async (path: string, content: string): Promise<void> => {
    return await invoke('write_file', { path, content });
  },

  // 프로젝트 정보
  getProjectInfo: async (): Promise<{ name: string; version: string }> => {
    return await invoke('get_project_info');
  },
};