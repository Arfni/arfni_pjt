import { Node, Edge } from 'reactflow';

// React Flow 노드 타입들
export interface ServiceNodeData {
  id: string;
  name: string;
  kind: 'docker.container' | 'k8s.pod';
  target: string;
  image?: string;
  build?: string;
  ports?: string[];
  env?: Record<string, string>;
  dependsOn?: string[];
}

export interface TargetNodeData {
  id: string;
  name: string;
  type: 'docker-desktop' | 'ec2.ssh' | 'k3s';
  host?: string;
  user?: string;
  sshKey?: string;
  workdir?: string;
}

export interface DatabaseNodeData {
  id: string;
  name: string;
  type: 'postgres' | 'mysql' | 'redis' | 'mongodb';
  version?: string;
  ports?: string[];
  volumes?: Array<{ host: string; mount: string }>;
}

// 노드 타입 정의
export type CustomNode =
  | Node<ServiceNodeData, 'service'>
  | Node<TargetNodeData, 'target'>
  | Node<DatabaseNodeData, 'database'>;

// 엣지 타입 정의
export interface ConnectionEdgeData {
  source: string;
  target: string;
  mode: 'public' | 'tunnel';
  port?: number;
}

export interface DependencyEdgeData {
  source: string;
  target: string;
  type: 'depends_on';
}

export type CustomEdge =
  | Edge<ConnectionEdgeData>
  | Edge<DependencyEdgeData>;

// 노드 생성 헬퍼
export const createServiceNode = (data: Partial<ServiceNodeData>, position: { x: number; y: number }): CustomNode => ({
  id: data.id || `service-${Date.now()}`,
  type: 'service',
  position,
  data: {
    id: data.id || `service-${Date.now()}`,
    name: data.name || 'New Service',
    kind: data.kind || 'docker.container',
    target: data.target || 'local',
    ...data,
  } as ServiceNodeData,
});

export const createTargetNode = (data: Partial<TargetNodeData>, position: { x: number; y: number }): CustomNode => ({
  id: data.id || `target-${Date.now()}`,
  type: 'target',
  position,
  data: {
    id: data.id || `target-${Date.now()}`,
    name: data.name || 'New Target',
    type: data.type || 'docker-desktop',
    ...data,
  } as TargetNodeData,
});

export const createDatabaseNode = (data: Partial<DatabaseNodeData>, position: { x: number; y: number }): CustomNode => ({
  id: data.id || `database-${Date.now()}`,
  type: 'database',
  position,
  data: {
    id: data.id || `database-${Date.now()}`,
    name: data.name || 'New Database',
    type: data.type || 'postgres',
    ...data,
  } as DatabaseNodeData,
});