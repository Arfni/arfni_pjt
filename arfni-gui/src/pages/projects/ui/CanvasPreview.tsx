import { useState, useEffect, useMemo } from 'react';
import { CanvasNode, projectCommands } from '@shared/api/tauri/commands';

interface CanvasPreviewProps {
  nodes: CanvasNode[];
  projectPath?: string; // 프로젝트 경로 (PNG 로드용)
}

export function CanvasPreview({ nodes, projectPath }: CanvasPreviewProps) {
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [imageError, setImageError] = useState(false);

  // PNG 미리보기 로드
  useEffect(() => {
    if (!projectPath) {
      setPreviewImage(null);
      setImageError(false);
      return;
    }

    const loadPreview = async () => {
      try {
        const pngDataUrl = await projectCommands.getProjectPreview(projectPath);
        setPreviewImage(pngDataUrl);
        setImageError(false);
      } catch (error) {
        console.log('[Preview] PNG 미리보기 없음:', error);
        setPreviewImage(null);
        setImageError(true);
      }
    };

    loadPreview();
  }, [projectPath]);

  // 노드에서 고유한 플러그인 타입 추출
  const uniquePluginTypes = useMemo(() => {
    const types = new Set<string>();

    nodes.forEach(node => {
      // service 노드의 경우
      if (node.node_type === 'service' && node.data?.serviceType) {
        types.add(node.data.serviceType);
      }
      // database 노드의 경우
      else if (node.node_type === 'database' && node.data?.type) {
        types.add(node.data.type);
      }
    });

    return Array.from(types);
  }, [nodes]);

  // 플러그인 아이콘 경로 생성
  const getPluginIconPath = (pluginType: string): string => {
    // 데이터베이스 타입 매핑
    const dbTypeMap: Record<string, string> = {
      'mysql': 'database/mysql',
      'mongodb': 'database/mongodb',
      'postgres': 'database/postgresql',
      'redis': 'cache/redis',
    };

    // 프레임워크 타입 매핑
    const frameworkTypeMap: Record<string, string> = {
      'react': 'framework/react',
      'nextjs': 'framework/nextjs',
      'spring': 'framework/springboot',
      'fastapi': 'framework/fastapi',
      'flask': 'framework/flask',
      'nodejs': 'framework/nodejs',
    };

    const mappedPath = dbTypeMap[pluginType] || frameworkTypeMap[pluginType];

    if (mappedPath) {
      return `/plugins/bundled/${mappedPath}/icon.png`;
    }

    // 기본 경로 (카테고리를 알 수 없는 경우)
    return `/plugins/bundled/framework/${pluginType}/icon.png`;
  };

  // 노드가 없으면 아무것도 렌더링하지 않음
  if (!nodes || nodes.length === 0) {
    return (
      <div className="w-full h-full flex items-center justify-center text-gray-400 text-sm">
        캔버스가 비어있습니다
      </div>
    );
  }

  return (
    <div className="w-full h-full flex flex-col bg-white">
      {/* PNG 미리보기 영역 */}
      <div className="h-80 flex items-center justify-center bg-white overflow-hidden">
        {previewImage && !imageError ? (
          <img
            src={previewImage}
            alt="Canvas Preview"
            className="w-full h-full object-contain"
            onError={() => setImageError(true)}
          />
        ) : (
          <div className="text-gray-400 text-sm">
            {imageError ? '미리보기를 생성하려면 저장하세요' : '미리보기 로드 중...'}
          </div>
        )}
      </div>

      {/* 플러그인 로고 영역 */}
      {uniquePluginTypes.length > 0 && (
        <div className="flex items-center justify-start gap-3 px-3 py-2 border-t border-gray-200 bg-white">
          {uniquePluginTypes.map((pluginType) => (
            <div
              key={pluginType}
              className="w-8 h-8 flex items-center justify-center flex-shrink-0"
              title={pluginType}
            >
              <img
                src={getPluginIconPath(pluginType)}
                alt={pluginType}
                className="w-full h-full object-contain"
                onError={(e) => {
                  // 아이콘 로드 실패 시 텍스트로 대체
                  const target = e.target as HTMLImageElement;
                  target.style.display = 'none';
                }}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
