import React from 'react';
import { Container, Terminal, Activity, BarChart3, Sparkles } from 'lucide-react';
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
      {/* Terminal */}
      <button
        onClick={() => onViewChange('terminal')}
        className={`w-16 h-16 flex flex-col items-center justify-center gap-1 rounded-lg transition-colors ${
          selectedView === 'terminal' ? 'bg-blue-50' : 'hover:bg-gray-100'
        }`}
        title="Terminal"
      >
        <div
          className="w-8 h-8 flex items-center justify-center rounded"
          style={{ backgroundColor: selectedView === 'terminal' ? '#4C65E2' : '#9CA3AF' }}
        >
          <Terminal className="w-5 h-5 text-white" />
        </div>
        <span className="text-xs font-medium text-gray-700">Terminal</span>
      </button>

      {/* Containers */}
      <button
        onClick={handleContainersClick}
        className={`w-16 h-16 flex flex-col items-center justify-center gap-1 rounded-lg transition-colors ${
          selectedView === 'containers' ? 'bg-blue-50' : 'hover:bg-gray-100'
        }`}
        title="Containers"
      >
        <div
          className="w-8 h-8 flex items-center justify-center rounded"
          style={{ backgroundColor: selectedView === 'containers' ? '#4C65E2' : '#9CA3AF' }}
        >
          <Container className="w-5 h-5 text-white" />
        </div>
        <span className="text-xs font-medium text-gray-700">Containers</span>
      </button>

      {/* Monitor */}
      <button
        onClick={handleMonitorClick}
        className={`w-16 h-16 flex flex-col items-center justify-center gap-1 rounded-lg transition-colors ${
          selectedView === 'monitor' ? 'bg-blue-50' : 'hover:bg-gray-100'
        }`}
        title="Monitor"
      >
        <div
          className="w-8 h-8 flex items-center justify-center rounded"
          style={{ backgroundColor: selectedView === 'monitor' ? '#4C65E2' : '#9CA3AF' }}
        >
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
        <div
          className="w-8 h-8 flex items-center justify-center rounded"
          style={{ backgroundColor: selectedView === 'optimize' ? '#4C65E2' : '#9CA3AF' }}
        >
          <Sparkles className="w-5 h-5 text-white" />
        </div>
        <span className="text-xs font-medium text-gray-700">Optimize</span>
      </button>
    </aside>
  );
}
