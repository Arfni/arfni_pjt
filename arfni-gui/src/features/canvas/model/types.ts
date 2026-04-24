import { Node, Edge } from 'reactflow';

// Service 노드 타입
export interface ServiceNodeData {
  name: string;
  serviceType?: string; // 서비스 타입 (spring, fastapi, django, nodejs, react, nextjs, etc.)
  kind?: 'docker.container';
  image?: string;
  build?: string;
  ports?: string[];
  env?: Record<string, string>;
  volumes?: Array<{
    host: string;
    mount: string;
  }>;
  command?: string[];
  dependsOn?: string[];
  health?: {
    httpGet?: {
      path: string;
      port: number;
    };
    tcp?: {
      port: number;
    };
  };
  target?: string;
  properties?: Record<string, any>; // Plugin-specific properties for buildConfig
  // Additional service-specific fields
  [key: string]: any;
}

// Target 노드 타입
export interface TargetNodeData {
  name: string;
  type: 'docker-desktop' | 'ec2.ssh';
  host?: string;
  user?: string;
  sshKey?: string;
  port?: number;
  workdir?: string;
  mode?: 'all-in-one' | 'hybrid' | 'no-monitoring';
}

// Database 노드 타입
export interface DatabaseNodeData {
  name: string;
  type: 'postgres' | 'mysql' | 'redis' | 'mongodb';
  version?: string;
  ports?: string[];
  env?: Record<string, string>;
  volumes?: Array<{
    host: string;
    mount: string;
  }>;
  target?: string;
  health?: {
    tcp?: {
      port: number;
    };
  };
}

// NGINX 게이트웨이 노드 타입
export interface NginxNodeData {
  name: string;
  target?: string;
  listenPort: number;
  serverName: string;
  ssl: {
    enabled: boolean;
    auto?: boolean;
    email?: string;
    certPath?: string;
    keyPath?: string;
  };
  rateLimit: {
    enabled: boolean;
    rate: string;
    burst: number;
  };
  cors: {
    enabled: boolean;
    origin: string;
  };
  gzip: {
    enabled: boolean;
  };
  cache: {
    enabled: boolean;
    maxAge: number;
  };
  keepalive: number;
  loadBalancing: {
    method: 'round_robin' | 'least_conn' | 'ip_hash';
  };
}

// 엣지 라우팅 메타데이터 (서비스 → NGINX 연결 시 경로 설정)
export interface EdgeRouteData {
  route?: string; // location 경로 (예: /api/, /)
}

// 커스텀 노드 타입
export type CustomNodeData = ServiceNodeData | TargetNodeData | DatabaseNodeData | NginxNodeData;

export interface CustomNode extends Node {
  type: 'service' | 'target' | 'database' | 'nginx';
  data: any; // Use any for flexibility in node data access
}

// 노드 템플릿 타입
export interface NodeTemplate {
  type: string;
  category: 'service' | 'database' | 'target' | 'nginx';
}

// Type aliases for backward compatibility
export type CanvasNode = CustomNode;
export type CanvasEdge = Edge;

// Canvas State
export interface CanvasState {
  nodes: CustomNode[];
  edges: Edge[];
  selectedNodeId: string | null;
  selectedEdgeId: string | null;
  selectedTemplate: NodeTemplate | null; // 선택된 컴포넌트 템플릿
  isDirty: boolean;
}

// Stack YAML 타입
export interface StackYaml {
  apiVersion: string;
  name: string;
  metadata?: {
    monitoring?: {
      mode?: string;
    };
  };
  targets: Record<string, Omit<TargetNodeData, 'name'>>;
  secrets?: string[];
  services: Record<string, {
    kind: string;
    target: string;
    spec: Omit<ServiceNodeData | DatabaseNodeData, 'name' | 'target'>;
  }>;
  outputs?: Record<string, string>;
}