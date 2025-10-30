import { Edge } from 'reactflow';
import {
  CustomNode,
  StackYaml,
  ServiceNodeData,
  TargetNodeData,
  DatabaseNodeData
} from '../model/types';

export interface StackGeneratorOptions {
  projectName: string;
  environment?: 'local' | 'ec2';
  ec2Server?: {
    id: string;
    name: string;
    host: string;
    user: string;
    pem_path: string;
  };
  mode?: string; // 프로젝트별 모니터링 모드 (ec2Server가 아닌 프로젝트에서)
  workdir?: string; // 프로젝트별 작업 디렉토리
  secrets?: string[];
  outputs?: Record<string, string>;
}

/**
 * Canvas의 노드와 엣지를 stack.yaml 형식으로 변환
 */
export function stackYamlGenerator(
  nodes: CustomNode[],
  edges: Edge[],
  options: StackGeneratorOptions
): StackYaml {
  const { projectName, environment = 'local', ec2Server, mode, workdir, secrets = [], outputs = {} } = options;

  // Target 노드 추출
  const targetNodes = nodes.filter(n => n.type === 'target');
  const targets: Record<string, Omit<TargetNodeData, 'name'>> = {};

  // Target 노드가 있으면 사용
  targetNodes.forEach(node => {
    const data = node.data as TargetNodeData;
    const { name, ...targetConfig } = data;
    targets[name.toLowerCase().replace(/\s+/g, '-')] = targetConfig;
  });

  // Target 노드가 없으면 environment에 따라 기본 target 생성
  if (Object.keys(targets).length === 0) {
    if (environment === 'ec2' && ec2Server) {
      // EC2 서버 정보로 target 생성
      // workdir: options에서 받아서 사용 (프로젝트별 설정)
      let formattedWorkdir = workdir || 'arfni-deploy';

      // 절대 경로가 아니면 /home/{user}/ 붙이기
      if (!formattedWorkdir.startsWith('/')) {
        formattedWorkdir = `/home/${ec2Server.user}/${formattedWorkdir}`;
      }

      targets['ec2'] = {
        type: 'ec2.ssh',
        host: ec2Server.host,
        user: ec2Server.user,
        sshKey: ec2Server.pem_path,
        workdir: formattedWorkdir,
      };
    } else if (environment === 'ec2') {
      // EC2 서버 정보 없으면 기본값
      targets['ec2'] = {
        type: 'ec2.ssh'
      };
    } else {
      // Local 프로젝트
      targets['local'] = {
        type: 'docker-desktop'
      };
    }
  }

  // Service와 Database 노드 추출
  const serviceNodes = nodes.filter(n => n.type === 'service' || n.type === 'database');
  const services: StackYaml['services'] = {};

  serviceNodes.forEach(node => {
    const data = node.data as ServiceNodeData | DatabaseNodeData;
    const serviceName = data.name.toLowerCase().replace(/\s+/g, '-');

    // 이 서비스에 연결된 의존성 찾기
    const dependencies = findDependencies(node.id, edges, nodes);

    // 서비스 타입 결정
    let kind = 'docker.container';
    if ('kind' in data && data.kind) {
      kind = data.kind;
    }

    // 서비스 스펙 생성
    const spec: any = {};

    // Database 노드인 경우 이미지 자동 설정
    if (node.type === 'database') {
      const dbData = data as DatabaseNodeData;
      switch (dbData.type) {
        case 'mysql':
          spec.image = `mysql:${dbData.version || '8.0'}`;
          // MySQL 기본 환경변수 추가
          spec.env = {
            MYSQL_ROOT_PASSWORD: '${MYSQL_ROOT_PASSWORD}',
            MYSQL_DATABASE: 'app',
            ...dbData.env
          };
          // 기본 볼륨 설정
          spec.volumes = dbData.volumes || [
            { host: `./.arfni/data/mysql`, mount: '/var/lib/mysql' }
          ];
          // 기본 헬스체크
          spec.health = dbData.health || { tcp: { port: 3306 } };
          break;
        case 'postgres':
          spec.image = `postgres:${dbData.version || '15'}`;
          spec.env = {
            POSTGRES_PASSWORD: '${POSTGRES_PASSWORD}',
            POSTGRES_DB: 'app',
            ...dbData.env
          };
          spec.volumes = dbData.volumes || [
            { host: `./.arfni/data/postgres`, mount: '/var/lib/postgresql/data' }
          ];
          spec.health = dbData.health || { tcp: { port: 5432 } };
          break;
        case 'redis':
          spec.image = `redis:${dbData.version || '7'}`;
          spec.command = ['redis-server', '--appendonly', 'yes'];
          spec.volumes = dbData.volumes || [
            { host: `./.arfni/data/redis`, mount: '/data' }
          ];
          spec.health = dbData.health || { tcp: { port: 6379 } };
          break;
        case 'mongodb':
          spec.image = `mongo:${dbData.version || '6'}`;
          spec.env = {
            MONGO_INITDB_ROOT_USERNAME: 'root',
            MONGO_INITDB_ROOT_PASSWORD: '${MONGO_ROOT_PASSWORD}',
            ...dbData.env
          };
          spec.volumes = dbData.volumes || [
            { host: `./.arfni/data/mongodb`, mount: '/data/db' }
          ];
          spec.health = dbData.health || { tcp: { port: 27017 } };
          break;
      }

      // 포트 설정
      if (dbData.ports && dbData.ports.length > 0) {
        spec.ports = dbData.ports;
      }
    } else {
      // Service 노드인 경우
      const serviceData = data as ServiceNodeData;

      // image 또는 build 설정
      if (serviceData.image) {
        spec.image = serviceData.image;
      } else if (serviceData.build) {
        spec.build = serviceData.build;
      } else {
        // 기본값
        spec.build = `./apps/${serviceName}`;
      }

      // 나머지 필드 복사
      if (serviceData.env) spec.env = serviceData.env;
      if (serviceData.ports) spec.ports = serviceData.ports;
      if (serviceData.volumes) spec.volumes = serviceData.volumes;
      if (serviceData.command) spec.command = serviceData.command;
      if (serviceData.health) spec.health = serviceData.health;
    }

    // 의존성 추가
    if (dependencies.length > 0) {
      spec.dependsOn = dependencies;
    }

    // 타겟 결정 (기본값: 첫 번째 타겟)
    let targetName = data.target || Object.keys(targets)[0] || 'local';

    // 서비스 등록
    services[serviceName] = {
      kind,
      target: targetName,
      spec
    };
  });

  // 자동으로 감지된 시크릿 추가
  const detectedSecrets = extractSecretsFromServices(services);
  const allSecrets = Array.from(new Set([...secrets, ...detectedSecrets]));

  // Stack YAML 생성
  const stackYaml: StackYaml = {
    apiVersion: 'v0.1',
    name: projectName,
    targets,
    services,
  };

  // EC2 프로젝트일 때 metadata.monitoring.mode 추가 (options에서 받은 mode 사용)
  if (environment === 'ec2') {
    const monitoringMode = mode || 'all-in-one';
    stackYaml.metadata = {
      monitoring: {
        mode: monitoringMode
      }
    };
  }

  // secrets가 있는 경우에만 추가
  if (allSecrets.length > 0) {
    stackYaml.secrets = allSecrets;
  }

  // outputs가 있는 경우에만 추가
  if (Object.keys(outputs).length > 0) {
    stackYaml.outputs = outputs;
  }

  return stackYaml;
}

/**
 * 노드의 의존성 찾기 (들어오는 엣지를 기반으로)
 */
function findDependencies(nodeId: string, edges: Edge[], nodes: CustomNode[]): string[] {
  const dependencies: string[] = [];

  // 이 노드로 들어오는 엣지 찾기
  const incomingEdges = edges.filter(e => e.target === nodeId);

  incomingEdges.forEach(edge => {
    const sourceNode = nodes.find(n => n.id === edge.source);
    if (sourceNode && (sourceNode.type === 'service' || sourceNode.type === 'database')) {
      const sourceName = (sourceNode.data as ServiceNodeData | DatabaseNodeData).name;
      dependencies.push(sourceName.toLowerCase().replace(/\s+/g, '-'));
    }
  });

  return dependencies;
}

/**
 * 서비스에서 사용된 시크릿 변수 추출 (${...} 형식)
 */
function extractSecretsFromServices(services: StackYaml['services']): string[] {
  const secrets: string[] = [];
  const secretPattern = /\$\{([A-Z_]+)\}/g;

  Object.values(services).forEach(service => {
    // env에서 시크릿 추출
    if (service.spec.env) {
      Object.values(service.spec.env).forEach(value => {
        if (typeof value === 'string') {
          const matches = value.matchAll(secretPattern);
          for (const match of matches) {
            const secretName = match[1];
            // ref: 참조가 아닌 경우만 시크릿으로 간주
            if (!secretName.startsWith('ref:')) {
              secrets.push(secretName);
            }
          }
        }
      });
    }
  });

  return Array.from(new Set(secrets));
}

/**
 * Stack YAML 객체를 YAML 문자열로 변환
 */
export function stackToYamlString(stack: StackYaml): string {
  // 간단한 YAML 직렬화 (실제로는 yaml 라이브러리 사용 권장)
  let yaml = `apiVersion: ${stack.apiVersion}\n`;
  yaml += `name: ${stack.name}\n\n`;

  // metadata - targets보다 먼저 출력
  if (stack.metadata) {
    yaml += 'metadata:\n';
    if (stack.metadata.monitoring) {
      yaml += '  monitoring:\n';
      if (stack.metadata.monitoring.mode) {
        yaml += `    mode: ${stack.metadata.monitoring.mode}\n`;
      }
    }
    yaml += '\n';
  }

  // targets - 비어있지 않을 때만 출력
  const targetEntries = Object.entries(stack.targets);
  if (targetEntries.length > 0) {
    yaml += 'targets:\n';
    targetEntries.forEach(([name, config]) => {
      yaml += `  ${name}:\n`;
      yaml += `    type: ${config.type}\n`;
      if (config.host) yaml += `    host: ${config.host}\n`;
      if (config.user) yaml += `    user: ${config.user}\n`;
      if (config.sshKey) yaml += `    sshKey: ${config.sshKey}\n`;
      if (config.port) yaml += `    port: ${config.port}\n`;
      if (config.workdir) yaml += `    workdir: ${config.workdir}\n`;
      if ((config as any).mode) yaml += `    mode: ${(config as any).mode}\n`;
    });
    yaml += '\n';
  } else {
    // targets가 없으면 기본 local target 추가
    yaml += 'targets:\n';
    yaml += '  local:\n';
    yaml += '    type: docker-desktop\n\n';
  }

  // secrets
  if (stack.secrets && stack.secrets.length > 0) {
    yaml += 'secrets:\n';
    stack.secrets.forEach(secret => {
      yaml += `  - ${secret}\n`;
    });
    yaml += '\n';
  }

  // services
  yaml += 'services:\n';
  Object.entries(stack.services).forEach(([name, service]) => {
    yaml += `  ${name}:\n`;
    yaml += `    kind: ${service.kind}\n`;
    yaml += `    target: ${service.target}\n`;
    yaml += '    spec:\n';

    const spec = service.spec as any;

    // image or build
    if (spec.image) {
      yaml += `      image: ${spec.image}\n`;
    } else if (spec.build) {
      yaml += `      build: ${spec.build}\n`;
    }

    // env
    if (spec.env) {
      yaml += '      env:\n';
      Object.entries(spec.env).forEach(([key, value]) => {
        yaml += `        ${key}: ${value}\n`;
      });
    }

    // ports
    if (spec.ports && spec.ports.length > 0) {
      yaml += '      ports:\n';
      spec.ports.forEach((port: string) => {
        yaml += `        - "${port}"\n`;
      });
    }

    // volumes
    if (spec.volumes && spec.volumes.length > 0) {
      yaml += '      volumes:\n';
      spec.volumes.forEach((vol: any) => {
        yaml += `        - { host: ${vol.host}, mount: ${vol.mount} }\n`;
      });
    }

    // command
    if (spec.command && spec.command.length > 0) {
      yaml += '      command: [';
      yaml += spec.command.map((c: string) => `"${c}"`).join(', ');
      yaml += ']\n';
    }

    // dependsOn
    if (spec.dependsOn && spec.dependsOn.length > 0) {
      yaml += '      dependsOn: [';
      yaml += spec.dependsOn.join(', ');
      yaml += ']\n';
    }

    // health
    if (spec.health) {
      yaml += '      health:\n';
      if (spec.health.httpGet) {
        yaml += '        httpGet:\n';
        yaml += `          path: ${spec.health.httpGet.path}\n`;
        yaml += `          port: ${spec.health.httpGet.port}\n`;
      } else if (spec.health.tcp) {
        yaml += `        tcp: { port: ${spec.health.tcp.port} }\n`;
      }
    }

    yaml += '\n';
  });

  // outputs
  if (stack.outputs && Object.keys(stack.outputs).length > 0) {
    yaml += 'outputs:\n';
    Object.entries(stack.outputs).forEach(([key, value]) => {
      yaml += `  ${key}: ${value}\n`;
    });
  }

  return yaml;
}