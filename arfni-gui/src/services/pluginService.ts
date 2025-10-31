import { invoke } from '@tauri-apps/api/core';
import { BaseDirectory, readTextFile, readDir, exists } from '@tauri-apps/plugin-fs';
import { join } from '@tauri-apps/api/path';
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

class PluginService {
  private plugins: Map<string, LoadedPlugin> = new Map();
  private nodeTemplates: NodeTemplate[] = [];

  async loadPlugins(): Promise<void> {
    console.log('Loading plugins...');

    // Load bundled plugins
    await this.loadBundledPlugins();

    // Load user-installed plugins
    await this.loadUserPlugins();

    // Build node templates from plugins
    this.buildNodeTemplates();
  }

  private async loadBundledPlugins(): Promise<void> {
    try {
      const bundledPath = 'plugins/bundled';
      const categories = ['database', 'framework', 'cache', 'proxy', 'cicd', 'orchestration', 'monitoring'];

      for (const category of categories) {
        const categoryPath = `${bundledPath}/${category}`;

        try {
          // Check if directory exists by trying to list it
          const plugins = await this.listDirectory(categoryPath);

          for (const pluginDir of plugins) {
            const pluginPath = `${categoryPath}/${pluginDir}`;
            await this.loadPlugin(pluginPath, true);
          }
        } catch (e) {
          // Category directory might not exist yet
          console.log(`No bundled plugins in category: ${category}`);
        }
      }
    } catch (error) {
      console.error('Error loading bundled plugins:', error);
    }
  }

  private async loadUserPlugins(): Promise<void> {
    try {
      const userPluginsPath = 'plugins/installed';

      // Check if user plugins directory exists
      if (await this.directoryExists(userPluginsPath)) {
        const categories = ['database', 'framework', 'cache', 'proxy', 'cicd', 'orchestration', 'monitoring'];

        for (const category of categories) {
          const categoryPath = `${userPluginsPath}/${category}`;

          try {
            const plugins = await this.listDirectory(categoryPath);

            for (const pluginDir of plugins) {
              const pluginPath = `${categoryPath}/${pluginDir}`;
              await this.loadPlugin(pluginPath, false);
            }
          } catch (e) {
            console.log(`No user plugins in category: ${category}`);
          }
        }
      }
    } catch (error) {
      console.error('Error loading user plugins:', error);
    }
  }

  private async loadPlugin(pluginPath: string, isBundled: boolean): Promise<void> {
    try {
      const manifestPath = `${pluginPath}/plugin.yaml`;
      const manifestContent = await this.readFile(manifestPath);

      if (!manifestContent) {
        console.warn(`Plugin manifest not found: ${manifestPath}`);
        return;
      }

      const manifest = yaml.load(manifestContent) as PluginManifest;

      if (!manifest.name || !manifest.contributes?.canvas) {
        console.log(`Plugin ${manifest.name} does not contribute to canvas, skipping...`);
        return;
      }

      const iconPath = `${pluginPath}/icon.png`;

      const plugin: LoadedPlugin = {
        manifest,
        path: pluginPath,
        iconPath,
        isBundled
      };

      this.plugins.set(manifest.name, plugin);
      console.log(`Loaded plugin: ${manifest.displayName || manifest.name}`);
    } catch (error) {
      console.error(`Error loading plugin from ${pluginPath}:`, error);
    }
  }

  private buildNodeTemplates(): void {
    this.nodeTemplates = [];

    for (const plugin of this.plugins.values()) {
      const canvas = plugin.manifest.contributes?.canvas;
      if (!canvas) continue;

      // Map plugin category to NodePalette category
      let paletteCategory: 'runtime' | 'database' | 'infra' | 'monitor' = canvas.category;

      // Handle category mapping
      if (plugin.manifest.category === 'framework') {
        paletteCategory = 'runtime';
      } else if (plugin.manifest.category === 'cache') {
        paletteCategory = 'database'; // Cache shown under DB tab
      } else if (plugin.manifest.category === 'proxy') {
        paletteCategory = 'infra';
      } else if (plugin.manifest.category === 'monitoring') {
        paletteCategory = 'monitor';
      }

      const template: NodeTemplate = {
        type: canvas.nodeType,
        label: canvas.label,
        description: canvas.description,
        icon: plugin.iconPath,
        category: paletteCategory,
        plugin
      };

      this.nodeTemplates.push(template);
    }

    console.log(`Built ${this.nodeTemplates.length} node templates from plugins`);
  }

  getNodeTemplates(): NodeTemplate[] {
    return this.nodeTemplates;
  }

  getPlugin(name: string): LoadedPlugin | undefined {
    return this.plugins.get(name);
  }

  getPluginByNodeType(nodeType: string): LoadedPlugin | undefined {
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

  // Helper methods for file system operations
  private async readFile(path: string): Promise<string | null> {
    try {
      // For bundled plugins, we need to use a different approach
      // as they're part of the application bundle
      const response = await fetch(`/${path}`);
      if (response.ok) {
        return await response.text();
      }
      return null;
    } catch (error) {
      // Fallback to Tauri file system for user plugins
      try {
        return await readTextFile(path);
      } catch (e) {
        return null;
      }
    }
  }

  private async listDirectory(path: string): Promise<string[]> {
    try {
      // For now, return hardcoded list of known plugins
      // This will be replaced with actual directory listing
      if (path.includes('bundled/database')) {
        return ['postgresql', 'mysql', 'mongodb'];
      } else if (path.includes('bundled/framework')) {
        return ['react', 'nextjs', 'springboot', 'nodejs', 'python'];
      } else if (path.includes('bundled/cache')) {
        return ['redis'];
      }
      return [];
    } catch (error) {
      return [];
    }
  }

  private async directoryExists(path: string): Promise<boolean> {
    try {
      await readDir(path);
      return true;
    } catch {
      return false;
    }
  }

  // Method to get icon as data URL for rendering
  async getIconDataUrl(iconPath: string): Promise<string> {
    try {
      // For bundled plugins, construct the path relative to assets
      if (iconPath.startsWith('plugins/bundled/')) {
        // Extract the technology name from path
        const parts = iconPath.split('/');
        const techName = parts[parts.length - 2]; // e.g., 'postgresql', 'react'

        // Map to actual asset imports (this will be handled by the component)
        return techName;
      }

      // For user-installed plugins, read the actual file
      const iconData = await readTextFile(iconPath);
      return `data:image/png;base64,${iconData}`;
    } catch (error) {
      console.error(`Error loading icon from ${iconPath}:`, error);
      return '';
    }
  }
}

// Singleton instance
export const pluginService = new PluginService();