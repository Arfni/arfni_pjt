import { pluginService } from '@services/pluginLoader';
import { TemplateEngine } from '@services/templateEngine';
import type { CanvasNode, CanvasEdge, DatabaseNodeData, ServiceNodeData } from '../model/types';
import * as yaml from 'js-yaml';

export interface PluginStackGeneratorOptions {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  projectName: string;
  environment: 'local' | 'ec2';
  ec2Server?: {
    id: string;
    name: string;
    host: string;
    user: string;
    pem_path: string;
  };
  mode?: string; // 모니터링 모드
  workdir?: string; // 작업 디렉토리
  secrets?: string[];
}

/**
 * Generate stack.yaml using plugin templates
 */
export class PluginStackGenerator {
  /**
   * Generate complete stack.yaml from canvas nodes using plugin templates
   */
  static async generateStack(options: PluginStackGeneratorOptions): Promise<string> {
    const { nodes, edges, projectName, environment, ec2Server, mode, workdir, secrets = [] } = options;

    // CRITICAL FIX: Filter out null edges to prevent "Cannot read properties of null" errors
    const validEdges = edges.filter(e => e != null);

    // Build the stack structure
    const stack: any = {
      apiVersion: 'v0.1',
      name: projectName,
    };

    // Add metadata for EC2 projects
    if (environment === 'ec2') {
      const monitoringMode = mode || 'no-monitoring';
      stack.metadata = {
        monitoring: {
          mode: monitoringMode
        }
      };
    }

    // Generate targets
    const targets = this.generateTargets(nodes, environment, ec2Server, workdir);
    if (Object.keys(targets).length > 0) {
      stack.targets = targets;
    }

    // Generate services
    stack.services = {};
    const defaultTarget = Object.keys(targets)[0] || 'local';

    // Process each node
    for (const node of nodes) {
      if (node.type === 'target') continue; // Skip target nodes

      // NGINX 게이트웨이 노드는 별도 처리
      if (node.type === 'nginx') {
        const nginxService = this.generateNginxService(node, validEdges, nodes, defaultTarget);
        if (nginxService) {
          const serviceName = (node.data.name || 'nginx')
            .toLowerCase().trim()
            .replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
          stack.services[serviceName] = nginxService;
        }
        continue;
      }

      const service = await this.generateServiceFromNode(node, validEdges, nodes, defaultTarget, environment);
      if (service) {
        // Use sanitized node name as service key
        const serviceName = (node.data.name || node.type || 'service')
          .toLowerCase()
          .trim()
          .replace(/[^a-z0-9-]/g, '-')
          .replace(/-+/g, '-')
          .replace(/^-|-$/g, '');

        stack.services[serviceName] = service;
      }
    }

    // Add monitoring services based on metadata.monitoring.mode
    if (environment === 'ec2') {
      const monitoringMode = mode || 'no-monitoring';

      if (monitoringMode === 'all-in-one') {
        // Both prometheus and grafana on EC2
        const prometheus = this.generateMonitoringService('prometheus', defaultTarget);
        const grafana = this.generateMonitoringService('grafana', defaultTarget);
        const nodeExporter = this.generateMonitoringService('node-exporter', defaultTarget);
        if (prometheus) stack.services['prometheus'] = prometheus;
        if (grafana) stack.services['grafana'] = grafana;
        if (nodeExporter) stack.services['node-exporter'] = nodeExporter;
      } else if (monitoringMode === 'hybrid') {
        // Prometheus on EC2, Grafana on local
        const prometheus = this.generateMonitoringService('prometheus', defaultTarget);
        const grafana = this.generateMonitoringService('grafana', 'local');
        const nodeExporter = this.generateMonitoringService('node-exporter', defaultTarget);
        if (prometheus) stack.services['prometheus'] = prometheus;
        if (grafana) stack.services['grafana'] = grafana;
        if (nodeExporter) stack.services['node-exporter'] = nodeExporter;
      }
      // If mode is 'no', don't add monitoring services
    }

    // Ensure all targets referenced by services are defined
    this.ensureTargetsExist(stack.services, stack.targets, environment, ec2Server, workdir);

    // Extract secrets from services
    const detectedSecrets = this.extractSecretsFromServices(stack.services);
    const allSecrets = Array.from(new Set([...secrets, ...detectedSecrets]));
    if (allSecrets.length > 0) {
      stack.secrets = allSecrets;
    }

    // Convert to YAML format
    return this.convertToYaml(stack);
  }

  /**
   * Generate targets section for stack.yaml
   */
  private static generateTargets(
    nodes: CanvasNode[],
    environment: 'local' | 'ec2',
    ec2Server?: any,
    workdir?: string
  ): Record<string, any> {
    const targets: Record<string, any> = {};

    // Check for target nodes first
    const targetNodes = nodes.filter(n => n.type === 'target');

    targetNodes.forEach(node => {
      const data = node.data;
      const targetName = (data.name || 'target')
        .toLowerCase()
        .replace(/\s+/g, '-');

      const { name, ...targetConfig } = data;
      targets[targetName] = targetConfig;
    });

    // If no target nodes, create default based on environment
    if (Object.keys(targets).length === 0) {
      if (environment === 'ec2' && ec2Server) {
        // Format workdir for EC2
        let formattedWorkdir = workdir || 'arfni-deploy';
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
        // EC2 without server info
        targets['ec2'] = {
          type: 'ec2.ssh'
        };
      } else {
        // Local environment - create local target
        targets['local'] = {
          type: 'local'
        };
      }
    }

    return targets;
  }

  /**
   * Ensure all targets referenced by services are defined
   * Automatically adds missing target definitions
   */
  private static ensureTargetsExist(
    services: Record<string, any>,
    targets: Record<string, any>,
    environment: 'local' | 'ec2',
    ec2Server?: any,
    workdir?: string
  ): void {
    // Collect all target names referenced by services
    const referencedTargets = new Set<string>();

    Object.values(services).forEach((service: any) => {
      if (service && service.target) {
        referencedTargets.add(service.target);
      }
    });

    // For each referenced target, ensure it exists
    referencedTargets.forEach(targetName => {
      if (!targets[targetName]) {
        // Auto-create missing target definition
        if (targetName === 'local') {
          targets['local'] = {
            type: 'local'
          };
        } else if (targetName === 'ec2') {
          // Create EC2 target with server info if available
          if (ec2Server) {
            let formattedWorkdir = workdir || 'arfni-deploy';
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
          } else {
            targets['ec2'] = {
              type: 'ec2.ssh'
            };
          }
        } else {
          // Unknown target - create generic definition
          console.warn(`Unknown target '${targetName}' referenced by service. Creating generic target definition.`);
          targets[targetName] = {
            type: 'local' // Default to local for unknown targets
          };
        }
      }
    });
  }

  /**
   * Extract secrets from services
   */
  private static extractSecretsFromServices(services: Record<string, any>): string[] {
    const secrets: Set<string> = new Set();

    Object.values(services).forEach(service => {
      if (service.spec?.env) {
        Object.values(service.spec.env).forEach(value => {
          if (typeof value === 'string' && value.startsWith('${') && value.endsWith('}')) {
            const secretName = value.slice(2, -1);
            secrets.add(secretName);
          }
        });
      }
    });

    return Array.from(secrets);
  }

  /**
   * Generate service configuration from a node using its plugin template
   */
  private static async generateServiceFromNode(
    node: CanvasNode,
    edges: CanvasEdge[],
    allNodes: CanvasNode[],
    defaultTarget: string,
    environment: 'local' | 'ec2'
  ): Promise<any> {
    // Get the plugin for this node type
    // For database nodes, use node.data.type (e.g., 'mysql', 'postgres')
    // For service nodes, use node.data.serviceType
    const serviceType = node.type === 'database'
      ? (node.data as any).type
      : (node.data.serviceType || node.type);

    const plugin = pluginService.getPluginByNodeType(serviceType);

    let spec: any;

    if (!plugin) {
      throw new Error(
        `No plugin found for service type: ${serviceType}. ` +
        `Please install the required plugin from the Plugin Manager.`
      );
    }

    // Load service template from plugin
    spec = await this.loadServiceTemplateFromPlugin(plugin, node, edges, allNodes);

    // Wrap in proper service structure with kind, target, and spec
    const service: any = {
      kind: 'docker.container',
    };

    // Add target based on environment
    if (environment === 'ec2') {
      service.target = defaultTarget || 'ec2';
    } else {
      service.target = defaultTarget || 'local';
    }

    // Add spec
    service.spec = spec;

    // Add buildConfig if available (for Dockerfile template generation)
    const buildConfig = this.extractBuildConfig(node, plugin);
    if (buildConfig && Object.keys(buildConfig).length > 0) {
      service.spec.buildConfig = buildConfig;
    }

    return service;
  }

  /**
   * Load service template from plugin - handles both bundled and framework plugins
   */
  private static async loadServiceTemplateFromPlugin(
    plugin: any,
    node: CanvasNode,
    edges: CanvasEdge[],
    allNodes: CanvasNode[]
  ): Promise<any> {
    const context = this.buildTemplateContext(node, edges, allNodes);

    // Check if plugin has frameworks section (Django-style plugins)
    const manifest = plugin.manifest as any;
    if (manifest.frameworks && Array.isArray(manifest.frameworks)) {
      try {
        // Load framework YAML file
        const { invoke } = await import('@tauri-apps/api/core');
        const frameworkDef = manifest.frameworks[0];
        const frameworkPath = frameworkDef.source; // e.g., "frameworks/django.yaml"

        const category = manifest.category;
        const pluginName = manifest.name;

        let frameworkYaml: string;

        // Try local file first, then GitHub
        try {
          frameworkYaml = await invoke<string>('read_plugin_template', {
            pluginPath: `bundled/${category}/${pluginName}`,
            templatePath: frameworkPath
          });
        } catch {
          // Fetch from GitHub if local not found
          const githubUrl = `https://raw.githubusercontent.com/Arfni/arfni-plugins/main/plugins/${category}s/${pluginName}/${frameworkPath}`;
          const response = await fetch(githubUrl);
          if (!response.ok) {
            throw new Error(`Failed to fetch framework YAML: ${response.status}`);
          }
          frameworkYaml = await response.text();
        }

        // Parse framework YAML
        const yaml = await import('js-yaml');
        const frameworkConfig = yaml.load(frameworkYaml) as any;

        // Get serviceTemplate from framework config
        if (frameworkConfig.serviceTemplate && frameworkConfig.serviceTemplate.spec) {
          const spec = { ...frameworkConfig.serviceTemplate.spec };

          // Override template defaults with node data values
          // If user has defined env, use only user's env (don't merge with template)
          if ((node.data as any).env && Object.keys((node.data as any).env).length > 0) {
            spec.env = { ...(node.data as any).env };
          } else {
            // User hasn't modified env yet, use template default
            if (spec.environment) {
              spec.env = spec.environment;
            }
          }
          // Clean up environment field
          delete spec.environment;
          if ((node.data as any).ports) {
            spec.ports = (node.data as any).ports;
          }
          if ((node.data as any).build) {
            spec.build = (node.data as any).build;
          } else if (spec.build && !(node.data as any).image) {
            // Auto-generate build path: ./apps/{serviceName}
            const serviceName = (node.data.name || node.type || 'service')
              .toLowerCase()
              .trim()
              .replace(/[^a-z0-9-]/g, '-')
              .replace(/-+/g, '-')
              .replace(/^-|-$/g, '');

            // Override template build context with standardized path
            if (typeof spec.build === 'object') {
              spec.build.context = `./apps/${serviceName}`;
            } else if (typeof spec.build === 'string') {
              spec.build = {
                context: `./apps/${serviceName}`,
                dockerfile: 'Dockerfile'
              };
            }
          }
          if (node.data.image) {
            spec.image = node.data.image;
          }
          if (node.data.volumes) {
            spec.volumes = node.data.volumes;
          }
          if (node.data.health) {
            spec.health = node.data.health;
          }

          // Convert properties to buildConfig and env based on scope
          this.convertPropertiesToSpec(node, plugin, spec);

          // Post-process spec to fix hardcoded values
          this.postProcessFrameworkSpec(spec, node, edges, allNodes);

          return spec;
        }
      } catch (error) {
        console.error('Failed to load framework template:', error);
      }
    }

    // Check if plugin has contributes.services (bundled plugins like MySQL, PostgreSQL)
    if (manifest.contributes?.services) {
      // For database nodes, use node.data.type (e.g., 'mysql', 'postgres')
      // For service nodes, use node.data.serviceType
      const serviceType = node.type === 'database'
        ? (node.data as any).type
        : (node.data.serviceType || node.type);
      const serviceTemplate = manifest.contributes.services[serviceType];

      if (serviceTemplate && serviceTemplate.spec) {
        const spec = { ...serviceTemplate.spec };

        // Override template defaults with node data values
        // If user has defined env, use only user's env (don't merge with template)
        if (node.data.env && Object.keys(node.data.env).length > 0) {
          spec.env = { ...node.data.env };
        } else {
          // User hasn't modified env yet, use template default
          if (spec.environment) {
            spec.env = spec.environment;
          }
        }
        // Clean up environment field
        delete spec.environment;
        if (node.data.ports) {
          spec.ports = node.data.ports;
        }
        if (node.data.build) {
          spec.build = node.data.build;
        } else if (spec.build && !node.data.image) {
          // Auto-generate build path: ./apps/{serviceName}
          const serviceName = (node.data.name || node.type || 'service')
            .toLowerCase()
            .trim()
            .replace(/[^a-z0-9-]/g, '-')
            .replace(/-+/g, '-')
            .replace(/^-|-$/g, '');

          // Override template build context with standardized path
          if (typeof spec.build === 'object') {
            spec.build.context = `./apps/${serviceName}`;
          } else if (typeof spec.build === 'string') {
            spec.build = {
              context: `./apps/${serviceName}`,
              dockerfile: 'Dockerfile'
            };
          }
        }
        if (node.data.image) {
          spec.image = node.data.image;
        }
        if (node.data.volumes) {
          spec.volumes = node.data.volumes;
        }
        if (node.data.health) {
          spec.health = node.data.health;
        }
        if (node.data.command) {
          spec.command = node.data.command;
        }

        // Convert properties to buildConfig and env based on scope
        this.convertPropertiesToSpec(node, plugin, spec);

        // Post-process spec to fix hardcoded values (for bundled plugins)
        this.postProcessFrameworkSpec(spec, node, edges, allNodes);

        return spec;
      }
    }

    // If no template found, throw error
    throw new Error(
      `No service template found for ${node.data.serviceType || node.type}. ` +
      `Please ensure the plugin is properly installed and contains a valid serviceTemplate or contributes.services definition.`
    );
  }

  /**
   * Post-process framework spec to remove empty env vars and add connection-based env
   */
  private static postProcessFrameworkSpec(
    spec: any,
    node: CanvasNode,
    edges: CanvasEdge[],
    allNodes: CanvasNode[]
  ): void {
    // Step 0: Merge 'environment' into 'env' and remove 'environment'
    if (spec.environment) {
      if (!spec.env) {
        spec.env = {};
      }
      // Merge environment into env (env takes precedence)
      for (const [key, value] of Object.entries(spec.environment)) {
        if (!spec.env[key]) {
          spec.env[key] = value;
        }
      }
      // Remove the duplicate 'environment' field
      delete spec.environment;
    }

    // Step 1: Remove empty environment variables
    if (spec.env) {
      const cleanedEnv: Record<string, string> = {};
      for (const [key, value] of Object.entries(spec.env)) {
        // Only keep non-empty values
        if (value !== "" && value !== null && value !== undefined) {
          cleanedEnv[key] = String(value);
        }
      }
      spec.env = cleanedEnv;
    }

    // Step 2: Remove hardcoded values that should be user-controlled
    if (spec.env) {
      // Remove ALLOWED_HOSTS if it's "*" (security risk)
      if (spec.env.ALLOWED_HOSTS === "*") {
        delete spec.env.ALLOWED_HOSTS;
      }

      // Remove hardcoded DATABASE_URL if no database is connected
      if (spec.env.DATABASE_URL && spec.env.DATABASE_URL.includes("postgresql://postgres:")) {
        delete spec.env.DATABASE_URL;
      }
    }

    // Step 3: Add connection-based environment variables
    const incomingEdges = edges.filter(e => e && e.target === node.id);

    // Find connected database
    const databaseNode = incomingEdges
      .map(e => allNodes.find(n => n.id === e.source))
      .find(n => n && (n.type === 'database' || (n.data as any).type === 'postgres' || (n.data as any).type === 'mysql' || (n.data as any).type === 'mongodb'));

    if (databaseNode) {
      if (!spec.env) spec.env = {};

      const dbType = (databaseNode.data as any).type || databaseNode.data.serviceType || 'postgres';
      const dbName = (databaseNode.data.name || dbType || 'db')
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, '-');

      // Generate appropriate DATABASE_URL based on database type
      let databaseUrl = '';

      if (dbType === 'mysql') {
        databaseUrl = `mysql://root:\${MYSQL_ROOT_PASSWORD}@${dbName}:3306/\${MYSQL_DATABASE:-app}`;
      } else if (dbType === 'postgresql' || dbType === 'postgres') {
        databaseUrl = `postgresql://postgres:\${POSTGRES_PASSWORD}@${dbName}:5432/\${POSTGRES_DB:-app}`;
      } else if (dbType === 'mongodb') {
        databaseUrl = `mongodb://${dbName}:27017/\${MONGO_DB:-app}`;
      }

      // Only add DATABASE_URL if a database is connected
      if (databaseUrl) {
        spec.env.DATABASE_URL = databaseUrl;
      }
    }

    // Step 4: Find and add API connections for frontend frameworks
    const outgoingEdges = edges.filter(e => e && e.source === node.id);
    const apiNode = outgoingEdges
      .map(e => allNodes.find(n => n.id === e.target))
      .find(n => n && (n.type === 'service' || n.data.serviceType === 'springboot' || n.data.serviceType === 'django'));

    if (apiNode && (node.data.serviceType === 'react' || node.data.serviceType === 'nextjs' || node.data.serviceType === 'vue')) {
      if (!spec.env) spec.env = {};

      const apiName = apiNode.data.name || 'api';
      const apiPort = (apiNode.data.ports && apiNode.data.ports[0]) ? apiNode.data.ports[0].split(':')[0] : '8080';

      // Only add API URL if connected
      if (node.data.serviceType === 'react') {
        spec.env.REACT_APP_API_URL = `http://${apiName}:${apiPort}`;
      } else if (node.data.serviceType === 'nextjs') {
        spec.env.NEXT_PUBLIC_API_URL = `http://${apiName}:${apiPort}`;
      } else if (node.data.serviceType === 'vue') {
        spec.env.VUE_APP_API_URL = `http://${apiName}:${apiPort}`;
      }
    }

    // Step 5: Process volumes based on properties
    if (node.data.properties) {
      const props = node.data.properties;

      // Handle volume configuration from properties
      if (props.enableStaticFiles || props.enableMediaFiles || props.volumeConfig) {
        if (!spec.volumes) spec.volumes = [];

        // Only add volumes if explicitly enabled
        if (props.enableStaticFiles && props.volumeConfig?.staticPath) {
          spec.volumes.push({
            host: props.volumeConfig.staticPath,
            mount: '/app/static'
          });
        }

        if (props.enableMediaFiles && props.volumeConfig?.mediaPath) {
          spec.volumes.push({
            host: props.volumeConfig.mediaPath,
            mount: '/app/media'
          });
        }

        // Add custom volumes if specified
        if (props.volumeConfig?.customVolumes && Array.isArray(props.volumeConfig.customVolumes)) {
          for (const vol of props.volumeConfig.customVolumes) {
            if (vol.hostPath && vol.containerPath) {
              spec.volumes.push({
                host: vol.hostPath,
                mount: vol.containerPath
              });
            }
          }
        }
      }
    }

    // Step 6: Clean up empty objects
    if (spec.env && Object.keys(spec.env).length === 0) {
      delete spec.env;
    }
    if (spec.volumes && spec.volumes.length === 0) {
      delete spec.volumes;
    }
  }

  /**
   * Build template context from node data and connections
   */
  private static buildTemplateContext(
    node: CanvasNode,
    edges: CanvasEdge[],
    allNodes: CanvasNode[]
  ): Record<string, any> {
    const nodeData = node.data as ServiceNodeData | DatabaseNodeData;

    // Sanitize node name
    const sanitizedName = (node.data.name || node.type || 'service')
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');

    // Base context from node data
    const context: Record<string, any> = {
      ...nodeData,
      name: sanitizedName,
      type: node.type,
    };

    // Add connected services
    const connections = edges.filter(edge =>
      edge && (edge.source === node.id || edge.target === node.id)
    );

    // Find database connections
    const dbConnection = connections.find(conn => {
      const targetNode = allNodes.find(n =>
        n.id === (conn.source === node.id ? conn.target : conn.source)
      );
      return targetNode?.type === 'database';
    });

    if (dbConnection) {
      const dbNode = allNodes.find(n =>
        n.id === (dbConnection.source === node.id ? dbConnection.target : dbConnection.source)
      );
      if (dbNode) {
        const dbName = (dbNode.data.name || dbNode.type || 'database')
          .toLowerCase()
          .trim()
          .replace(/[^a-z0-9-]/g, '-')
          .replace(/-+/g, '-')
          .replace(/^-|-$/g, '');

        context.database = dbName;

        // Build database URL based on type
        const dbData = dbNode.data as DatabaseNodeData;
        switch (dbData.type) {
          case 'postgres':
            context.database_url = `postgresql://user:pass@${dbName}:5432/db`;
            break;
          case 'mysql':
            context.database_url = `mysql://user:pass@${dbName}:3306/db`;
            break;
          case 'mongodb':
            context.database_url = `mongodb://user:pass@${dbName}:27017/db`;
            break;
        }
      }
    }

    // Add cache connections
    const cacheConnection = connections.find(conn => {
      const targetNode = allNodes.find(n =>
        n.id === (conn.source === node.id ? conn.target : conn.source)
      );
      return targetNode?.data?.type === 'redis';
    });

    if (cacheConnection) {
      const cacheNode = allNodes.find(n =>
        n.id === (cacheConnection.source === node.id ? cacheConnection.target : cacheConnection.source)
      );
      if (cacheNode) {
        const cacheName = (cacheNode.data.name || cacheNode.type || 'cache')
          .toLowerCase()
          .trim()
          .replace(/[^a-z0-9-]/g, '-')
          .replace(/-+/g, '-')
          .replace(/^-|-$/g, '');

        context.cache = cacheName;
        context.redis_url = `redis://${cacheName}:6379`;
      }
    }

    // Add default values for common variables
    context.port = nodeData.ports?.[0]?.split(':')[0] || '3000';
    context.version = nodeData.version || 'latest';
    context.debug = 'false';
    context.secret_key = '${SECRET_KEY}';
    context.allowed_hosts = '*';

    return context;
  }

  /**
   * Load template from file path using Tauri command
   */
  private static async loadTemplate(path: string): Promise<string> {
    try {
      // Use Tauri command to read the template file
      const { invoke } = await import('@tauri-apps/api/core');

      // Extract plugin path and template path from full path
      // Example: plugins/bundled/framework/django/templates/service.yaml
      const pathParts = path.split('/');
      const pluginsIndex = pathParts.indexOf('plugins');

      if (pluginsIndex === -1) {
        throw new Error(`Invalid plugin template path: ${path}`);
      }

      // Get plugin path (e.g., "bundled/framework/django")
      const pluginPath = pathParts.slice(pluginsIndex + 1, -2).join('/');
      // Get template path (e.g., "templates/service.yaml")
      const templatePath = pathParts.slice(-2).join('/');

      const template = await invoke<string>('read_plugin_template', {
        pluginPath,
        templatePath
      });

      return template;
    } catch (error) {
      throw new Error(`Failed to load template from ${path}: ${error}`);
    }
  }


  /**
   * Find dependencies for a node based on edges
   */
  private static findDependencies(
    nodeId: string,
    edges: CanvasEdge[],
    allNodes: CanvasNode[]
  ): string[] {
    const dependencies: string[] = [];

    // Find edges where this node is the target (incoming connections)
    const incomingEdges = edges.filter(edge => edge && edge.target === nodeId);

    incomingEdges.forEach(edge => {
      const sourceNode = allNodes.find(n => n.id === edge.source);
      if (sourceNode && sourceNode.type !== 'target') {
        // Use sanitized service name
        const depName = (sourceNode.data.name || sourceNode.type || 'service')
          .toLowerCase()
          .trim()
          .replace(/[^a-z0-9-]/g, '-')
          .replace(/-+/g, '-')
          .replace(/^-|-$/g, '');
        dependencies.push(depName);
      }
    });

    return dependencies;
  }

  /**
   * Convert stack object to YAML string
   */
  private static convertToYaml(stack: any): string {
    // Build ordered stack structure for clean YAML output
    const orderedStack: any = {
      apiVersion: stack.apiVersion,
      name: stack.name,
    };

    // Add metadata if present
    if (stack.metadata) {
      orderedStack.metadata = stack.metadata;
    }

    // Add targets if present
    if (stack.targets && Object.keys(stack.targets).length > 0) {
      orderedStack.targets = stack.targets;
    }

    // Add services
    if (stack.services && Object.keys(stack.services).length > 0) {
      orderedStack.services = stack.services;
    }

    // Add secrets if present
    if (stack.secrets && stack.secrets.length > 0) {
      orderedStack.secrets = stack.secrets;
    }

    // Use js-yaml for proper formatting
    return yaml.dump(orderedStack, {
      indent: 2,
      lineWidth: -1,
      noRefs: true,
      sortKeys: false,
      flowLevel: -1
    });
  }

  /**
   * Manual YAML formatting when js-yaml is not available
   */
  private static manualYamlFormat(obj: any): string {
    let yaml = '';

    // Process top-level fields in order
    for (const [key, value] of Object.entries(obj)) {
      if (value === null || value === undefined) continue;

      if (key === 'apiVersion' || key === 'name') {
        yaml += `${key}: ${value}\n`;
      } else if (key === 'metadata' || key === 'targets' || key === 'services') {
        yaml += `\n${key}:\n`;
        yaml += this.formatObject(value, 2);
      } else if (key === 'secrets') {
        yaml += `\nsecrets:\n`;
        if (Array.isArray(value)) {
          for (const secret of value) {
            yaml += `- ${secret}\n`;
          }
        }
      }
    }

    return yaml;
  }

  /**
   * Format object with proper indentation for YAML
   */
  private static formatObject(obj: any, indent: number): string {
    let yaml = '';
    const spaces = ' '.repeat(indent);

    for (const [key, value] of Object.entries(obj)) {
      if (value === null || value === undefined) continue;

      yaml += `${spaces}${key}:\n`;

      if (key === 'spec') {
        // Special handling for spec section
        yaml += this.formatSpec(value, indent + 2);
      } else if (Array.isArray(value)) {
        for (const item of value) {
          if (typeof item === 'object') {
            yaml += `${spaces}  -\n`;
            yaml += this.formatObject(item, indent + 4);
          } else {
            yaml += `${spaces}  - ${item}\n`;
          }
        }
      } else if (typeof value === 'object') {
        yaml += this.formatObject(value, indent + 2);
      } else {
        // Reset indent for simple values at service level
        yaml = yaml.slice(0, -1); // Remove newline
        yaml += ` ${value}\n`;
      }
    }

    return yaml;
  }

  /**
   * Format spec section with proper indentation
   */
  private static formatSpec(spec: any, indent: number): string {
    let yaml = '';
    const spaces = ' '.repeat(indent);

    // Order matters for readability
    const orderedKeys = ['build', 'image', 'command', 'ports', 'env', 'environment', 'volumes', 'health', 'restart', 'dependsOn'];

    for (const key of orderedKeys) {
      if (!(key in spec)) continue;
      const value = spec[key];

      if (Array.isArray(value)) {
        yaml += `${spaces}${key}:\n`;
        for (const item of value) {
          if (typeof item === 'object') {
            // Handle complex arrays (like volumes)
            yaml += `${spaces}- `;
            const firstKey = Object.keys(item)[0];
            yaml += `${firstKey}: ${item[firstKey]}\n`;
            for (const [k, v] of Object.entries(item)) {
              if (k !== firstKey) {
                yaml += `${spaces}  ${k}: ${v}\n`;
              }
            }
          } else {
            yaml += `${spaces}- ${item}\n`;
          }
        }
      } else if (typeof value === 'object') {
        yaml += `${spaces}${key}:\n`;
        for (const [k, v] of Object.entries(value)) {
          yaml += `${spaces}  ${k}: ${v}\n`;
        }
      } else {
        yaml += `${spaces}${key}: ${value}\n`;
      }
    }

    // Add any remaining keys not in orderedKeys
    for (const [key, value] of Object.entries(spec)) {
      if (orderedKeys.includes(key)) continue;

      if (typeof value === 'object') {
        yaml += `${spaces}${key}:\n`;
        yaml += this.formatObject(value, indent + 2);
      } else {
        yaml += `${spaces}${key}: ${value}\n`;
      }
    }

    return yaml;
  }

  /**
   * Generate Dockerfiles for services using plugin templates
   * Returns a map of service name to Dockerfile content
   */
  static async generateDockerfiles(
    nodes: CanvasNode[],
    edges: CanvasEdge[]
  ): Promise<Map<string, string>> {
    const dockerfiles = new Map<string, string>();

    for (const node of nodes) {
      // Only generate Dockerfiles for service nodes (frameworks)
      if (node.type === 'database' || node.type === 'target') {
        continue;
      }

      const serviceName = (node.data.name || node.type || 'service')
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9-]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');

      try {
        const dockerfileContent = await this.generateDockerfileForNode(node, edges, nodes);
        if (dockerfileContent) {
          dockerfiles.set(serviceName, dockerfileContent);
        }
      } catch (error) {
        console.error(`Failed to generate Dockerfile for ${serviceName}:`, error);
      }
    }

    return dockerfiles;
  }

  /**
   * Generate Dockerfile for a single node
   */
  private static async generateDockerfileForNode(
    node: CanvasNode,
    edges: CanvasEdge[],
    allNodes: CanvasNode[]
  ): Promise<string | null> {
    const plugin = pluginService.getPluginByNodeType(node.data.serviceType || node.type);

    if (!plugin) {
      return null;
    }

    const manifest = plugin.manifest as any;

    // Check if plugin has frameworks section (Django-style plugins)
    if (manifest.frameworks && Array.isArray(manifest.frameworks)) {
      try {
        // Load framework YAML file
        const { invoke } = await import('@tauri-apps/api/core');
        const frameworkDef = manifest.frameworks[0];
        const frameworkPath = frameworkDef.source;

        const category = manifest.category;
        const pluginName = manifest.name;

        let frameworkYaml: string;

        // Try local file first, then GitHub
        try {
          frameworkYaml = await invoke<string>('read_plugin_template', {
            pluginPath: `bundled/${category}/${pluginName}`,
            templatePath: frameworkPath
          });
        } catch {
          // Fetch from GitHub if local not found
          const githubUrl = `https://raw.githubusercontent.com/Arfni/arfni-plugins/main/plugins/${category}s/${pluginName}/${frameworkPath}`;
          const response = await fetch(githubUrl);
          if (!response.ok) {
            throw new Error(`Failed to fetch framework YAML: ${response.status}`);
          }
          frameworkYaml = await response.text();
        }

        // Parse framework YAML
        const yaml = await import('js-yaml');
        const frameworkConfig = yaml.load(frameworkYaml) as any;

        // Get Dockerfile template
        if (frameworkConfig.dockerfile && frameworkConfig.dockerfile.template) {
          const template = frameworkConfig.dockerfile.template;
          const variables = frameworkConfig.dockerfile.variables || {};

          // Build context with default values
          const context = this.buildDockerfileContext(node, variables);

          // Process template
          return TemplateEngine.process(template, context);
        }
      } catch (error) {
        console.error('Failed to load Dockerfile template from framework:', error);
      }
    }

    // Try bundled plugin template
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const category = manifest.category;
      const pluginName = manifest.name;

      const dockerfileTemplate = await invoke<string>('read_plugin_template', {
        pluginPath: `${category}/${pluginName}`,
        templatePath: 'templates/Dockerfile.tmpl'
      });

      const context = this.buildDockerfileContext(node, {});
      return TemplateEngine.process(dockerfileTemplate, context);
    } catch (error) {
      console.error('Failed to load Dockerfile template:', error);
      return null;
    }
  }

  /**
   * Build context for Dockerfile template substitution
   */
  private static buildDockerfileContext(
    node: CanvasNode,
    variableDefaults: Record<string, any>
  ): Record<string, any> {
    const nodeData = node.data as ServiceNodeData;
    const context: Record<string, any> = {};

    // Add defaults from plugin variable definitions
    for (const [key, varDef] of Object.entries(variableDefaults)) {
      if (typeof varDef === 'object' && varDef.default !== undefined) {
        context[key] = varDef.default;
      }
    }

    // Override with node properties if available
    if (nodeData.properties) {
      Object.assign(context, nodeData.properties);
    }

    // Add common context
    context.name = node.data.name || node.type;
    context.type = node.type;

    return context;
  }

  /**
   * Convert properties to spec (buildConfig and env) based on plugin inputs
   * This ensures user properties are actually reflected in the deployment
   */
  private static convertPropertiesToSpec(
    node: CanvasNode,
    plugin: any,
    spec: any
  ): void {
    const properties = node.data.properties;
    if (!properties || Object.keys(properties).length === 0) return;

    // Initialize buildConfig and env if not present
    if (!spec.buildConfig) spec.buildConfig = {};
    if (!spec.env) spec.env = {};

    // Get plugin inputs definition for scope information
    const inputsObj = (plugin.manifest as any)?.inputs || {};

    // Convert inputs object to array for compatibility
    const inputsArray = Object.entries(inputsObj).map(([name, config]: [string, any]) => ({
      name,
      ...config
    }));

    // If plugin has propertyForm, use it for field mapping
    const propertyForm = plugin.frameworkDefinition?.propertyForm || [];

    // Process each property based on its scope
    for (const [propKey, propValue] of Object.entries(properties)) {
      if (propValue === undefined || propValue === null || propValue === '') continue;

      // Find input definition for this property
      const input = inputsArray.find((i: any) => i.name === propKey);
      const formField = propertyForm.find((f: any) => f.name === propKey);

      // Determine scope from input or formField
      let scope: string = 'both'; // default to both if not specified
      if (input?.scope) {
        scope = input.scope;
      } else if (formField?.scope) {
        scope = formField.scope;
      } else if (input?.env_var) {
        // If env_var is defined, assume it's runtime
        scope = 'runtime';
      }

      // Convert to snake_case for buildConfig
      const snakeKey = this.camelToSnake(propKey);
      const envKey = input?.env_var || formField?.env_var || propKey.toUpperCase();

      // Apply value based on scope
      switch (scope) {
        case 'build':
          spec.buildConfig[snakeKey] = propValue;
          break;
        case 'runtime':
          spec.env[envKey] = String(propValue);
          break;
        case 'both':
        default:
          spec.buildConfig[snakeKey] = propValue;
          spec.env[envKey] = String(propValue);
          break;
      }
    }

    // Special handling for common properties that always need env mapping
    const commonEnvMappings: Record<string, string> = {
      port: 'PORT',
      debug: 'DEBUG',
      environment: 'NODE_ENV',
      allowed_hosts: 'ALLOWED_HOSTS',
      secret_key: 'SECRET_KEY',
      database_url: 'DATABASE_URL',
      redis_url: 'REDIS_URL'
    };

    for (const [propKey, envKey] of Object.entries(commonEnvMappings)) {
      const snakeKey = this.camelToSnake(propKey);
      if (spec.buildConfig[snakeKey] !== undefined && !spec.env[envKey]) {
        spec.env[envKey] = String(spec.buildConfig[snakeKey]);
      }
    }

    // Clean up empty objects
    if (Object.keys(spec.buildConfig).length === 0) {
      delete spec.buildConfig;
    }
    if (Object.keys(spec.env).length === 0) {
      delete spec.env;
    }
  }

  /**
   * Extract buildConfig from node properties for Dockerfile template generation
   */
  private static extractBuildConfig(
    node: CanvasNode,
    plugin: any
  ): Record<string, any> | null {
    const properties = node.data.properties;
    if (!properties) return null;

    const buildConfig: Record<string, any> = {};

    // Check if plugin has propertyForm (Django-style plugins)
    const propertyForm = plugin.frameworkDefinition?.propertyForm;
    if (propertyForm && Array.isArray(propertyForm)) {
      // Use propertyForm field names directly
      for (const field of propertyForm) {
        const fieldName = field.name;
        if (properties[fieldName] !== undefined) {
          // Convert field name to snake_case for Go template compatibility
          const snakeKey = this.camelToSnake(fieldName);
          buildConfig[snakeKey] = properties[fieldName];
        } else if (field.default !== undefined) {
          const snakeKey = this.camelToSnake(fieldName);
          buildConfig[snakeKey] = field.default;
        }
      }
    } else if (plugin.frameworkDefinition?.dockerfile?.variables) {
      // Check framework definition with dockerfile variables
      for (const [key, varDef] of Object.entries(plugin.frameworkDefinition.dockerfile.variables as Record<string, any>)) {
        // Properties are stored with propertyForm field names
        // Try both snake_case and camelCase
        const camelKey = this.snakeToCamel(key);

        if (properties[key] !== undefined) {
          buildConfig[key] = properties[key];
        } else if (properties[camelKey] !== undefined) {
          buildConfig[key] = properties[camelKey];
        } else if (varDef.default !== undefined) {
          buildConfig[key] = varDef.default;
        }
      }
    } else {
      // Fallback: Pass all properties as buildConfig with snake_case conversion
      // This handles both bundled plugins and custom properties
      for (const [propKey, propValue] of Object.entries(properties)) {
        // Convert to snake_case for Go backend
        const snakeKey = this.camelToSnake(propKey);
        buildConfig[snakeKey] = propValue;
      }

      // Add common defaults if not present
      const commonDefaults: Record<string, any> = {
        python_version: '3.11',
        node_version: '18',
        java_version: '17',
        workers: 4,
        port: 8000
      };

      for (const [key, defaultValue] of Object.entries(commonDefaults)) {
        if (buildConfig[key] === undefined && !Object.keys(buildConfig).some(k => k.includes(key.split('_')[0]))) {
          // Don't add default if we already have a related config
          continue;
        }
      }
    }

    return Object.keys(buildConfig).length > 0 ? buildConfig : null;
  }

  /**
   * Convert snake_case to camelCase
   */
  private static snakeToCamel(str: string): string {
    return str.replace(/_([a-z])/g, (g) => g[1].toUpperCase());
  }

  /**
   * Convert camelCase to snake_case
   */
  private static camelToSnake(str: string): string {
    return str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
  }

  /**
   * Generate NGINX gateway service from a nginx node + edges
   */
  private static generateNginxService(
    node: CanvasNode,
    edges: CanvasEdge[],
    allNodes: CanvasNode[],
    defaultTarget: string
  ): any {
    const data = node.data as any;

    // Collect upstream services from connected edges (service → nginx or nginx → service)
    const connectedEdges = edges.filter(e => e && (e.target === node.id || e.source === node.id));
    const upstreams = connectedEdges
      .map(edge => {
        // The upstream node is whichever side is NOT the nginx node
        const upstreamNodeId = edge.target === node.id ? edge.source : edge.target;
        const sourceNode = allNodes.find(n => n.id === upstreamNodeId);
        if (!sourceNode || sourceNode.type === 'target' || sourceNode.type === 'nginx') return null;

        const name = (sourceNode.data.name || sourceNode.type || 'service')
          .toLowerCase().trim()
          .replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');

        // port: first exposed port of the upstream service
        const ports: string[] = sourceNode.data.ports || [];
        const port = ports.length > 0
          ? Number(ports[0].split(':')[1] || ports[0].split(':')[0] || 80)
          : 80;

        // route and websocket come from edge metadata (set via edge click UI)
        const route: string = (edge.data as any)?.route || '/';
        const websocket: boolean = (edge.data as any)?.websocket || false;

        return { name, service: name, port, route, ...(websocket && { websocket }) };
      })
      .filter(Boolean);

    const listenPort = data.listenPort ?? 80;

    return {
      kind: 'proxy.nginx',
      target: data.target || defaultTarget,
      spec: {
        image: 'nginx:alpine',
        ports: [`${listenPort}:${listenPort}`],
        volumes: [{ host: './nginx.conf', mount: '/etc/nginx/nginx.conf' }],
        nginx: {
          listenPort,
          serverName: data.serverName || '_',
          upstreams,
          ssl: data.ssl?.enabled ? data.ssl : undefined,
          rateLimit: data.rateLimit?.enabled ? data.rateLimit : undefined,
          cors: data.cors?.enabled ? data.cors : undefined,
          gzip: data.gzip?.enabled ? data.gzip : undefined,
          cache: data.cache?.enabled ? data.cache : undefined,
          keepalive: data.keepalive ?? 32,
          loadBalancing: data.loadBalancing,
        },
      },
    };
  }

  /**
   * Generate monitoring service specification
   */
  private static generateMonitoringService(serviceName: string, target: string): any {
    const plugin = pluginService.getPluginByNodeType(serviceName);

    if (!plugin || !plugin.manifest.contributes?.services) {
      console.warn(`No plugin found for monitoring service: ${serviceName}`);
      return null;
    }

    const serviceTemplate = plugin.manifest.contributes.services[serviceName];

    if (!serviceTemplate || !serviceTemplate.spec) {
      console.warn(`No service template found for: ${serviceName}`);
      return null;
    }

    // Build service spec from plugin template
    const service: any = {
      kind: serviceTemplate.kind || 'docker.container',
      target: target
    };

    // Copy spec fields
    service.spec = { ...serviceTemplate.spec };

    return service;
  }
}