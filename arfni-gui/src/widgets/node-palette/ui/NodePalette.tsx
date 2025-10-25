import { Database, Server, Globe, Container } from 'lucide-react';
import { useAppDispatch, useAppSelector } from '@app/hooks';
import { selectTemplate, selectSelectedTemplate } from '@features/canvas';

interface NodeTemplate {
  type: string;
  label: string;
  icon: React.ReactNode;
  category: 'service' | 'database' | 'target';
  color: string;
}

const nodeTemplates: NodeTemplate[] = [
  // Targets
  {
    type: 'docker-local',
    label: 'Docker Local',
    icon: <Container className="w-5 h-5" />,
    category: 'target',
    color: 'bg-blue-500',
  },
  {
    type: 'ec2',
    label: 'EC2 Instance',
    icon: <Server className="w-5 h-5" />,
    category: 'target',
    color: 'bg-orange-500',
  },

  // Services
  {
    type: 'react',
    label: 'React App',
    icon: <Globe className="w-5 h-5" />,
    category: 'service',
    color: 'bg-cyan-500',
  },
  {
    type: 'spring',
    label: 'Spring Boot',
    icon: <Server className="w-5 h-5" />,
    category: 'service',
    color: 'bg-green-500',
  },
  {
    type: 'fastapi',
    label: 'FastAPI',
    icon: <Server className="w-5 h-5" />,
    category: 'service',
    color: 'bg-teal-500',
  },

  // Databases
  {
    type: 'mysql',
    label: 'MySQL',
    icon: <Database className="w-5 h-5" />,
    category: 'database',
    color: 'bg-blue-600',
  },
  {
    type: 'postgres',
    label: 'PostgreSQL',
    icon: <Database className="w-5 h-5" />,
    category: 'database',
    color: 'bg-indigo-600',
  },
  {
    type: 'redis',
    label: 'Redis',
    icon: <Database className="w-5 h-5" />,
    category: 'database',
    color: 'bg-red-500',
  },
  {
    type: 'mongodb',
    label: 'MongoDB',
    icon: <Database className="w-5 h-5" />,
    category: 'database',
    color: 'bg-green-600',
  },
];

export function NodePalette() {
  const dispatch = useAppDispatch();
  const selectedTemplate = useAppSelector(selectSelectedTemplate);

  const handleTemplateClick = (nodeType: string, category: 'service' | 'database' | 'target') => {
    // 같은 템플릿을 다시 클릭하면 선택 해제
    if (selectedTemplate?.type === nodeType && selectedTemplate?.category === category) {
      dispatch(selectTemplate(null));
    } else {
      dispatch(selectTemplate({ type: nodeType, category }));
    }
  };

  const categories = [
    { key: 'target', label: 'Deployment Targets' },
    { key: 'service', label: 'Services' },
    { key: 'database', label: 'Databases' },
  ];

  return (
    <div className="w-64 bg-gray-50 border-r border-gray-200 p-4 overflow-y-auto">
      <h2 className="text-lg font-semibold mb-4 text-gray-800">Components</h2>

      {selectedTemplate && (
        <div className="mb-4 p-2 bg-blue-100 border border-blue-300 rounded text-sm text-blue-800">
          <p className="font-medium">선택됨: {selectedTemplate.type.toUpperCase()}</p>
          <p className="text-xs">캔버스를 클릭하여 추가하세요</p>
          <button
            onClick={() => dispatch(selectTemplate(null))}
            className="mt-1 text-xs underline hover:text-blue-900"
          >
            선택 취소 (ESC)
          </button>
        </div>
      )}

      {categories.map((category) => (
        <div key={category.key} className="mb-6">
          <h3 className="text-sm font-medium text-gray-600 mb-2">{category.label}</h3>
          <div className="space-y-2">
            {nodeTemplates
              .filter((node) => node.category === category.key)
              .map((node) => {
                const isSelected = selectedTemplate?.type === node.type && selectedTemplate?.category === node.category;
                return (
                  <div
                    key={node.type}
                    onClick={() => handleTemplateClick(node.type, node.category)}
                    className={`
                      ${node.color} text-white
                      p-3 rounded-lg cursor-pointer
                      flex items-center gap-2
                      hover:opacity-80 transition-all
                      shadow-sm
                      ${isSelected ? 'ring-4 ring-blue-400 scale-105' : ''}
                    `}
                  >
                    {node.icon}
                    <span className="text-sm font-medium">
                      {node.label}
                    </span>
                  </div>
                );
              })}
          </div>
        </div>
      ))}

      <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
        <p className="text-xs text-blue-800">
          💡 컴포넌트를 클릭한 후 캔버스를 클릭하여 추가하세요
        </p>
      </div>
    </div>
  );
}