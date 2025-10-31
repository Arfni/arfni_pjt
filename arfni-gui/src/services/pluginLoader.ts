// Plugin loader with static bundled plugins for now
// This will be replaced with dynamic loading in the future

import yaml from 'js-yaml';

export interface PluginManifest {
  apiVersion: string;
  name: string;
  displayName: string;
  version: string;
  category: 'database' | 'framework' | 'cache' | 'proxy' | 'cicd' | 'orchestration' | 'monitoring';
  description: string;
  author: string;
  license: string;
  icon: string;
  provides?: {
    service_kinds?: string[];
  };
  contributes?: {
    services?: Record<string, any>;
    canvas?: {
      nodeType: string;
      label: string;
      description: string;
      category: 'database' | 'runtime' | 'infra' | 'monitor';
      ports?: Array<{
        name: string;
        port: number;
        protocol: string;
      }>;
      connections?: {
        inputs?: Array<{
          type: string;
          name: string;
          protocol: string;
          env_var?: string;
        }>;
        outputs?: Array<{
          type: string;
          name: string;
          protocol: string;
          env_prefix?: string;
        }>;
      };
    };
  };
}

export interface LoadedPlugin {
  manifest: PluginManifest;
  path: string;
  iconPath: string;
  isBundled: boolean;
}

export interface NodeTemplate {
  type: string;
  label: string;
  description: string;
  icon: string;
  category: 'runtime' | 'database' | 'infra' | 'monitor';
  plugin?: LoadedPlugin;
}

// Bundled plugin manifests (hardcoded for now, will be loaded from files later)
const bundledPluginManifests: PluginManifest[] = [
  // Database plugins
  {
    apiVersion: 'v0.1',
    name: 'postgresql',
    displayName: 'PostgreSQL',
    version: '1.0.0',
    category: 'database',
    description: 'Advanced open-source relational database',
    author: 'ARFNI Team',
    license: 'MIT',
    icon: 'icon.png',
    provides: {
      service_kinds: ['db.postgres']
    },
    contributes: {
      canvas: {
        nodeType: 'postgres',
        label: 'PostgreSQL',
        description: 'Leading RDBMS',
        category: 'database',
        ports: [{ name: 'postgres', port: 5432, protocol: 'tcp' }],
        connections: {
          outputs: [{
            type: 'database',
            name: 'postgres',
            protocol: 'postgresql',
            env_prefix: 'DATABASE'
          }]
        }
      }
    }
  },
  {
    apiVersion: 'v0.1',
    name: 'mysql',
    displayName: 'MySQL',
    version: '1.0.0',
    category: 'database',
    description: 'Popular open-source relational database',
    author: 'ARFNI Team',
    license: 'MIT',
    icon: 'icon.png',
    provides: {
      service_kinds: ['db.mysql']
    },
    contributes: {
      canvas: {
        nodeType: 'mysql',
        label: 'MySQL',
        description: 'Open-source DB',
        category: 'database',
        ports: [{ name: 'mysql', port: 3306, protocol: 'tcp' }],
        connections: {
          outputs: [{
            type: 'database',
            name: 'mysql',
            protocol: 'mysql',
            env_prefix: 'DATABASE'
          }]
        }
      }
    }
  },
  {
    apiVersion: 'v0.1',
    name: 'mongodb',
    displayName: 'MongoDB',
    version: '1.0.0',
    category: 'database',
    description: 'NoSQL document database',
    author: 'ARFNI Team',
    license: 'MIT',
    icon: 'icon.png',
    provides: {
      service_kinds: ['db.mongodb']
    },
    contributes: {
      canvas: {
        nodeType: 'mongodb',
        label: 'MongoDB',
        description: 'Document NoSQL',
        category: 'database',
        ports: [{ name: 'mongodb', port: 27017, protocol: 'tcp' }],
        connections: {
          outputs: [{
            type: 'database',
            name: 'mongodb',
            protocol: 'mongodb',
            env_prefix: 'MONGO'
          }]
        }
      }
    }
  },
  // Cache plugin
  {
    apiVersion: 'v0.1',
    name: 'redis',
    displayName: 'Redis',
    version: '1.0.0',
    category: 'cache',
    description: 'In-memory data structure store',
    author: 'ARFNI Team',
    license: 'MIT',
    icon: 'icon.png',
    provides: {
      service_kinds: ['cache.redis']
    },
    contributes: {
      canvas: {
        nodeType: 'redis',
        label: 'Redis',
        description: 'In-memory cache',
        category: 'database', // NodePalette uses 'database' for cache too
        ports: [{ name: 'redis', port: 6379, protocol: 'tcp' }],
        connections: {
          outputs: [{
            type: 'cache',
            name: 'redis',
            protocol: 'redis',
            env_prefix: 'REDIS'
          }]
        }
      }
    }
  },
  // Framework plugins
  {
    apiVersion: 'v0.1',
    name: 'react',
    displayName: 'React',
    version: '1.0.0',
    category: 'framework',
    description: 'JavaScript library for building user interfaces',
    author: 'ARFNI Team',
    license: 'MIT',
    icon: 'icon.png',
    provides: {
      service_kinds: ['app.react']
    },
    contributes: {
      canvas: {
        nodeType: 'react',
        label: 'React',
        description: 'Frontend library',
        category: 'runtime',
        ports: [{ name: 'http', port: 3000, protocol: 'tcp' }],
        connections: {
          inputs: [{
            type: 'api',
            name: 'backend',
            protocol: 'http',
            env_var: 'REACT_APP_API_URL'
          }]
        }
      }
    }
  },
  {
    apiVersion: 'v0.1',
    name: 'nextjs',
    displayName: 'Next.js',
    version: '1.0.0',
    category: 'framework',
    description: 'React framework for production',
    author: 'ARFNI Team',
    license: 'MIT',
    icon: 'icon.png',
    provides: {
      service_kinds: ['app.nextjs']
    },
    contributes: {
      canvas: {
        nodeType: 'nextjs',
        label: 'Next.js',
        description: 'React framework',
        category: 'runtime',
        ports: [{ name: 'http', port: 3000, protocol: 'tcp' }],
        connections: {
          inputs: [{
            type: 'api',
            name: 'backend',
            protocol: 'http',
            env_var: 'NEXT_PUBLIC_API_URL'
          }]
        }
      }
    }
  },
  {
    apiVersion: 'v0.1',
    name: 'springboot',
    displayName: 'Spring Boot',
    version: '1.0.0',
    category: 'framework',
    description: 'Java framework for building enterprise applications',
    author: 'ARFNI Team',
    license: 'MIT',
    icon: 'icon.png',
    provides: {
      service_kinds: ['app.springboot']
    },
    contributes: {
      canvas: {
        nodeType: 'spring',
        label: 'Spring Boot',
        description: 'Java framework',
        category: 'runtime',
        ports: [{ name: 'http', port: 8080, protocol: 'tcp' }],
        connections: {
          inputs: [{
            type: 'database',
            name: 'database',
            protocol: 'any',
            env_var: 'DATABASE_URL'
          }],
          outputs: [{
            type: 'api',
            name: 'api',
            protocol: 'http'
          }]
        }
      }
    }
  },
  {
    apiVersion: 'v0.1',
    name: 'nodejs',
    displayName: 'Node.js',
    version: '1.0.0',
    category: 'framework',
    description: 'JavaScript runtime built on Chrome\'s V8 engine',
    author: 'ARFNI Team',
    license: 'MIT',
    icon: 'icon.png',
    provides: {
      service_kinds: ['app.nodejs']
    },
    contributes: {
      canvas: {
        nodeType: 'nodejs',
        label: 'Node.js',
        description: 'JavaScript runtime',
        category: 'runtime',
        ports: [{ name: 'http', port: 3000, protocol: 'tcp' }],
        connections: {
          inputs: [{
            type: 'database',
            name: 'database',
            protocol: 'any',
            env_var: 'DATABASE_URL'
          }],
          outputs: [{
            type: 'api',
            name: 'api',
            protocol: 'http'
          }]
        }
      }
    }
  },
  {
    apiVersion: 'v0.1',
    name: 'python',
    displayName: 'Python',
    version: '1.0.0',
    category: 'framework',
    description: 'Python runtime for web applications',
    author: 'ARFNI Team',
    license: 'MIT',
    icon: 'icon.png',
    provides: {
      service_kinds: ['app.python']
    },
    contributes: {
      canvas: {
        nodeType: 'python',
        label: 'Python',
        description: 'Python runtime',
        category: 'runtime',
        ports: [{ name: 'http', port: 8000, protocol: 'tcp' }],
        connections: {
          inputs: [{
            type: 'database',
            name: 'database',
            protocol: 'any',
            env_var: 'DATABASE_URL'
          }],
          outputs: [{
            type: 'api',
            name: 'api',
            protocol: 'http'
          }]
        }
      }
    }
  }
];

class PluginService {
  private plugins: Map<string, LoadedPlugin> = new Map();
  private nodeTemplates: NodeTemplate[] = [];

  async loadPlugins(): Promise<void> {
    console.log('Loading plugins...');

    // Load bundled plugins from static configuration
    this.loadBundledPluginsStatic();

    // Load user-installed plugins from file system
    await this.loadUserPlugins();

    // Build node templates from plugins
    await this.buildNodeTemplates();
  }

  private loadBundledPluginsStatic(): void {
    for (const manifest of bundledPluginManifests) {
      const pluginPath = `plugins/bundled/${manifest.category}/${manifest.name}`;
      const iconPath = `${pluginPath}/icon.png`;

      const plugin: LoadedPlugin = {
        manifest,
        path: pluginPath,
        iconPath,
        isBundled: true
      };

      this.plugins.set(manifest.name, plugin);
      console.log(`Loaded bundled plugin: ${manifest.displayName || manifest.name}`);
    }
  }

  private async loadUserPlugins(): Promise<void> {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const installedPlugins = await invoke<any[]>('list_installed_plugins');

      for (const pluginInfo of installedPlugins) {
        try {
          // For each installed plugin, try to find its manifest
          // We need to search through category directories since PluginInfo doesn't include category
          const categories = ['database', 'framework', 'cache', 'proxy', 'cicd', 'orchestration', 'monitoring'];

          let manifest: PluginManifest | null = null;
          let foundCategory: string | null = null;

          for (const category of categories) {
            try {
              const manifestYaml = await invoke<string>('read_plugin_template', {
                pluginPath: `${category}/${pluginInfo.name}`,
                templatePath: 'plugin.yaml'
              });

              manifest = yaml.load(manifestYaml) as PluginManifest;
              foundCategory = category;
              break;
            } catch {
              // Try next category
              continue;
            }
          }

          if (!manifest || !foundCategory) {
            console.error(`Could not find manifest for plugin: ${pluginInfo.name}`);
            continue;
          }

          const pluginPath = `plugins/installed/${foundCategory}/${pluginInfo.name}`;
          const iconPath = `${pluginPath}/icon.png`;

          const plugin: LoadedPlugin = {
            manifest,
            path: pluginPath,
            iconPath,
            isBundled: false
          };

          this.plugins.set(manifest.name, plugin);
          console.log(`Loaded installed plugin: ${manifest.displayName || manifest.name}`);
        } catch (error) {
          console.error(`Failed to load plugin ${pluginInfo.name}:`, error);
        }
      }
    } catch (error) {
      console.error('Failed to load installed plugins:', error);
    }
  }

  private async buildNodeTemplates(): Promise<void> {
    this.nodeTemplates = [];

    for (const plugin of this.plugins.values()) {
      // Handle plugins with contributes.canvas (bundled plugins)
      const canvas = plugin.manifest.contributes?.canvas;
      if (canvas) {
        const template: NodeTemplate = {
          type: canvas.nodeType,
          label: canvas.label,
          description: canvas.description,
          icon: plugin.iconPath,
          category: canvas.category,
          plugin
        };

        this.nodeTemplates.push(template);
        continue;
      }

      // Handle plugins with frameworks section (installed plugins from arfni-plugins repo)
      if ((plugin.manifest as any).frameworks) {
        await this.loadFrameworkTemplate(plugin);
      }
    }

    console.log(`Built ${this.nodeTemplates.length} node templates from plugins`);
  }

  private async loadFrameworkTemplate(plugin: LoadedPlugin): Promise<void> {
    try {
      const frameworks = (plugin.manifest as any).frameworks;

      if (!Array.isArray(frameworks) || frameworks.length === 0) {
        return;
      }

      // Get the first framework definition
      const frameworkDef = frameworks[0];
      const frameworkPath = frameworkDef.source; // e.g., "frameworks/django.yaml"

      // Extract category and plugin name
      const category = plugin.manifest.category;
      const pluginName = plugin.manifest.name;

      let frameworkYaml: string;

      // Try to read from local installed files first
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        frameworkYaml = await invoke<string>('read_plugin_template', {
          pluginPath: `${category}/${pluginName}`,
          templatePath: frameworkPath
        });
      } catch (localError) {
        // If local file doesn't exist, fetch from GitHub
        console.log(`Local framework file not found, fetching from GitHub for ${pluginName}...`);

        const githubUrl = `https://raw.githubusercontent.com/Arfni/arfni-plugins/main/plugins/${category}s/${pluginName}/${frameworkPath}`;

        const response = await fetch(githubUrl);
        if (!response.ok) {
          throw new Error(`Failed to fetch framework YAML from GitHub: ${response.status}`);
        }

        frameworkYaml = await response.text();
      }

      const frameworkConfig = yaml.load(frameworkYaml) as any;

      // Create node template from framework config
      const template: NodeTemplate = {
        type: frameworkConfig.metadata.name,
        label: frameworkConfig.metadata.displayName || frameworkConfig.metadata.name,
        description: frameworkConfig.metadata.description,
        icon: plugin.iconPath,
        category: frameworkConfig.metadata.category,
        plugin
      };

      this.nodeTemplates.push(template);
      console.log(`Loaded framework template for: ${template.label}`);
    } catch (error) {
      console.error(`Failed to load framework template for plugin ${plugin.manifest.name}:`, error);
    }
  }

  getNodeTemplates(): NodeTemplate[] {
    return this.nodeTemplates;
  }

  getPlugin(name: string): LoadedPlugin | undefined {
    return this.plugins.get(name);
  }

  getPluginByNodeType(nodeType: string): LoadedPlugin | undefined {
    // Search through node templates instead of plugins directly
    // This handles both contributes.canvas and frameworks-based plugins
    const template = this.nodeTemplates.find(t => t.type === nodeType);
    return template?.plugin;
  }

  getAllPlugins(): LoadedPlugin[] {
    return Array.from(this.plugins.values());
  }

  getInstalledPlugins(): LoadedPlugin[] {
    return Array.from(this.plugins.values()).filter(p => !p.isBundled);
  }

  getBundledPlugins(): LoadedPlugin[] {
    return Array.from(this.plugins.values()).filter(p => p.isBundled);
  }
}

// Singleton instance
export const pluginService = new PluginService();