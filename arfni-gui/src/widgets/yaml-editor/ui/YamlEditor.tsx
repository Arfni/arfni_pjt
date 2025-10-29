import { useEffect, useState } from 'react';
import { useAppSelector } from '@app/hooks';
import { selectNodes, selectEdges } from '@features/canvas';
import { selectCurrentProject } from '@features/project';
import { stackYamlGenerator, stackToYamlString } from '@features/canvas/lib/stackYamlGenerator';
import { Copy, Download } from 'lucide-react';
import { ec2ServerCommands } from '@shared/api/tauri/commands';

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

    const generateYaml = async () => {
      try {
        // EC2 서버 정보 로드
        let ec2Server = null;
        if (currentProject.environment === 'ec2' && currentProject.ec2_server_id) {
          try {
            ec2Server = await ec2ServerCommands.getServerById(currentProject.ec2_server_id);
          } catch (err) {
            console.error('EC2 서버 정보 로드 실패:', err);
          }
        }

        const stackYaml = stackYamlGenerator(nodes, edges, {
          projectName: currentProject.name,
          environment: currentProject.environment,
          ec2Server: ec2Server || undefined,
          secrets: [],
          outputs: {},
        });

        const yamlString = stackToYamlString(stackYaml);
        setYamlContent(yamlString);
      } catch (error) {
        setYamlContent(`# 오류: ${error}\n# Canvas가 비어있거나 유효하지 않습니다`);
      }
    };

    generateYaml();
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
    <div className="h-full flex flex-col bg-white border-b border-gray-200">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-gray-50 border-b border-gray-200">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-gray-800">Stack.yaml</h3>
        </div>
        <div className="flex gap-1">
          <button
            onClick={handleCopy}
            className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-200 rounded transition-colors"
            title="Copy to clipboard"
          >
            <Copy className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={handleDownload}
            className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-200 rounded transition-colors"
            title="Download YAML"
          >
            <Download className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Copy success message */}
      {copied && (
        <div className="px-3 py-1.5 bg-green-50 border-b border-green-200 text-green-700 text-xs">
          ✓ Copied to clipboard!
        </div>
      )}

      {/* YAML Content with line numbers */}
      <div className="flex-1 overflow-y-auto overflow-x-auto bg-white">
        <div className="flex text-xs font-mono">
          {/* Line Numbers */}
          <div className="bg-gray-50 border-r border-gray-200 px-2 py-3 text-gray-400 select-none">
            {yamlContent.split('\n').map((_, i) => (
              <div key={i} className="text-right leading-5">
                {i + 1}
              </div>
            ))}
          </div>
          {/* Content */}
          <pre className="flex-1 px-3 py-3 text-gray-800 leading-5 whitespace-pre">
            {yamlContent}
          </pre>
        </div>
      </div>
    </div>
  );
}