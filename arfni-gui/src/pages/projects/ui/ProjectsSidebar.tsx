import { Laptop, Server } from 'lucide-react';

interface ProjectsSidebarProps {
  selectedTab: 'local' | 'ec2';
  onTabChange: (tab: 'local' | 'ec2') => void;
}

export function ProjectsSidebar({ selectedTab, onTabChange }: ProjectsSidebarProps) {
  return (
    <aside className="w-24 bg-white border-r border-gray-200 flex flex-col">
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
          <span className={`text-xs font-medium ${selectedTab === 'local' ? 'text-blue-700' : 'text-gray-700'}`}>Local</span>
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
          <span className={`text-xs font-medium ${selectedTab === 'ec2' ? 'text-blue-700' : 'text-gray-700'}`}>EC2</span>
        </button>
      </div>
    </aside>
  );
}
