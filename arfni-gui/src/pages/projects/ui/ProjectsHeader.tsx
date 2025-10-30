import { useNavigate } from 'react-router-dom';
import { FlaskConical, RefreshCw } from 'lucide-react';
import arfniLogo from '../../../assets/arfni_logo.png';

interface ProjectsHeaderProps {
  loading: boolean;
  onRefresh: () => void;
}

export function ProjectsHeader({ loading, onRefresh }: ProjectsHeaderProps) {
  const navigate = useNavigate();

  return (
    <header className="bg-white border-b border-gray-200 px-6 py-3 flex-shrink-0">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <img src={arfniLogo} alt="ARFNI Logo" className="w-6 h-6" />
          <h1 className="text-xl font-semibold">ARFNI</h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate('/test')}
            className="px-3 py-2 hover:bg-gray-100 rounded-lg transition-colors flex items-center gap-2"
            title="테스트 페이지"
          >
            <FlaskConical className="w-5 h-5" />
            <span className="text-sm font-medium">테스트</span>
          </button>
          <button
            onClick={onRefresh}
            disabled={loading}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
            title="새로고침"
          >
            <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>
    </header>
  );
}
