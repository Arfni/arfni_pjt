import { Node, Edge } from 'reactflow';

// React Flow 노드 타입들
export interface ServiceNodeData {
  id: string;
  name: string;
  kind?: 'docker.container' | 'k8s.pod';
  target?: string;
  image?: string;
  build?: string;
  ports?: string[];
  env?: Record<string, string>;
  dependsOn?: string[];
  serviceType?: 'react' | 'nextjs' | 'spring' | 'nodejs' | 'python' | 'fastapi' | 'custom';
  version?: string;
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
  target?: string;
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
export const createServiceNode = (data: Partial<ServiceNodeData>, position: { x: number; y: number }, defaultTarget?: string): CustomNode => ({
  id: data.id || `service-${Date.now()}`,
  type: 'service',
  position,
  data: {
    id: data.id || `service-${Date.now()}`,
    name: data.name || 'New Service',
    kind: data.kind || 'docker.container',
    target: data.target || defaultTarget || 'local',
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

export interface NginxNodeData {
  id: string;
  name: string;
  target?: string;
  listenPort: number;
  serverName: string;
  ssl: { enabled: boolean; certPath?: string; keyPath?: string };
  rateLimit: { enabled: boolean; rate: string; burst: number };
  cors: { enabled: boolean; origin: string };
  gzip: { enabled: boolean };
  cache: { enabled: boolean; maxAge: number };
  keepalive: number;
  loadBalancing: { method: 'round_robin' | 'least_conn' | 'ip_hash' };
}

export const createNginxNode = (
  data: Partial<NginxNodeData>,
  position: { x: number; y: number },
  defaultTarget?: string
): CustomNode => ({
  id: data.id || `nginx-${Date.now()}`,
  type: 'nginx' as any,
  position,
  data: {
    id: data.id || `nginx-${Date.now()}`,
    name: data.name || 'NGINX',
    target: data.target || defaultTarget || 'local',
    listenPort: data.listenPort ?? 80,
    serverName: data.serverName ?? '_',
    ssl: data.ssl ?? { enabled: false },
    rateLimit: data.rateLimit ?? { enabled: false, rate: '10r/s', burst: 20 },
    cors: data.cors ?? { enabled: false, origin: '*' },
    gzip: data.gzip ?? { enabled: false },
    cache: data.cache ?? { enabled: false, maxAge: 3600 },
    keepalive: data.keepalive ?? 32,
    loadBalancing: data.loadBalancing ?? { method: 'round_robin' },
    ...data,
  } as NginxNodeData,
});

export const createDatabaseNode = (data: Partial<DatabaseNodeData>, position: { x: number; y: number }, defaultTarget?: string): CustomNode => ({
  id: data.id || `database-${Date.now()}`,
  type: 'database',
  position,
  data: {
    ...data,
    id: data.id || `database-${Date.now()}`,
    name: data.name || 'New Database',
    type: data.type || 'postgres',
    target: data.target || defaultTarget || 'local',
  } as DatabaseNodeData,
});