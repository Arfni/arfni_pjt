// Plugin loader with static bundled plugins for now
// This will be replaced with dynamic loading in the future

import yaml from 'js-yaml';

export interface PluginManifest {
  apiVersion: string;
  name: string;
  displayName: string;
  version: string;
  category: 'database' | 'framework' | 'cache' | 'proxy' | 'gateway' | 'cicd' | 'orchestration' | 'monitoring' | 'custom';
  description: string;
  author: string;
  license: string;
  icon: string;
  provides?: {
    service_kinds?: string[];
  };
  inputs?: Record<string, any>;  // Plugin inputs for property forms
  contributes?: {
    services?: Record<string, any>;
    canvas?: {
      nodeType: string;
      label: string;
      description: string;
      category: 'database' | 'runtime' | 'infra' | 'monitor' | 'gateway';
      hidden?: boolean;
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
  isCustomPlugin: boolean; // True if plugin is in custom/ folder
  frameworkDefinition?: any; // Framework definition from frameworks/*.yaml
}

export interface NodeTemplate {
  type: string;
  label: string;
  description: string;
  icon: string;
  category: 'runtime' | 'database' | 'infra' | 'monitor' | 'gateway';
  plugin?: LoadedPlugin;
}

// Bundled plugins are now loaded dynamically from plugin.yaml files
// No more hardcoded manifests!

class PluginService {
  private plugins: Map<string, LoadedPlugin> = new Map();
  private nodeTemplates: NodeTemplate[] = [];
  private isLoaded: boolean = false;
  private loadingPromise: Promise<void> | null = null;

  async loadPlugins(): Promise<void> {
    // If already loaded, skip
    if (this.isLoaded) {
      return;
    }

    // If currently loading, wait for that to finish
    if (this.loadingPromise) {
      return this.loadingPromise;
    }

    // Create loading promise
    this.loadingPromise = (async () => {
      // Clear existing plugins to prevent duplicates
      this.plugins.clear();
      this.nodeTemplates = [];

      // Load bundled plugins from plugin.yaml files
      await this.loadBundledPluginsStatic();

      // Load user-installed plugins from file system
      await this.loadUserPlugins();

      // Build node templates from plugins
      await this.buildNodeTemplates();

      this.isLoaded = true;
      this.loadingPromise = null;
    })();

    return this.loadingPromise;
  }

  // Force reload plugins (for plugin manager refresh)
  async reloadPlugins(): Promise<void> {
    this.isLoaded = false;
    this.loadingPromise = null;
    return this.loadPlugins();
  }

  private async loadBundledPluginsStatic(): Promise<void> {
    try {
      const bundledPath = 'plugins/bundled';
      const categories = ['database', 'framework', 'cache', 'proxy', 'gateway', 'cicd', 'orchestration', 'monitoring', 'custom'];

      for (const category of categories) {
        const categoryPath = `${bundledPath}/${category}`;

        try {
          // Read all plugin directories in this category
          const plugins = await this.listBundledPlugins(categoryPath);

          for (const pluginDir of plugins) {
            const pluginPath = `${categoryPath}/${pluginDir}`;
            await this.loadBundledPlugin(pluginPath);
          }
        } catch (e) {
          console.log(`No bundled plugins in category: ${category}`);
        }
      }
    } catch (error) {
      console.error('Error loading bundled plugins:', error);
    }
  }

  private async loadBundledPlugin(pluginPath: string): Promise<void> {
    try {
      const { invoke } = await import('@tauri-apps/api/core');

      // Extract category and plugin name from path
      // pluginPath format: "plugins/bundled/framework/springboot"
      const pathParts = pluginPath.split('/');
      const category = pathParts[2]; // "framework"
      const pluginName = pathParts[3]; // "springboot"
      const relativePluginPath = `${category}/${pluginName}`;

      // Read plugin.yaml using Tauri command
      const manifestContent = await invoke<string>('read_bundled_plugin_manifest', {
        pluginPath: relativePluginPath
      });

      const manifest = yaml.load(manifestContent) as PluginManifest;

      // Skip if no name or no contributes section
      if (!manifest.name || !manifest.contributes) {
        return;
      }

      // Plugin must have either canvas or services to be useful
      if (!manifest.contributes.canvas && !manifest.contributes.services) {
        return;
      }

      // Icon path - will be loaded separately using Tauri command in UI components
      const iconPath = `${pluginPath}/icon.png`;

      const plugin: LoadedPlugin = {
        manifest,
        path: pluginPath,
        iconPath,
        isBundled: true,
        isCustomPlugin: false // Bundled plugins are never custom
      };

      this.plugins.set(manifest.name, plugin);
    } catch (error) {
      console.error(`Error loading bundled plugin from ${pluginPath}:`, error);
    }
  }

  private async listBundledPlugins(categoryPath: string): Promise<string[]> {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const category = categoryPath.split('/').pop();

      // Use Tauri command to list bundled plugins
      const plugins = await invoke<string[]>('list_bundled_plugins', {
        category: category || ''
      });

      return plugins;
    } catch (error) {
      console.error(`Error listing bundled plugins for ${categoryPath}:`, error);
      return [];
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
          const categories = ['database', 'framework', 'cache', 'proxy', 'gateway', 'cicd', 'orchestration', 'monitoring', 'custom'];

          let manifest: PluginManifest | null = null;
          let foundCategory: string | null = null;

          for (const category of categories) {
            try {
              const manifestYaml = await invoke<string>('read_plugin_template', {
                pluginPath: `${category}/${pluginInfo.name}`,
                templatePath: 'plugin.yaml'
              });

              manifest = yaml.load(manifestYaml) as PluginManifest;
              // Use the directory category for file paths
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

          // Use the directory category for file paths (foundCategory)
          // The manifest.category is used for UI display and filtering
          const pluginPath = `plugins/installed/${foundCategory}/${pluginInfo.name}`;
          const iconPath = `${pluginPath}/icon.png`;

          const plugin: LoadedPlugin = {
            manifest,
            path: pluginPath,
            iconPath,
            isBundled: false,
            isCustomPlugin: foundCategory === 'custom' // Mark as custom if in custom/ folder
          };

          // Use manifest.name as the key (name collision is prevented by Rust validation)
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
        // Don't add to node templates if hidden, but plugin is still loaded and usable
        if (!canvas.hidden) {
          const template: NodeTemplate = {
            type: canvas.nodeType,
            label: canvas.label,
            description: canvas.description,
            icon: plugin.iconPath,
            category: canvas.category,
            plugin
          };

          this.nodeTemplates.push(template);
        }
        continue;
      }

      // Handle plugins with frameworks section (installed plugins from arfni-plugins repo)
      if ((plugin.manifest as any).frameworks) {
        await this.loadFrameworkTemplate(plugin);
      }
    }
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
          pluginPath: `bundled/${category}/${pluginName}`,
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

      // Store framework definition in plugin
      plugin.frameworkDefinition = frameworkConfig;

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
    // First try to find in node templates (visible plugins)
    const template = this.nodeTemplates.find(t => t.type === nodeType);
    if (template) {
      return template.plugin;
    }

    // If not found in templates, search directly in plugins (for hidden plugins like monitoring)
    // Check if any plugin has this nodeType in their canvas config
    for (const plugin of this.plugins.values()) {
      if (plugin.manifest.contributes?.canvas?.nodeType === nodeType) {
        return plugin;
      }
    }

    return undefined;
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

  /**
   * Get property form definition for a specific service type from plugins
   */
  getPropertyForm(serviceType: string): any[] | null {
    // Try direct lookup by service type (plugin name)
    let plugin = this.plugins.get(serviceType);

    // Fallback: lookup by nodeType (handles spring/springboot mismatch)
    if (!plugin) {
      const template = this.nodeTemplates.find(t => t.type === serviceType);
      plugin = template?.plugin;
    }

    if (!plugin) {
      console.warn(`No plugin found for service type: ${serviceType}`);
      return null;
    }

    // Convert plugin.manifest.inputs to propertyForm format
    if (plugin.manifest.inputs) {
      const inputs = plugin.manifest.inputs as Record<string, any>;
      return Object.entries(inputs).map(([name, config]) => ({
        name,
        label: config.description || name,
        type: config.type || 'text',
        required: config.required || false,
        default: config.default,
        options: config.options,
        placeholder: config.placeholder,
        description: config.description,
        env_var: config.env_var,
        scope: config.scope,
      }));
    }

    // Fallback: Check if plugin has old framework definition with propertyForm
    if (plugin.frameworkDefinition?.propertyForm) {
      return plugin.frameworkDefinition.propertyForm;
    }

    return null;
  }

  /**
   * Get plugin by service type
   */
  getPluginByServiceType(serviceType: string): LoadedPlugin | null {
    return this.plugins.get(serviceType) || null;
  }
}

// Singleton instance
export const pluginService = new PluginService();