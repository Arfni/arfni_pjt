import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Info, Rocket, X, Check } from 'lucide-react';

interface Service {
  name: string;
  framework: string;
  kind: string;
  ports?: string[];
  build?: {
    context: string;
    dockerfile?: string;
  };
}

interface DeploymentServiceModalProps {
  open: boolean;
  onClose: () => void;
  projectId: string;
  onDeploy: (services: string[]) => void;
}

const frameworkColors: Record<string, string> = {
  'springboot': '#6DB33F',
  'react': '#61DAFB',
  'nodejs': '#339933',
  'nextjs': '#000000',
  'python': '#3776AB',
  'postgres': '#336791',
  'mysql': '#4479A1',
  'redis': '#DC382D',
  'unknown': '#757575'
};

export const DeploymentServiceModal: React.FC<DeploymentServiceModalProps> = ({
  open,
  onClose,
  projectId,
  onDeploy
}) => {
  const [services, setServices] = useState<Service[]>([]);
  const [selectedServices, setSelectedServices] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectAll, setSelectAll] = useState(true);

  useEffect(() => {
    if (open) {
      loadServices();
    }
  }, [open, projectId]);

  const loadServices = async () => {
    setLoading(true);
    setError(null);
    try {
      // Load services from stack.yaml
      const result = await invoke<Service[]>('get_project_services', { projectId });
      setServices(result);

      // Select all by default
      const allServiceNames = new Set(result.map((s: Service) => s.name));
      setSelectedServices(allServiceNames);
      setSelectAll(true);
    } catch (err) {
      setError(`Failed to load services: ${err}`);
      console.error('Failed to load services:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleServiceToggle = (serviceName: string) => {
    const newSelected = new Set(selectedServices);
    if (newSelected.has(serviceName)) {
      newSelected.delete(serviceName);
    } else {
      newSelected.add(serviceName);
    }
    setSelectedServices(newSelected);
    setSelectAll(newSelected.size === services.length);
  };

  const handleSelectAll = () => {
    if (selectAll) {
      setSelectedServices(new Set());
    } else {
      setSelectedServices(new Set(services.map(s => s.name)));
    }
    setSelectAll(!selectAll);
  };

  const handleDeploy = () => {
    if (selectedServices.size === 0) {
      setError('Please select at least one service to deploy');
      return;
    }
    onDeploy(Array.from(selectedServices));
    onClose();
  };

  const getFrameworkDisplay = (service: Service) => {
    // Extract framework from kind (e.g., "app.spring" -> "springboot")
    if (service.kind.startsWith('app.')) {
      const framework = service.kind.substring(4);
      if (framework === 'spring') return 'springboot';
      return framework;
    }
    if (service.kind.startsWith('database.')) {
      return service.kind.substring(9);
    }
    return service.framework || 'unknown';
  };

  const isDatabase = (service: Service) => {
    return service.kind.startsWith('database.');
  };

  const isInfrastructure = (service: Service) => {
    return service.kind.startsWith('cache.') || service.kind.startsWith('queue.');
  };

  const categorizeServices = () => {
    const apps = services.filter(s => !isDatabase(s) && !isInfrastructure(s));
    const databases = services.filter(s => isDatabase(s));
    const infra = services.filter(s => isInfrastructure(s));

    return { apps, databases, infra };
  };

  if (!open) return null;

  const { apps, databases, infra } = categorizeServices();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black bg-opacity-50" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl w-[600px] max-w-[90vw] max-h-[80vh] overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Rocket className="w-5 h-5 text-blue-600" />
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                Select Services to Deploy
              </h2>
            </div>
            <button
              onClick={onClose}
              className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
            >
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="px-6 py-4 max-h-[60vh] overflow-y-auto">
          {error && (
            <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
              <p className="text-red-700 dark:text-red-400 text-sm">{error}</p>
            </div>
          )}

          {loading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          ) : (
            <>
              {/* Select All */}
              <label className="flex items-center gap-2 mb-4 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectAll}
                  onChange={handleSelectAll}
                  className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                />
                <span className="font-semibold text-gray-900 dark:text-white">Select All</span>
              </label>

              {/* Applications */}
              {apps.length > 0 && (
                <div className="mb-6">
                  <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                    Applications
                  </h3>
                  <div className="space-y-2">
                    {apps.map((service) => {
                      const framework = getFrameworkDisplay(service);
                      return (
                        <label
                          key={service.name}
                          className="flex items-center gap-3 p-2 hover:bg-gray-50 dark:hover:bg-gray-700/50 rounded-lg cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={selectedServices.has(service.name)}
                            onChange={() => handleServiceToggle(service.name)}
                            className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                          />
                          <div className="flex items-center gap-2 flex-1">
                            <span className="text-gray-900 dark:text-white">{service.name}</span>
                            <span
                              className="px-2 py-0.5 text-xs font-medium rounded-full"
                              style={{
                                backgroundColor: `${frameworkColors[framework]}20`,
                                color: frameworkColors[framework]
                              }}
                            >
                              {framework}
                            </span>
                            {service.ports && service.ports.length > 0 && (
                              <div className="flex items-center gap-1 text-gray-500 dark:text-gray-400">
                                <Info className="w-3 h-3" />
                                <span className="text-xs">{service.ports.join(', ')}</span>
                              </div>
                            )}
                            {service.build?.context && (
                              <span className="text-xs text-gray-500 dark:text-gray-400">
                                ({service.build.context})
                              </span>
                            )}
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Databases */}
              {databases.length > 0 && (
                <div className="mb-6">
                  <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                    Databases
                  </h3>
                  <div className="space-y-2">
                    {databases.map((service) => {
                      const framework = getFrameworkDisplay(service);
                      return (
                        <label
                          key={service.name}
                          className="flex items-center gap-3 p-2 hover:bg-gray-50 dark:hover:bg-gray-700/50 rounded-lg cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={selectedServices.has(service.name)}
                            onChange={() => handleServiceToggle(service.name)}
                            className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                          />
                          <div className="flex items-center gap-2 flex-1">
                            <span className="text-gray-900 dark:text-white">{service.name}</span>
                            <span
                              className="px-2 py-0.5 text-xs font-medium rounded-full border"
                              style={{
                                borderColor: frameworkColors[framework],
                                color: frameworkColors[framework]
                              }}
                            >
                              {framework}
                            </span>
                            {service.ports && service.ports.length > 0 && (
                              <div className="flex items-center gap-1 text-gray-500 dark:text-gray-400">
                                <Info className="w-3 h-3" />
                                <span className="text-xs">{service.ports.join(', ')}</span>
                              </div>
                            )}
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Infrastructure */}
              {infra.length > 0 && (
                <div className="mb-6">
                  <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                    Infrastructure
                  </h3>
                  <div className="space-y-2">
                    {infra.map((service) => {
                      const framework = getFrameworkDisplay(service);
                      return (
                        <label
                          key={service.name}
                          className="flex items-center gap-3 p-2 hover:bg-gray-50 dark:hover:bg-gray-700/50 rounded-lg cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={selectedServices.has(service.name)}
                            onChange={() => handleServiceToggle(service.name)}
                            className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                          />
                          <div className="flex items-center gap-2 flex-1">
                            <span className="text-gray-900 dark:text-white">{service.name}</span>
                            <span className="px-2 py-0.5 text-xs font-medium rounded-full border border-gray-300 dark:border-gray-600">
                              {framework}
                            </span>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700">
          <div className="flex justify-end gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleDeploy}
              disabled={selectedServices.size === 0}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              <Rocket className="w-4 h-4" />
              Deploy {selectedServices.size > 0 ? `${selectedServices.size} Service${selectedServices.size > 1 ? 's' : ''}` : ''}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};