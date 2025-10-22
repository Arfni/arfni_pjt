import { useState, useEffect } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { tauriCommands, type LogEntry } from './commands';

// 로그 스트림 훅
export function useLogStream() {
  const [logs, setLogs] = useState<LogEntry[]>([]);

  useEffect(() => {
    const unsubscribe = tauriCommands.subscribeToLogs((log) => {
      setLogs(prev => [...prev, log]);
    });

    return () => {
      unsubscribe.then(fn => fn());
    };
  }, []);

  const clearLogs = () => setLogs([]);

  return { logs, clearLogs };
}

// 스택 검증 훅
export function useStackValidation() {
  return useMutation({
    mutationFn: (yaml: string) => tauriCommands.validateStack(yaml),
  });
}

// 스택 배포 훅
export function useStackDeployment() {
  return useMutation({
    mutationFn: (yaml: string) => tauriCommands.runStack(yaml),
  });
}

// 파일 읽기 훅
export function useFileRead(path: string | null) {
  return useQuery({
    queryKey: ['file', path],
    queryFn: () => path ? tauriCommands.readFile(path) : null,
    enabled: !!path,
  });
}

// 프로젝트 정보 훅
export function useProjectInfo() {
  return useQuery({
    queryKey: ['project-info'],
    queryFn: () => tauriCommands.getProjectInfo(),
  });
}