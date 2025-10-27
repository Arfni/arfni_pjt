import { useEffect, useState } from 'react';
import { useAppSelector } from '@app/hooks';
import { selectNodes, selectEdges } from '@features/canvas';
import { selectCurrentProject } from '@features/project';
import { stackYamlGenerator, stackToYamlString } from '@features/canvas/lib/stackYamlGenerator';
import { CanvasNode, CanvasEdge } from '@shared/api/tauri/commands';
import { Copy, Download } from 'lucide-react';

export function YamlEditor() {
  const nodes = useAppSelector(selectNodes);
  const edges = useAppSelector(selectEdges);
  const currentProject = useAppSelector(selectCurrentProject);
  const [yamlContent, setYamlContent] = useState('');
  const [copied, setCopied] = useState(false);

  // Canvas 변경 시 YAML 자동 생성
  useEffect(() => {
    if (!currentProject) {
      setYamlContent('# 프로젝트를 먼저 생성하세요\n# New 버튼을 클릭하여 새 프로젝트를 만드세요');
      return;
    }

    try {
      const stackYaml = stackYamlGenerator(nodes, edges, {
        projectName: currentProject.name,
        secrets: [],
        outputs: {},
      });

      const yamlString = stackToYamlString(stackYaml);
      setYamlContent(yamlString);
    } catch (error) {
      setYamlContent(`# 오류: ${error}\n# Canvas가 비어있거나 유효하지 않습니다`);
    }
  }, [nodes, edges, currentProject]);

  const handleCopy = () => {
    navigator.clipboard.writeText(yamlContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const blob = new Blob([yamlContent], { type: 'text/yaml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'stack.yaml';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="h-full flex flex-col bg-gray-900">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-gray-800 border-b border-gray-700">
        <h3 className="text-sm font-semibold text-gray-200">stack.yaml</h3>
        <div className="flex gap-2">
          <button
            onClick={handleCopy}
            className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded transition-colors"
            title="Copy to clipboard"
          >
            <Copy className="w-4 h-4" />
          </button>
          <button
            onClick={handleDownload}
            className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded transition-colors"
            title="Download YAML"
          >
            <Download className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Copy success message */}
      {copied && (
        <div className="px-4 py-2 bg-green-600 text-white text-sm">
          ✓ Copied to clipboard!
        </div>
      )}

      {/* YAML Content */}
      <div className="flex-1 overflow-y-auto overflow-x-auto">
        <pre className="p-4 text-sm font-mono text-gray-100 whitespace-pre">
          {yamlContent}
        </pre>
      </div>

      {/* Footer info */}
      <div className="px-4 py-2 bg-gray-800 border-t border-gray-700 text-xs text-gray-400">
        <span>{yamlContent.split('\n').length} lines</span>
        {currentProject && (
          <span className="ml-4">
            Project: <span className="text-gray-300">{currentProject.name}</span>
          </span>
        )}
      </div>
    </div>
  );
}