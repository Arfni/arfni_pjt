import { useState } from 'react';
import { Search } from 'lucide-react';
import { useAppDispatch, useAppSelector } from '@app/hooks';
import { selectTemplate, selectSelectedTemplate } from '@features/canvas';

import postgresqlImg from '../../../assets/postgresql.png';
import mysqlImg from '../../../assets/mysql.png';
import redisImg from '../../../assets/redis.png';
import mongodbImg from '../../../assets/mongodb.png';
import reactImg from '../../../assets/react.png';
import springbootImg from '../../../assets/springboot.png';
import nodejsImg from '../../../assets/nodejs.png';
import nextjsImg from '../../../assets/nextjs.png';
import pythonImg from '../../../assets/python.png';

interface NodeTemplate {
  type: string;
  label: string;
  description: string;
  icon: string;
  category: 'runtime' | 'database' | 'infra' | 'monitor';
}

const nodeTemplates: NodeTemplate[] = [
  // DB
  {
    type: 'postgres',
    label: 'PostgreSQL',
    description: 'Leading RDBMS',
    icon: postgresqlImg,
    category: 'database',
  },
  {
    type: 'mysql',
    label: 'MySQL',
    description: 'Open-source DB',
    icon: mysqlImg,
    category: 'database',
  },
  {
    type: 'redis',
    label: 'Redis',
    description: 'In-memory cache',
    icon: redisImg,
    category: 'database',
  },
  {
    type: 'mongodb',
    label: 'MongoDB',
    description: 'Document NoSQL',
    icon: mongodbImg,
    category: 'database',
  },

  // Runtime
  {
    type: 'react',
    label: 'React',
    description: 'Frontend library',
    icon: reactImg,
    category: 'runtime',
  },
  {
    type: 'nextjs',
    label: 'Next.js',
    description: 'React framework',
    icon: nextjsImg,
    category: 'runtime',
  },
  {
    type: 'spring',
    label: 'Spring Boot',
    description: 'Java framework',
    icon: springbootImg,
    category: 'runtime',
  },
  {
    type: 'nodejs',
    label: 'Node.js',
    description: 'JavaScript runtime',
    icon: nodejsImg,
    category: 'runtime',
  },
  {
    type: 'python',
    label: 'Python',
    description: 'Python runtime',
    icon: pythonImg,
    category: 'runtime',
  },
];

type TabKey = 'DB' | 'Runtime' | 'Infra' | 'Monitor';

const tabCategories: Record<TabKey, 'database' | 'runtime' | 'infra' | 'monitor'> = {
  DB: 'database',
  Runtime: 'runtime',
  Infra: 'infra',
  Monitor: 'monitor',
};

export function NodePalette() {
  const dispatch = useAppDispatch();
  const selectedTemplate = useAppSelector(selectSelectedTemplate);
  const [activeTab, setActiveTab] = useState<TabKey>('DB');
  const [searchQuery, setSearchQuery] = useState('');

  // 클릭 방식 제거 - 드래그 앤 드롭만 사용
  // const handleTemplateClick = (nodeType: string, category: 'runtime' | 'database' | 'infra' | 'monitor') => {
  //   // Map category to canvas category
  //   const canvasCategory = category === 'database' ? 'database' : category === 'runtime' ? 'service' : 'target';

  //   if (selectedTemplate?.type === nodeType) {
  //     dispatch(selectTemplate(null));
  //   } else {
  //     dispatch(selectTemplate({ type: nodeType, category: canvasCategory as any }));
  //   }
  // };

  const onDragStart = (event: React.DragEvent, nodeType: string, category: 'runtime' | 'database' | 'infra' | 'monitor') => {
    const canvasCategory = category === 'database' ? 'database' : category === 'runtime' ? 'service' : 'target';
    event.dataTransfer.setData('application/reactflow', JSON.stringify({ type: nodeType, category: canvasCategory }));
    event.dataTransfer.effectAllowed = 'move';
  };

  const filteredNodes = nodeTemplates
    .filter((node) => node.category === tabCategories[activeTab])
    .filter((node) =>
      node.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
      node.description.toLowerCase().includes(searchQuery.toLowerCase())
    );

  return (
    <div className="w-52 bg-white border-r border-gray-200 flex flex-col">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200">
        <h2 className="text-base font-semibold text-gray-800">Blocks</h2>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200">
        {(['DB', 'Runtime', 'Infra', 'Monitor'] as TabKey[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`
              flex-1 px-3 py-2 text-xs font-medium transition-colors
              ${activeTab === tab
                ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50'
                : 'text-gray-600 hover:text-gray-800 hover:bg-gray-50'
              }
            `}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="px-3 py-2 border-b border-gray-200">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
          <input
            type="text"
            placeholder="Block Search..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
      </div>

      {/* Block List */}
      <div className="flex-1 overflow-y-auto px-3 py-2">
        <div className="space-y-2">
          {filteredNodes.map((node) => {
            const isSelected = selectedTemplate?.type === node.type;
            return (
              <div
                key={node.type}
                draggable
                onDragStart={(e) => onDragStart(e, node.type, node.category)}
                className="bg-white border border-gray-200 rounded-lg p-2.5 cursor-grab active:cursor-grabbing hover:shadow-md hover:border-blue-300 transition-all"
              >
                <div className="flex items-start gap-2">
                  <img src={node.icon} alt={node.label} className="w-8 h-8 flex-shrink-0 pointer-events-none" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-gray-900 truncate">
                      {node.label}
                    </div>
                    <div className="text-xs text-gray-500 truncate">
                      {node.description}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
          {filteredNodes.length === 0 && (
            <div className="text-center py-8 text-sm text-gray-500">
              No blocks found
            </div>
          )}
        </div>
      </div>
    </div>
  );
}