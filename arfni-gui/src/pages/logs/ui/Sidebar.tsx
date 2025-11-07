import React from 'react';
import { Package, Terminal, Activity, BarChart3, Sparkles } from 'lucide-react';
import { Project, EC2Server } from '@shared/api/tauri/commands';

interface SidebarProps {
  selectedView: 'containers' | 'terminal' | 'monitor' | 'optimize';
  onViewChange: (view: 'containers' | 'terminal' | 'monitor' | 'optimize') => void;
  onContainersRefresh: () => void;
  onTunnelOpen: () => Promise<void>;
  onNavigateToMonitoring: () => void;
  project: Project | null;
  ec2Server: EC2Server | null;
  tunnelOpen: boolean;
}

export function Sidebar({
  selectedView,
  onViewChange,
  onContainersRefresh,
  onTunnelOpen,
  onNavigateToMonitoring,
  project,
  tunnelOpen
}: SidebarProps) {
  const handleContainersClick = () => {
    onViewChange('containers');
    onContainersRefresh();
  };

  const handleOptimizeClick = async () => {
    onViewChange('optimize');

    // Auto-open tunnel if EC2 and not already open
    if (project?.environment === 'ec2' && !tunnelOpen) {
      try {
        await onTunnelOpen();
        // Wait briefly for tunnel to establish
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (error) {
        console.error('Failed to open tunnel:', error);
      }
    }
  };

  const handleMonitorClick = () => {
    onViewChange('monitor');
    onNavigateToMonitoring();
  };

  return (
    <aside className="w-24 bg-[#F9FAFE] flex flex-col items-center py-6 gap-4 border-r border-gray-200">
      {/* Containers */}
      <button
        onClick={handleContainersClick}
        className={`w-16 h-16 flex flex-col items-center justify-center gap-1 rounded-lg transition-colors ${
          selectedView === 'containers' ? 'bg-blue-50' : 'hover:bg-gray-100'
        }`}
        title="Containers"
      >
        <div className={`w-8 h-8 flex items-center justify-center rounded ${
          selectedView === 'containers' ? 'bg-green-500' : 'bg-gray-400'
        }`}>
          <Package className="w-5 h-5 text-white" />
        </div>
        <span className="text-xs font-medium text-gray-700">Containers</span>
      </button>

      {/* Terminal */}
      <button
        onClick={() => onViewChange('terminal')}
        className={`w-16 h-16 flex flex-col items-center justify-center gap-1 rounded-lg transition-colors ${
          selectedView === 'terminal' ? 'bg-blue-50' : 'hover:bg-gray-100'
        }`}
        title="Terminal"
      >
        <div className={`w-8 h-8 flex items-center justify-center rounded ${
          selectedView === 'terminal' ? 'bg-blue-500' : 'bg-gray-400'
        }`}>
          <Terminal className="w-5 h-5 text-white" />
        </div>
        <span className="text-xs font-medium text-gray-700">Terminal</span>
      </button>

      {/* Monitor */}
      <button
        onClick={handleMonitorClick}
        className={`w-16 h-16 flex flex-col items-center justify-center gap-1 rounded-lg transition-colors ${
          selectedView === 'monitor' ? 'bg-blue-50' : 'hover:bg-gray-100'
        }`}
        title="Monitor"
      >
        <div className="w-8 h-8 flex items-center justify-center rounded" style={{ backgroundColor: '#4C65E2' }}>
          <BarChart3 className="w-5 h-5 text-white" />
        </div>
        <span className="text-xs font-medium text-gray-700">Monitor</span>
      </button>

      {/* Optimize */}
      <button
        onClick={handleOptimizeClick}
        className={`w-16 h-16 flex flex-col items-center justify-center gap-1 rounded-lg transition-colors ${
          selectedView === 'optimize' ? 'bg-blue-50' : 'hover:bg-gray-100'
        }`}
        title="Optimize"
      >
        <div className="w-8 h-8 flex items-center justify-center rounded bg-gradient-to-br from-purple-500 to-pink-500">
          <Sparkles className="w-5 h-5 text-white" />
        </div>
        <span className="text-xs font-medium text-gray-700">Optimize</span>
      </button>
    </aside>
  );
}
