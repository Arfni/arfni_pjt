/**
 * Field Metadata System
 *
 * Defines metadata for all possible fields in stack.yaml
 * This enables dynamic form generation without hardcoding
 */

export interface FieldMetadata {
  label: string;
  description?: string;
  type: 'text' | 'number' | 'select' | 'boolean' | 'array' | 'object' | 'keyvalue' | 'volumeArray' | 'healthcheck' | 'dependency';
  section: 'basic' | 'build' | 'network' | 'storage' | 'environment' | 'health' | 'dependencies' | 'advanced';
  placeholder?: string;
  required?: boolean;
  arrayItemType?: 'text' | 'object';
  options?: Array<{ label: string; value: any }>;
}

export const FIELD_METADATA: Record<string, FieldMetadata> = {
  // Basic Information
  name: {
    label: 'Service Name',
    description: 'Unique identifier for this service',
    type: 'text',
    section: 'basic',
    required: true,
    placeholder: 'my-service'
  },

  kind: {
    label: 'Kind',
    description: 'Service type (usually docker.container)',
    type: 'text',
    section: 'basic',
    placeholder: 'docker.container'
  },

  target: {
    label: 'Target Environment',
    description: 'Where this service should be deployed',
    type: 'select',
    section: 'basic',
    options: [
      { label: 'Local', value: 'local' },
      { label: 'EC2', value: 'ec2' }
    ]
  },

  // Build Configuration
  build: {
    label: 'Build Path',
    description: 'Path to the build context',
    type: 'text',
    section: 'build',
    placeholder: './apps/my-app'
  },

  image: {
    label: 'Docker Image',
    description: 'Docker image to use (alternative to build)',
    type: 'text',
    section: 'build',
    placeholder: 'nginx:latest'
  },

  dockerfile: {
    label: 'Dockerfile Path',
    description: 'Custom Dockerfile path',
    type: 'text',
    section: 'build',
    placeholder: 'Dockerfile'
  },

  // Network Configuration
  ports: {
    label: 'Ports',
    description: 'Port mappings (host:container)',
    type: 'array',
    section: 'network',
    arrayItemType: 'text',
    placeholder: '3000:3000'
  },

  // Storage Configuration
  volumes: {
    label: 'Volumes',
    description: 'Volume mounts for persistent data',
    type: 'volumeArray',
    section: 'storage'
  },

  // Environment Variables
  env: {
    label: 'Environment Variables',
    description: 'Runtime environment variables',
    type: 'keyvalue',
    section: 'environment'
  },

  // Health Check
  health: {
    label: 'Health Check',
    description: 'Container health monitoring configuration',
    type: 'healthcheck',
    section: 'health'
  },

  // Dependencies
  dependsOn: {
    label: 'Dependencies',
    description: 'Services that must start before this one',
    type: 'dependency',
    section: 'dependencies'
  },

  // Advanced Configuration
  command: {
    label: 'Command Override',
    description: 'Override the default container command',
    type: 'array',
    section: 'advanced',
    arrayItemType: 'text',
    placeholder: 'npm start'
  },

  entrypoint: {
    label: 'Entrypoint Override',
    description: 'Override the default entrypoint',
    type: 'array',
    section: 'advanced',
    arrayItemType: 'text'
  },

  workingDir: {
    label: 'Working Directory',
    description: 'Set the working directory in the container',
    type: 'text',
    section: 'advanced',
    placeholder: '/app'
  },

  user: {
    label: 'User',
    description: 'Run container as specific user',
    type: 'text',
    section: 'advanced',
    placeholder: '1000:1000'
  },

  restart: {
    label: 'Restart Policy',
    description: 'Container restart behavior',
    type: 'select',
    section: 'advanced',
    options: [
      { label: 'No', value: 'no' },
      { label: 'Always', value: 'always' },
      { label: 'On Failure', value: 'on-failure' },
      { label: 'Unless Stopped', value: 'unless-stopped' }
    ]
  },

  privileged: {
    label: 'Privileged Mode',
    description: 'Run container in privileged mode',
    type: 'boolean',
    section: 'advanced'
  },

  networks: {
    label: 'Networks',
    description: 'Networks to attach to',
    type: 'array',
    section: 'network',
    arrayItemType: 'text'
  },

  // Resource Limits (custom fields)
  memoryLimit: {
    label: 'Memory Limit (MB)',
    description: 'Maximum memory allocation',
    type: 'number',
    section: 'advanced',
    placeholder: '512'
  },

  cpuLimit: {
    label: 'CPU Limit',
    description: 'CPU cores limit',
    type: 'number',
    section: 'advanced',
    placeholder: '0.5'
  }
};

/**
 * Get section metadata with icon and order
 */
export const SECTION_METADATA = {
  basic: {
    label: 'Basic Information',
    icon: '⚙️',
    order: 1,
    defaultOpen: true
  },
  build: {
    label: 'Build Configuration',
    icon: '🔨',
    order: 2,
    defaultOpen: true
  },
  network: {
    label: 'Network & Ports',
    icon: '🌐',
    order: 3,
    defaultOpen: true
  },
  storage: {
    label: 'Storage & Volumes',
    icon: '💾',
    order: 4,
    defaultOpen: false
  },
  environment: {
    label: 'Environment Variables',
    icon: '📝',
    order: 5,
    defaultOpen: true
  },
  health: {
    label: 'Health Check',
    icon: '❤️',
    order: 6,
    defaultOpen: false
  },
  dependencies: {
    label: 'Dependencies',
    icon: '🔗',
    order: 7,
    defaultOpen: false
  },
  advanced: {
    label: 'Advanced Settings',
    icon: '⚡',
    order: 8,
    defaultOpen: false
  }
};

/**
 * Get field metadata for a specific field
 */
export function getFieldMetadata(fieldName: string): FieldMetadata | null {
  return FIELD_METADATA[fieldName] || null;
}

/**
 * Get all fields for a specific section
 */
export function getFieldsBySection(section: string): Record<string, FieldMetadata> {
  const fields: Record<string, FieldMetadata> = {};

  for (const [fieldName, metadata] of Object.entries(FIELD_METADATA)) {
    if (metadata.section === section) {
      fields[fieldName] = metadata;
    }
  }

  return fields;
}
