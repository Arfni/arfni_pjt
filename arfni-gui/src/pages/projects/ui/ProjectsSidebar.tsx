import { Laptop, Server, Package, Settings, FlaskConical } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

interface ProjectsSidebarProps {
  selectedTab: 'local' | 'ec2' | 'plugins';
  onTabChange: (tab: 'local' | 'ec2' | 'plugins') => void;
}

export function ProjectsSidebar({ selectedTab, onTabChange }: ProjectsSidebarProps) {
  const navigate = useNavigate();
  const { t } = useTranslation('projects');

  return (
    <aside className="w-24 border-r border-gray-200 flex flex-col" style={{ backgroundColor: '#F9FAFE' }}>
      <div className="p-3 flex-1 flex flex-col items-center gap-3">
        {/* Local Button */}
        <button
          onClick={() => onTabChange('local')}
          className={`w-16 h-16 flex flex-col items-center justify-center gap-1 rounded-lg transition-colors ${
            selectedTab === 'local'
              ? 'bg-blue-50'
              : 'hover:bg-gray-100'
          }`}
        >
          <div className="w-8 h-8 flex items-center justify-center rounded" style={{ backgroundColor: '#4C65E2' }}>
            <Laptop className="w-5 h-5 text-white" />
          </div>
          <span className={`text-xs font-medium ${selectedTab === 'local' ? 'text-blue-700' : 'text-gray-700'}`}>{t('sidebar.local')}</span>
        </button>

        {/* EC2 Button */}
        <button
          onClick={() => onTabChange('ec2')}
          className={`w-16 h-16 flex flex-col items-center justify-center gap-1 rounded-lg transition-colors ${
            selectedTab === 'ec2'
              ? 'bg-blue-50'
              : 'hover:bg-gray-100'
          }`}
        >
          <div className="w-8 h-8 flex items-center justify-center rounded" style={{ backgroundColor: '#4C65E2' }}>
            <Server className="w-5 h-5 text-white" />
          </div>
          <span className={`text-xs font-medium ${selectedTab === 'ec2' ? 'text-blue-700' : 'text-gray-700'}`}>{t('sidebar.ec2')}</span>
        </button>

        {/* Plugins Button */}
        <button
          onClick={() => onTabChange('plugins')}
          className={`w-16 h-16 flex flex-col items-center justify-center gap-1 rounded-lg transition-colors ${
            selectedTab === 'plugins'
              ? 'bg-blue-50'
              : 'hover:bg-gray-100'
          }`}
        >
          <div className="w-8 h-8 flex items-center justify-center rounded" style={{ backgroundColor: '#4C65E2' }}>
            <Package className="w-5 h-5 text-white" />
          </div>
          <span className={`text-xs font-medium ${selectedTab === 'plugins' ? 'text-blue-700' : 'text-gray-700'}`}>{t('sidebar.plugins')}</span>
        </button>
      </div>

      {/* Test and Settings Buttons at Bottom */}
      <div className="p-3 border-t border-gray-200 flex flex-col gap-3">
        <button
          onClick={() => navigate('/plugin-test')}
          className="w-16 h-16 flex flex-col items-center justify-center gap-1 rounded-lg transition-colors hover:bg-gray-100"
        >
          <FlaskConical className="w-5 h-5 text-gray-600" />
          <span className="text-xs font-medium text-gray-700">{t('sidebar.testPage')}</span>
        </button>
        <button
          onClick={() => navigate('/settings')}
          className="w-16 h-16 flex flex-col items-center justify-center gap-1 rounded-lg transition-colors hover:bg-gray-100"
        >
          <Settings className="w-5 h-5 text-gray-600" />
          <span className="text-xs font-medium text-gray-700">{t('sidebar.settings')}</span>
        </button>
      </div>
    </aside>
  );
}
