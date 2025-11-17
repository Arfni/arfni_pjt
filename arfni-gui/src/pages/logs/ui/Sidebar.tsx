import React from 'react';
import { Container, Terminal, Activity, BarChart3, Sparkles } from 'lucide-react';
import { Project, EC2Server } from '@shared/api/tauri/commands';
import { useTranslation } from 'react-i18next';

interface SidebarProps {
  selectedView: 'containers' | 'terminal' | 'monitor' | 'analyze';
  onViewChange: (view: 'containers' | 'terminal' | 'monitor' | 'analyze') => void;
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
  const { t } = useTranslation('logs');

  const handleContainersClick = () => {
    onViewChange('containers');
    onContainersRefresh();
  };

  const handleAnalyzeClick = async () => {
    onViewChange('analyze');

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
  };

  return (
    <aside className="w-24 border-r border-gray-200 flex flex-col" style={{ backgroundColor: '#F9FAFE' }}>
      {/* Top Navigation Buttons */}
      <div className="pt-4 px-3 pb-3 flex-1 flex flex-col items-center gap-3">
        {/* Terminal */}
        <button
          onClick={() => onViewChange('terminal')}
          className={`w-20 h-20 flex flex-col items-center justify-center gap-1 rounded-lg transition-colors ${
            selectedView === 'terminal' ? 'bg-blue-50' : 'hover:bg-gray-100'
          }`}
          title="Terminal"
        >
          <div
            className="w-12 h-12 flex items-center justify-center rounded"
            style={{ backgroundColor: selectedView === 'terminal' ? '#4C65E2' : '#9CA3AF' }}
          >
            <Terminal className="w-8 h-8 text-white" />
          </div>
          <span className="text-xs font-medium text-gray-700">{t('title.terminal')}</span>
        </button>

        {/* Containers */}
        <button
          onClick={handleContainersClick}
          className={`w-20 h-20 flex flex-col items-center justify-center gap-1 rounded-lg transition-colors ${
            selectedView === 'containers' ? 'bg-blue-50' : 'hover:bg-gray-100'
          }`}
          title="Containers"
        >
          <div
            className="w-12 h-12 flex items-center justify-center rounded"
            style={{ backgroundColor: selectedView === 'containers' ? '#4C65E2' : '#9CA3AF' }}
          >
            <Container className="w-8 h-8 text-white" />
          </div>
          <span className="text-xs font-medium text-gray-700">{t('title.containers')}</span>
        </button>

        {/* Monitor */}
        <button
          onClick={handleMonitorClick}
          className={`w-20 h-20 flex flex-col items-center justify-center gap-1 rounded-lg transition-colors ${
            selectedView === 'monitor' ? 'bg-blue-50' : 'hover:bg-gray-100'
          }`}
          title="Monitor"
        >
          <div
            className="w-12 h-12 flex items-center justify-center rounded"
            style={{ backgroundColor: selectedView === 'monitor' ? '#4C65E2' : '#9CA3AF' }}
          >
            <Activity className="w-8 h-8 text-white" />
          </div>
          <span className="text-xs font-medium text-gray-700">{t('title.monitor')}</span>
        </button>

        {/* Analyze */}
        <button
          onClick={handleAnalyzeClick}
          className={`w-20 h-20 flex flex-col items-center justify-center gap-1 rounded-lg transition-colors ${
            selectedView === 'analyze' ? 'bg-blue-50' : 'hover:bg-gray-100'
          }`}
          title="Analyze"
        >
          <div
            className="w-12 h-12 flex items-center justify-center rounded"
            style={{ backgroundColor: selectedView === 'analyze' ? '#4C65E2' : '#9CA3AF' }}
          >
            <BarChart3 className="w-8 h-8 text-white" />
          </div>
          <span className="text-xs font-medium text-gray-700">{t('title.analyze')}</span>
        </button>
      </div>
    </aside>
  );
}
