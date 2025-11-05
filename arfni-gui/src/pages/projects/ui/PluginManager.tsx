import { useState, useEffect } from 'react';
import { Package, Download, Trash2, CheckCircle, AlertCircle, Search, ExternalLink, RefreshCw } from 'lucide-react';
import { pluginService, type LoadedPlugin } from '@services/pluginLoader';
import { convertFileSrc } from '@tauri-apps/api/core';
import { appDataDir, join } from '@tauri-apps/api/path';

interface PluginManagerProps {
  className?: string;
}

interface RegistryPlugin {
  id: string;
  name: string;
  category: string;
  version: string;
  description: string;
  author: string;
  homepage: string;
  path: string;
  provides: {
    frameworks: string[];
    service_kinds: string[];
  };
  tags: string[];
  verified: boolean;
  status: string;
}

interface PluginRegistry {
  version: string;
  repository: string;
  plugins: RegistryPlugin[];
}

interface CacheInfo {
  exists: boolean;
  valid: boolean;
  age_hours: number | null;
  last_updated: string | null;
}

export function PluginManager({ className = '' }: PluginManagerProps) {
  const [bundledPlugins, setBundledPlugins] = useState<LoadedPlugin[]>([]);
  const [installedPlugins, setInstalledPlugins] = useState<LoadedPlugin[]>([]);
  const [registryPlugins, setRegistryPlugins] = useState<RegistryPlugin[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [installing, setInstalling] = useState(false);
  const [installUrl, setInstallUrl] = useState('');
  const [loadingRegistry, setLoadingRegistry] = useState(false);
  const [cacheInfo, setCacheInfo] = useState<CacheInfo | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadPlugins();
    loadRegistryPlugins();
    loadCacheInfo();
  }, []);

  const loadPlugins = async () => {
    try {
      await pluginService.loadPlugins();
      setBundledPlugins(pluginService.getBundledPlugins());
      setInstalledPlugins(pluginService.getInstalledPlugins());
    } catch (error) {
      console.error('Failed to load plugins:', error);
    }
  };

  const reloadPlugins = async () => {
    try {
      await pluginService.reloadPlugins();
      setBundledPlugins(pluginService.getBundledPlugins());
      setInstalledPlugins(pluginService.getInstalledPlugins());
    } catch (error) {
      console.error('Failed to reload plugins:', error);
    }
  };

  const loadCacheInfo = async () => {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const info = await invoke<CacheInfo>('get_cache_info');
      setCacheInfo(info);
    } catch (error) {
      console.error('Failed to load cache info:', error);
    }
  };

  const loadRegistryPlugins = async () => {
    setLoadingRegistry(true);
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const registryJson = await invoke<string>('load_plugin_registry');
      const registry: PluginRegistry = JSON.parse(registryJson);
      setRegistryPlugins(registry.plugins);
      await loadCacheInfo(); // Update cache info after loading
    } catch (error) {
      console.error('Failed to load plugin registry:', error);
    } finally {
      setLoadingRegistry(false);
    }
  };

  const handleRefreshRegistry = async () => {
    setRefreshing(true);
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const registryJson = await invoke<string>('refresh_plugin_registry');
      const registry: PluginRegistry = JSON.parse(registryJson);
      setRegistryPlugins(registry.plugins);
      await loadCacheInfo(); // Update cache info after refresh
      console.log('✅ Registry refreshed successfully');
    } catch (error) {
      console.error('Failed to refresh plugin registry:', error);
    } finally {
      setRefreshing(false);
    }
  };

  const handleInstallFromRegistry = async (plugin: RegistryPlugin) => {
    setInstalling(true);
    try {
      const { invoke } = await import('@tauri-apps/api/core');

      // Fetch plugin.yaml from GitHub
      const manifestUrl = `https://raw.githubusercontent.com/Arfni/arfni-plugins/main/${plugin.path}/plugin.yaml`;
      const manifestResponse = await fetch(manifestUrl);
      if (!manifestResponse.ok) {
        throw new Error('Failed to fetch plugin manifest');
      }
      const manifestYaml = await manifestResponse.text();

      // Call install_plugin with correct parameters
      const result = await invoke<string>('install_plugin', {
        owner: 'Arfni',
        repo: 'arfni-plugins',
        version: 'main',
        manifestYaml: manifestYaml
      });

      alert(`✅ ${result}`);

      // Reload plugins after installation
      await reloadPlugins();
    } catch (error) {
      console.error('Failed to install plugin:', error);
      alert(`❌ Failed to install plugin: ${error}`);
    } finally {
      setInstalling(false);
    }
  };

  const handleInstallPlugin = async () => {
    if (!installUrl) return;

    setInstalling(true);
    try {
      // Parse GitHub URL (e.g., https://github.com/owner/repo/tree/branch/path)
      const urlMatch = installUrl.match(/github\.com\/([^\/]+)\/([^\/]+)(?:\/tree\/([^\/]+)\/(.+))?/);
      if (!urlMatch) {
        throw new Error('Invalid GitHub URL format');
      }

      const [, owner, repo, branch = 'main', path = ''] = urlMatch;

      // Fetch plugin.yaml from GitHub
      const manifestUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${path}/plugin.yaml`;
      const manifestResponse = await fetch(manifestUrl);
      if (!manifestResponse.ok) {
        throw new Error('Failed to fetch plugin manifest from GitHub');
      }
      const manifestYaml = await manifestResponse.text();

      const { invoke } = await import('@tauri-apps/api/core');
      const result = await invoke<string>('install_plugin', {
        owner,
        repo,
        version: branch,
        manifestYaml: manifestYaml
      });

      alert(`✅ ${result}`);

      // Reload plugins after installation
      await reloadPlugins();
      setInstallUrl('');
    } catch (error) {
      console.error('Failed to install plugin:', error);
      alert(`❌ Failed to install plugin: ${error}`);
    } finally {
      setInstalling(false);
    }
  };

  const handleUninstallPlugin = async (plugin: LoadedPlugin) => {
    if (!confirm(`Are you sure you want to uninstall ${plugin.manifest.displayName}?`)) {
      return;
    }

    try {
      // Call Tauri command to uninstall plugin
      const { invoke } = await import('@tauri-apps/api/core');
      const result = await invoke<string>('uninstall_plugin', {
        pluginName: plugin.manifest.name
      });

      alert(`✅ ${result}`);

      // Reload plugins after uninstallation
      await reloadPlugins();
    } catch (error) {
      console.error('Failed to uninstall plugin:', error);
      alert(`❌ Failed to uninstall plugin: ${error}`);
    }
  };

  const categories = ['all', 'database', 'framework', 'cache', 'proxy', 'cicd', 'orchestration', 'monitoring'];

  const filteredBundledPlugins = bundledPlugins.filter(plugin => {
    const displayName = plugin.manifest.displayName || plugin.manifest.name || '';
    const description = plugin.manifest.description || '';
    const matchesSearch = displayName.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          description.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = selectedCategory === 'all' || plugin.manifest.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const filteredInstalledPlugins = installedPlugins.filter(plugin => {
    const displayName = plugin.manifest.displayName || plugin.manifest.name || '';
    const description = plugin.manifest.description || '';
    const matchesSearch = displayName.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          description.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = selectedCategory === 'all' || plugin.manifest.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const filteredRegistryPlugins = registryPlugins.filter(plugin => {
    const matchesSearch = plugin.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          plugin.description.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = selectedCategory === 'all' || plugin.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  return (
    <div className={`flex flex-col h-full ${className}`}>
      {/* Header */}
      <div className="p-6 border-b border-gray-200">
        <h2 className="text-2xl font-semibold text-gray-900 mb-4">Plugin Management</h2>

        {/* Install from URL */}
        <div className="mb-4">
          <div className="flex gap-2">
            <input
              type="text"
              value={installUrl}
              onChange={(e) => setInstallUrl(e.target.value)}
              placeholder="Enter GitHub repository URL (e.g., https://github.com/user/arfni-plugin-example)"
              className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={installing}
            />
            <button
              onClick={handleInstallPlugin}
              disabled={!installUrl || installing}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {installing ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  Installing...
                </>
              ) : (
                <>
                  <Download className="w-4 h-4" />
                  Install Plugin
                </>
              )}
            </button>
          </div>
        </div>

        {/* Search and Filter */}
        <div className="flex gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search plugins..."
              className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {categories.map(cat => (
              <option key={cat} value={cat}>
                {cat.charAt(0).toUpperCase() + cat.slice(1)}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Plugin Lists */}
      <div className="flex-1 overflow-y-auto p-6">
        {/* Bundled Plugins */}
        <div className="mb-8">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">Built-in Plugins</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredBundledPlugins.map(plugin => (
              <PluginCard key={plugin.manifest.name} plugin={plugin} isBundled={true} />
            ))}
          </div>
          {filteredBundledPlugins.length === 0 && (
            <div className="text-center py-8 text-gray-500">
              No bundled plugins found matching your search.
            </div>
          )}
        </div>

        {/* Installed Plugins */}
        <div className="mb-8">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">Installed Plugins</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredInstalledPlugins.map(plugin => (
              <PluginCard
                key={plugin.manifest.name}
                plugin={plugin}
                isBundled={false}
                onUninstall={() => handleUninstallPlugin(plugin)}
              />
            ))}
          </div>
          {filteredInstalledPlugins.length === 0 && (
            <div className="text-center py-8 text-gray-500">
              No installed plugins found. Install plugins from GitHub using the URL above.
            </div>
          )}
        </div>

        {/* Available Plugins from Registry */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-lg font-semibold text-gray-800">Available Plugins from Registry</h3>
              {cacheInfo && cacheInfo.exists && (
                <p className="text-sm text-gray-500 mt-1">
                  {cacheInfo.valid ? (
                    <>
                      Last synced: {cacheInfo.age_hours !== null && cacheInfo.age_hours === 0 ? 'just now' : `${cacheInfo.age_hours} hour${cacheInfo.age_hours !== 1 ? 's' : ''} ago`}
                      {' '}<span className="text-green-600">(cached)</span>
                    </>
                  ) : (
                    <>
                      Cache expired ({cacheInfo.age_hours} hours old)
                      {' '}<span className="text-yellow-600">(stale)</span>
                    </>
                  )}
                </p>
              )}
            </div>
            <button
              onClick={handleRefreshRegistry}
              disabled={refreshing || loadingRegistry}
              className="px-3 py-1 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-md flex items-center gap-2 disabled:opacity-50"
              title="Force refresh from GitHub (ignores cache)"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
              {refreshing ? 'Refreshing...' : 'Force Refresh'}
            </button>
          </div>
          {loadingRegistry ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
              <p className="text-gray-500 mt-4">Loading registry...</p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredRegistryPlugins.map(plugin => (
                  <RegistryPluginCard
                    key={plugin.id}
                    plugin={plugin}
                    onInstall={() => handleInstallFromRegistry(plugin)}
                    installing={installing}
                  />
                ))}
              </div>
              {filteredRegistryPlugins.length === 0 && (
                <div className="text-center py-8 text-gray-500">
                  No registry plugins found matching your search.
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

interface PluginCardProps {
  plugin: LoadedPlugin;
  isBundled: boolean;
  onUninstall?: () => void;
}

function PluginCard({ plugin, isBundled, onUninstall }: PluginCardProps) {
  const [iconUrl, setIconUrl] = useState<string | null>(null);

  const categoryColors: Record<string, string> = {
    database: 'bg-blue-100 text-blue-800',
    framework: 'bg-green-100 text-green-800',
    cache: 'bg-orange-100 text-orange-800',
    proxy: 'bg-purple-100 text-purple-800',
    cicd: 'bg-yellow-100 text-yellow-800',
    orchestration: 'bg-indigo-100 text-indigo-800',
    monitoring: 'bg-red-100 text-red-800',
  };

  useEffect(() => {
    const loadIconUrl = async () => {
      if (isBundled) {
        // Bundled plugins - use relative URL (works in both dev and production)
        // Dev: Vite serves public folder at root
        // Prod: Tauri serves bundled resources
        setIconUrl(`/${plugin.iconPath}`);
      } else {
        // Installed plugins - use plugin.iconPath from pluginLoader
        // iconPath format: "plugins/installed/framework/django/icon.png"
        try {
          const dataDir = await appDataDir();
          // Remove 'plugins/' prefix and join with appDataDir
          const relativePath = plugin.iconPath.replace(/^plugins\//, '');
          const iconPath = await join(dataDir, relativePath);
          const assetUrl = convertFileSrc(iconPath);
          console.log(`Installed Plugin Icon: ${plugin.manifest.name}, Path: ${iconPath}, URL: ${assetUrl}`);
          setIconUrl(assetUrl);
        } catch (error) {
          console.error(`Failed to load icon for ${plugin.manifest.name}:`, error);
          setIconUrl(null);
        }
      }
    };

    loadIconUrl();
  }, [plugin, isBundled]);

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-lg transition-shadow">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center overflow-hidden">
            {iconUrl ? (
              <img src={iconUrl} alt={plugin.manifest.displayName} className="w-full h-full object-cover" />
            ) : (
              <Package className="w-6 h-6 text-gray-600" />
            )}
          </div>
          <div>
            <h4 className="font-semibold text-gray-900">{plugin.manifest.displayName}</h4>
            <p className="text-xs text-gray-500">v{plugin.manifest.version}</p>
          </div>
        </div>
        {isBundled ? (
          <CheckCircle className="w-5 h-5 text-green-500" />
        ) : (
          <button
            onClick={onUninstall}
            className="p-1 hover:bg-red-50 rounded transition-colors"
            title="Uninstall plugin"
          >
            <Trash2 className="w-4 h-4 text-red-500" />
          </button>
        )}
      </div>

      <p className="text-sm text-gray-600 mb-3">{plugin.manifest.description}</p>

      <div className="flex items-center justify-between">
        <span className={`text-xs px-2 py-1 rounded-full ${categoryColors[plugin.manifest.category] || 'bg-gray-100 text-gray-800'}`}>
          {plugin.manifest.category}
        </span>
        <span className="text-xs text-gray-500">by {plugin.manifest.author}</span>
      </div>

      {plugin.manifest.provides?.service_kinds && (
        <div className="mt-3 pt-3 border-t border-gray-100">
          <p className="text-xs text-gray-500">Provides:</p>
          <div className="flex flex-wrap gap-1 mt-1">
            {plugin.manifest.provides.service_kinds.map(kind => (
              <span key={kind} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
                {kind}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

interface RegistryPluginCardProps {
  plugin: RegistryPlugin;
  onInstall: () => void;
  installing: boolean;
}

function RegistryPluginCard({ plugin, onInstall, installing }: RegistryPluginCardProps) {
  const [iconUrl, setIconUrl] = useState<string | null>(null);
  const [iconError, setIconError] = useState(false);

  const categoryColors: Record<string, string> = {
    database: 'bg-blue-100 text-blue-800',
    framework: 'bg-green-100 text-green-800',
    cache: 'bg-orange-100 text-orange-800',
    proxy: 'bg-purple-100 text-purple-800',
    cicd: 'bg-yellow-100 text-yellow-800',
    orchestration: 'bg-indigo-100 text-indigo-800',
    monitoring: 'bg-red-100 text-red-800',
  };

  useEffect(() => {
    // GitHub raw URL for icon
    const iconGithubUrl = `https://raw.githubusercontent.com/Arfni/arfni-plugins/main/${plugin.path}/icon.png`;
    setIconUrl(iconGithubUrl);
  }, [plugin]);

  const handleIconError = () => {
    setIconError(true);
  };

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-lg transition-shadow">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center overflow-hidden">
            {iconUrl && !iconError ? (
              <img
                src={iconUrl}
                alt={plugin.name}
                className="w-full h-full object-cover"
                onError={handleIconError}
              />
            ) : (
              <Package className="w-6 h-6 text-gray-600" />
            )}
          </div>
          <div>
            <h4 className="font-semibold text-gray-900">{plugin.name}</h4>
            <p className="text-xs text-gray-500">v{plugin.version}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {plugin.verified && (
            <span title="Verified">
              <CheckCircle className="w-4 h-4 text-green-500" />
            </span>
          )}
          <a
            href={plugin.homepage}
            target="_blank"
            rel="noopener noreferrer"
            className="p-1 hover:bg-gray-50 rounded transition-colors"
            title="View on GitHub"
          >
            <ExternalLink className="w-4 h-4 text-gray-500" />
          </a>
        </div>
      </div>

      <p className="text-sm text-gray-600 mb-3">{plugin.description}</p>

      <div className="flex items-center justify-between mb-3">
        <span className={`text-xs px-2 py-1 rounded-full ${categoryColors[plugin.category] || 'bg-gray-100 text-gray-800'}`}>
          {plugin.category}
        </span>
        <span className="text-xs text-gray-500">by {plugin.author}</span>
      </div>

      {plugin.provides?.service_kinds && plugin.provides.service_kinds.length > 0 && (
        <div className="mb-3 pb-3 border-b border-gray-100">
          <p className="text-xs text-gray-500">Provides:</p>
          <div className="flex flex-wrap gap-1 mt-1">
            {plugin.provides.service_kinds.map(kind => (
              <span key={kind} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
                {kind}
              </span>
            ))}
          </div>
        </div>
      )}

      {plugin.tags && plugin.tags.length > 0 && (
        <div className="mb-3 pb-3 border-b border-gray-100">
          <p className="text-xs text-gray-500">Tags:</p>
          <div className="flex flex-wrap gap-1 mt-1">
            {plugin.tags.slice(0, 4).map(tag => (
              <span key={tag} className="text-xs bg-gray-50 text-gray-600 px-2 py-0.5 rounded">
                {tag}
              </span>
            ))}
            {plugin.tags.length > 4 && (
              <span className="text-xs text-gray-500">+{plugin.tags.length - 4} more</span>
            )}
          </div>
        </div>
      )}

      <button
        onClick={onInstall}
        disabled={installing}
        className="w-full px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
      >
        {installing ? (
          <>
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
            Installing...
          </>
        ) : (
          <>
            <Download className="w-4 h-4" />
            Install
          </>
        )}
      </button>
    </div>
  );
}