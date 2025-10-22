import { useNavigate } from 'react-router-dom';
import { Home } from 'lucide-react';

export function Toolbar() {
  const navigate = useNavigate();

  return (
    <div className="h-12 bg-gray-800 text-white flex items-center justify-between px-4 border-b border-gray-600">
      <div className="flex items-center space-x-4">
        <h1 className="text-lg font-semibold">ARFNI Canvas</h1>
        <div className="flex space-x-2">
          <button className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors">
            New
          </button>
          <button className="px-3 py-1 bg-gray-600 text-white rounded hover:bg-gray-700 transition-colors">
            Open
          </button>
          <button className="px-3 py-1 bg-gray-600 text-white rounded hover:bg-gray-700 transition-colors">
            Save
          </button>
          <button className="px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700 transition-colors">
            Deploy
          </button>
        </div>
      </div>

      <button
        onClick={() => navigate('/')}
        className="flex items-center gap-2 px-3 py-1 bg-gray-700 text-white rounded hover:bg-gray-600 transition-colors"
      >
        <Home className="w-4 h-4" />
        Home
      </button>
    </div>
  );
}