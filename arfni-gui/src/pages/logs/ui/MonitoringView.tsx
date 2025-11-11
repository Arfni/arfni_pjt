import React from 'react';
import { Activity } from 'lucide-react';
import { Project, EC2Server } from '@shared/api/tauri/commands';

interface MonitoringViewProps {
  project: Project | null;
  ec2Server: EC2Server | null;
  onNavigateToMonitoring: () => void;
}

export function MonitoringView({
  project,
  ec2Server,
  onNavigateToMonitoring
}: MonitoringViewProps) {
  return (
    <div className="flex-1 bg-white overflow-hidden flex flex-col">
      {/* Scrollable Content Area */}
      <div className="flex-1 overflow-y-auto flex items-center justify-center">
        <div className="text-center">
          <Activity className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-gray-700 mb-2">
            Open Monitoring Dashboard
          </h3>
          <p className="text-gray-500 mb-6">
            View real-time metrics and performance data in Grafana
          </p>
          <button
            onClick={onNavigateToMonitoring}
            className="text-white px-6 py-3 rounded-lg font-medium transition-colors"
            style={{ backgroundColor: '#4C65E2' }}
            onMouseEnter={(e) => e.currentTarget.style.opacity = '0.9'}
            onMouseLeave={(e) => e.currentTarget.style.opacity = '1'}
          >
            Open Dashboard
          </button>
        </div>
      </div>
    </div>
  );
}
