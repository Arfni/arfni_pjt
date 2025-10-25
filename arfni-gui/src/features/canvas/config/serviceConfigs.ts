/**
 * 서비스 타입별 설정 정의
 * 이 설정을 기반으로 Property Panel의 폼이 동적으로 생성됨
 */

export interface EnvVarConfig {
  key: string;
  label?: string;
  type: 'text' | 'password' | 'number' | 'boolean';
  required?: boolean;
  defaultValue?: string | number | boolean;
  placeholder?: string;
  description?: string;
}

export interface AdditionalFieldConfig {
  key: string;
  label: string;
  type: 'text' | 'number' | 'select' | 'boolean';
  defaultValue?: any;
  options?: { label: string; value: string }[];
  description?: string;
}

export interface VolumeConfig {
  host: string;
  mount: string;
}

export interface HealthCheckConfig {
  tcp?: { port: number };
  httpGet?: { path: string; port: number };
  exec?: { command: string[] };
}

export interface ServiceTypeConfig {
  name: string;
  category: 'database' | 'backend' | 'frontend' | 'other';
  icon?: string;

  // Version
  supportsVersion?: boolean;
  defaultVersion?: string;
  versionOptions?: string[];

  // Build
  buildRequired?: boolean;
  defaultBuildPath?: string;

  // Image (빌드가 필요 없는 경우)
  defaultImage?: string;

  // Port
  defaultPort?: number;
  defaultPortMapping?: string;

  // Environment Variables
  requiredEnvVars?: EnvVarConfig[];
  optionalEnvVars?: EnvVarConfig[];

  // Volumes
  defaultVolumes?: VolumeConfig[];
  supportsVolumes?: boolean;

  // Additional Fields (서비스별 특수 설정)
  additionalFields?: AdditionalFieldConfig[];

  // Health Check
  defaultHealthCheck?: HealthCheckConfig;

  // Command
  defaultCommand?: string[];
}

export const SERVICE_CONFIGS: Record<string, ServiceTypeConfig> = {
  // ==================== Databases ====================
  mysql: {
    name: 'MySQL',
    category: 'database',
    supportsVersion: true,
    defaultVersion: '8.0',
    versionOptions: ['8.0', '8.4', '5.7', '5.6'],
    defaultPort: 3306,
    defaultPortMapping: '3306:3306',
    requiredEnvVars: [
      {
        key: 'MYSQL_ROOT_PASSWORD',
        label: 'Root Password',
        type: 'password',
        required: true,
        placeholder: 'Enter root password',
        description: 'MySQL root user password'
      },
      {
        key: 'MYSQL_DATABASE',
        label: 'Database Name',
        type: 'text',
        required: false,
        defaultValue: 'app',
        placeholder: 'myapp',
        description: 'Initial database to create'
      }
    ],
    optionalEnvVars: [
      {
        key: 'MYSQL_USER',
        label: 'User',
        type: 'text',
        placeholder: 'appuser'
      },
      {
        key: 'MYSQL_PASSWORD',
        label: 'User Password',
        type: 'password',
        placeholder: 'Enter user password'
      }
    ],
    defaultVolumes: [
      {
        host: './.arfni/data/mysql',
        mount: '/var/lib/mysql'
      }
    ],
    supportsVolumes: true,
    defaultHealthCheck: {
      tcp: { port: 3306 }
    }
  },

  postgres: {
    name: 'PostgreSQL',
    category: 'database',
    supportsVersion: true,
    defaultVersion: '15',
    versionOptions: ['16', '15', '14', '13', '12'],
    defaultPort: 5432,
    defaultPortMapping: '5432:5432',
    requiredEnvVars: [
      {
        key: 'POSTGRES_PASSWORD',
        label: 'Password',
        type: 'password',
        required: true,
        placeholder: 'Enter password'
      },
      {
        key: 'POSTGRES_DB',
        label: 'Database Name',
        type: 'text',
        defaultValue: 'app',
        placeholder: 'myapp'
      }
    ],
    optionalEnvVars: [
      {
        key: 'POSTGRES_USER',
        label: 'User',
        type: 'text',
        defaultValue: 'postgres',
        placeholder: 'postgres'
      }
    ],
    defaultVolumes: [
      {
        host: './.arfni/data/postgres',
        mount: '/var/lib/postgresql/data'
      }
    ],
    supportsVolumes: true,
    defaultHealthCheck: {
      tcp: { port: 5432 }
    }
  },

  redis: {
    name: 'Redis',
    category: 'database',
    supportsVersion: true,
    defaultVersion: '7',
    versionOptions: ['7', '6', '5'],
    defaultPort: 6379,
    defaultPortMapping: '6379:6379',
    requiredEnvVars: [],
    optionalEnvVars: [
      {
        key: 'REDIS_PASSWORD',
        label: 'Password',
        type: 'password',
        placeholder: 'Optional password'
      }
    ],
    defaultVolumes: [
      {
        host: './.arfni/data/redis',
        mount: '/data'
      }
    ],
    supportsVolumes: true,
    defaultCommand: ['redis-server', '--appendonly', 'yes'],
    defaultHealthCheck: {
      tcp: { port: 6379 }
    }
  },

  mongodb: {
    name: 'MongoDB',
    category: 'database',
    supportsVersion: true,
    defaultVersion: '6',
    versionOptions: ['7', '6', '5', '4.4'],
    defaultPort: 27017,
    defaultPortMapping: '27017:27017',
    requiredEnvVars: [
      {
        key: 'MONGO_INITDB_ROOT_USERNAME',
        label: 'Root Username',
        type: 'text',
        defaultValue: 'root',
        required: true
      },
      {
        key: 'MONGO_INITDB_ROOT_PASSWORD',
        label: 'Root Password',
        type: 'password',
        required: true,
        placeholder: 'Enter root password'
      }
    ],
    optionalEnvVars: [
      {
        key: 'MONGO_INITDB_DATABASE',
        label: 'Initial Database',
        type: 'text',
        placeholder: 'admin'
      }
    ],
    defaultVolumes: [
      {
        host: './.arfni/data/mongodb',
        mount: '/data/db'
      }
    ],
    supportsVolumes: true,
    defaultHealthCheck: {
      tcp: { port: 27017 }
    }
  },

  // ==================== Backend Services ====================
  spring: {
    name: 'Spring Boot',
    category: 'backend',
    buildRequired: true,
    defaultBuildPath: './apps/spring',
    defaultPort: 8080,
    defaultPortMapping: '8080:8080',
    requiredEnvVars: [],
    optionalEnvVars: [
      {
        key: 'SPRING_PROFILES_ACTIVE',
        label: 'Active Profile',
        type: 'text',
        defaultValue: 'prod',
        placeholder: 'dev, prod, test'
      },
      {
        key: 'DATABASE_URL',
        label: 'Database URL',
        type: 'text',
        placeholder: 'jdbc:mysql://mysql:3306/app'
      },
      {
        key: 'JWT_SECRET',
        label: 'JWT Secret',
        type: 'password',
        placeholder: 'Enter JWT secret key'
      }
    ],
    additionalFields: [
      {
        key: 'buildTool',
        label: 'Build Tool',
        type: 'select',
        defaultValue: 'gradle',
        options: [
          { label: 'Gradle', value: 'gradle' },
          { label: 'Maven', value: 'maven' }
        ]
      },
      {
        key: 'javaVersion',
        label: 'Java Version',
        type: 'select',
        defaultValue: '17',
        options: [
          { label: 'Java 21', value: '21' },
          { label: 'Java 17', value: '17' },
          { label: 'Java 11', value: '11' },
          { label: 'Java 8', value: '8' }
        ]
      }
    ],
    supportsVolumes: false,
    defaultHealthCheck: {
      httpGet: { path: '/actuator/health', port: 8080 }
    }
  },

  fastapi: {
    name: 'FastAPI',
    category: 'backend',
    buildRequired: true,
    defaultBuildPath: './apps/api',
    defaultPort: 8000,
    defaultPortMapping: '8000:8000',
    requiredEnvVars: [],
    optionalEnvVars: [
      {
        key: 'DEBUG',
        label: 'Debug Mode',
        type: 'boolean',
        defaultValue: false
      },
      {
        key: 'API_KEY',
        label: 'API Key',
        type: 'password',
        placeholder: 'Enter API key'
      },
      {
        key: 'DATABASE_URL',
        label: 'Database URL',
        type: 'text',
        placeholder: 'postgresql://user:pass@postgres:5432/db'
      }
    ],
    additionalFields: [
      {
        key: 'workers',
        label: 'Workers',
        type: 'number',
        defaultValue: 4,
        description: 'Number of Uvicorn workers'
      },
      {
        key: 'pythonVersion',
        label: 'Python Version',
        type: 'select',
        defaultValue: '3.11',
        options: [
          { label: 'Python 3.12', value: '3.12' },
          { label: 'Python 3.11', value: '3.11' },
          { label: 'Python 3.10', value: '3.10' },
          { label: 'Python 3.9', value: '3.9' }
        ]
      }
    ],
    supportsVolumes: false,
    defaultHealthCheck: {
      httpGet: { path: '/health', port: 8000 }
    },
    defaultCommand: ['uvicorn', 'main:app', '--host', '0.0.0.0', '--port', '8000']
  },

  django: {
    name: 'Django',
    category: 'backend',
    buildRequired: true,
    defaultBuildPath: './apps/django',
    defaultPort: 8000,
    defaultPortMapping: '8000:8000',
    requiredEnvVars: [
      {
        key: 'SECRET_KEY',
        label: 'Secret Key',
        type: 'password',
        required: true,
        placeholder: 'Django secret key'
      }
    ],
    optionalEnvVars: [
      {
        key: 'DEBUG',
        label: 'Debug Mode',
        type: 'boolean',
        defaultValue: false
      },
      {
        key: 'DATABASE_URL',
        label: 'Database URL',
        type: 'text',
        placeholder: 'postgres://user:pass@postgres:5432/db'
      },
      {
        key: 'ALLOWED_HOSTS',
        label: 'Allowed Hosts',
        type: 'text',
        placeholder: 'localhost,example.com'
      }
    ],
    additionalFields: [
      {
        key: 'pythonVersion',
        label: 'Python Version',
        type: 'select',
        defaultValue: '3.11',
        options: [
          { label: 'Python 3.12', value: '3.12' },
          { label: 'Python 3.11', value: '3.11' },
          { label: 'Python 3.10', value: '3.10' }
        ]
      }
    ],
    supportsVolumes: true,
    defaultHealthCheck: {
      httpGet: { path: '/health/', port: 8000 }
    }
  },

  nodejs: {
    name: 'Node.js',
    category: 'backend',
    buildRequired: true,
    defaultBuildPath: './apps/nodejs',
    defaultPort: 3000,
    defaultPortMapping: '3000:3000',
    requiredEnvVars: [],
    optionalEnvVars: [
      {
        key: 'NODE_ENV',
        label: 'Node Environment',
        type: 'text',
        defaultValue: 'production',
        placeholder: 'development, production'
      },
      {
        key: 'DATABASE_URL',
        label: 'Database URL',
        type: 'text',
        placeholder: 'mongodb://mongo:27017/mydb'
      }
    ],
    additionalFields: [
      {
        key: 'nodeVersion',
        label: 'Node Version',
        type: 'select',
        defaultValue: '20',
        options: [
          { label: 'Node 20 LTS', value: '20' },
          { label: 'Node 18 LTS', value: '18' },
          { label: 'Node 16 LTS', value: '16' }
        ]
      }
    ],
    supportsVolumes: false,
    defaultCommand: ['node', 'index.js']
  },

  // ==================== Frontend Services ====================
  react: {
    name: 'React',
    category: 'frontend',
    buildRequired: true,
    defaultBuildPath: './apps/react',
    defaultPort: 80,
    defaultPortMapping: '3000:80',
    requiredEnvVars: [],
    optionalEnvVars: [
      {
        key: 'REACT_APP_API_URL',
        label: 'API URL',
        type: 'text',
        placeholder: 'http://localhost:8080'
      }
    ],
    additionalFields: [
      {
        key: 'nodeVersion',
        label: 'Node Version',
        type: 'select',
        defaultValue: '18',
        options: [
          { label: 'Node 20', value: '20' },
          { label: 'Node 18', value: '18' },
          { label: 'Node 16', value: '16' }
        ]
      }
    ],
    supportsVolumes: false
  },

  nextjs: {
    name: 'Next.js',
    category: 'frontend',
    buildRequired: true,
    defaultBuildPath: './apps/nextjs',
    defaultPort: 3000,
    defaultPortMapping: '3000:3000',
    requiredEnvVars: [],
    optionalEnvVars: [
      {
        key: 'NEXT_PUBLIC_API_URL',
        label: 'Public API URL',
        type: 'text',
        placeholder: 'http://localhost:8080'
      }
    ],
    additionalFields: [
      {
        key: 'nodeVersion',
        label: 'Node Version',
        type: 'select',
        defaultValue: '20',
        options: [
          { label: 'Node 20', value: '20' },
          { label: 'Node 18', value: '18' }
        ]
      }
    ],
    supportsVolumes: false,
    defaultCommand: ['npm', 'start']
  },

  vue: {
    name: 'Vue.js',
    category: 'frontend',
    buildRequired: true,
    defaultBuildPath: './apps/vue',
    defaultPort: 80,
    defaultPortMapping: '8080:80',
    requiredEnvVars: [],
    optionalEnvVars: [
      {
        key: 'VUE_APP_API_URL',
        label: 'API URL',
        type: 'text',
        placeholder: 'http://localhost:8080'
      }
    ],
    supportsVolumes: false
  }
};

/**
 * 서비스 타입 목록 가져오기
 */
export function getServiceTypes(): string[] {
  return Object.keys(SERVICE_CONFIGS);
}

/**
 * 서비스 타입 설정 가져오기
 */
export function getServiceConfig(type: string): ServiceTypeConfig | undefined {
  return SERVICE_CONFIGS[type];
}

/**
 * 카테고리별 서비스 그룹화
 */
export function getServicesByCategory() {
  const grouped: Record<string, ServiceTypeConfig[]> = {
    database: [],
    backend: [],
    frontend: [],
    other: []
  };

  Object.entries(SERVICE_CONFIGS).forEach(([key, config]) => {
    grouped[config.category].push({ ...config, name: key });
  });

  return grouped;
}
