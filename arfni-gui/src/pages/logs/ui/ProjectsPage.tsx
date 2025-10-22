import { useNavigate } from 'react-router-dom';
import { ArrowLeft, FolderOpen, Calendar, Server } from 'lucide-react';

export default function ProjectsPage() {
  const navigate = useNavigate();

  const projects = [
    {
      id: 1,
      name: 'my-web-app',
      type: 'Local Docker',
      status: 'Running',
      createdAt: '2024-10-20',
      containers: 3,
    },
    {
      id: 2,
      name: 'api-backend',
      type: 'EC2',
      status: 'Stopped',
      createdAt: '2024-10-19',
      containers: 5,
    },
    {
      id: 3,
      name: 'data-pipeline',
      type: 'Local Docker',
      status: 'Running',
      createdAt: '2024-10-18',
      containers: 2,
    },
  ];

  return (
    <div className="h-full flex flex-col bg-gray-50 overflow-hidden">
      <header className="bg-white border-b border-gray-200 px-6 py-3 flex-shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/logs')}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <FolderOpen className="w-6 h-6 text-gray-600" />
          <h1 className="text-xl font-semibold">Projects List</h1>
        </div>
      </header>

      <main className="flex-1 flex flex-col max-w-7xl w-full mx-auto px-6 py-3 overflow-hidden min-h-0">
        <div className="mb-3 flex items-center justify-between flex-shrink-0">
          <p className="text-sm text-gray-600">Total {projects.length} projects</p>
          <button
            onClick={() => navigate('/')}
            className="px-4 py-2 bg-black text-white rounded-lg hover:bg-gray-800 text-sm"
          >
            Create New Project
          </button>
        </div>

        <div className="flex-1 overflow-y-auto min-h-0">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pb-3">
          {projects.map((project) => (
            <div
              key={project.id}
              className="bg-white rounded-lg border border-gray-200 p-4 hover:shadow-lg transition-shadow cursor-pointer"
              onClick={() => navigate('/logs')}
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                    <FolderOpen className="w-5 h-5 text-blue-600" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900 text-sm">{project.name}</h3>
                    <p className="text-xs text-gray-500">{project.type}</p>
                  </div>
                </div>
                <span
                  className={`px-2 py-1 rounded text-xs font-medium ${
                    project.status === 'Running'
                      ? 'bg-green-100 text-green-700'
                      : 'bg-gray-100 text-gray-700'
                  }`}
                >
                  {project.status}
                </span>
              </div>

              <div className="space-y-1 text-xs text-gray-600">
                <div className="flex items-center gap-2">
                  <Server className="w-3 h-3" />
                  <span>{project.containers} containers</span>
                </div>
                <div className="flex items-center gap-2">
                  <Calendar className="w-3 h-3" />
                  <span>Created: {project.createdAt}</span>
                </div>
              </div>

              <div className="mt-3 pt-3 border-t border-gray-200 flex gap-2">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    console.log('View logs:', project.name);
                  }}
                  className="flex-1 px-3 py-1.5 text-xs bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
                >
                  View Logs
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    navigate('/canvas');
                  }}
                  className="flex-1 px-3 py-1.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700"
                >
                  Edit
                </button>
              </div>
            </div>
          ))}
          </div>
        </div>
      </main>
    </div>
  );
}
