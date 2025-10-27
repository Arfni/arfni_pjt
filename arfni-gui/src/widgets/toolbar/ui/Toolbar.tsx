import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Home,
  Save,
  FolderOpen,
  PlayCircle,
  StopCircle,
  CheckCircle,
  PlusCircle,
  Loader2
} from 'lucide-react';
import { useAppDispatch, useAppSelector } from '@app/hooks';
import {
  selectNodes,
  selectEdges,
  selectIsDirty,
  setDirty,
} from '@features/canvas';
import {
  selectCurrentProject,
  selectIsSaving,
  createProject,
  openProject,
  saveStackYaml,
} from '@features/project';
import { stackYamlGenerator, stackToYamlString } from '@features/canvas/lib/stackYamlGenerator';
import {
  deploymentCommands,
  CanvasNode,
  CanvasEdge,
} from '@shared/api/tauri/commands';

export function Toolbar() {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();

  const nodes = useAppSelector(selectNodes);
  const edges = useAppSelector(selectEdges);
  const isDirty = useAppSelector(selectIsDirty);
  const currentProject = useAppSelector(selectCurrentProject);
  const isSaving = useAppSelector(selectIsSaving);

  const [isDeploying, setIsDeploying] = useState(false);
  const [isValidating, setIsValidating] = useState(false);

  // 새 프로젝트 생성
  const handleNewProject = useCallback(async () => {
    // TODO: 다이얼로그 구현
    const projectName = prompt('프로젝트 이름을 입력하세요:');
    if (!projectName) return;

    const projectPath = prompt('프로젝트 경로를 입력하세요 (기본: C:\\Projects):') || 'C:\\Projects';

    try {
      await dispatch(createProject({
        name: projectName,
        path: projectPath
      })).unwrap();

      alert('프로젝트가 생성되었습니다!');
    } catch (error) {
      alert(`프로젝트 생성 실패: ${error}`);
    }
  }, [dispatch]);

  // 프로젝트 열기
  const handleOpenProject = useCallback(async () => {
    const projectPath = prompt('프로젝트 경로를 입력하세요:');
    if (!projectPath) return;

    try {
      await dispatch(openProject(projectPath)).unwrap();
      alert('프로젝트를 열었습니다!');
    } catch (error) {
      alert(`프로젝트 열기 실패: ${error}`);
    }
  }, [dispatch]);

  // 저장
  const handleSave = useCallback(async () => {
    if (!currentProject) {
      alert('먼저 프로젝트를 생성하거나 열어주세요.');
      return;
    }

    try {
      // Canvas 노드를 stack.yaml로 변환
      const stackYaml = stackYamlGenerator(nodes, edges, {
        projectName: currentProject.name,
        secrets: [],
        outputs: {},
      });

      const yamlContent = stackToYamlString(stackYaml);

      // Canvas 노드를 Tauri 형식으로 변환
      const canvasNodes: CanvasNode[] = nodes.map(node => ({
        id: node.id,
        node_type: node.type,
        data: node.data,
        position: node.position,
      }));

      const canvasEdges: CanvasEdge[] = edges.map(edge => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
      }));

      // 저장
      await dispatch(saveStackYaml({
        projectPath: currentProject.path,
        yamlContent,
        canvasData: {
          nodes: canvasNodes,
          edges: canvasEdges,
          project_name: currentProject.name,
          secrets: [],
        },
      })).unwrap();

      dispatch(setDirty(false));
      alert('stack.yaml이 저장되었습니다!');
    } catch (error) {
      alert(`저장 실패: ${error}`);
    }
  }, [currentProject, nodes, edges, dispatch]);

  // 검증
  const handleValidate = useCallback(async () => {
    if (!currentProject) {
      alert('먼저 프로젝트를 생성하거나 열어주세요.');
      return;
    }

    setIsValidating(true);
    try {
      // stack.yaml 생성
      const stackYaml = stackYamlGenerator(nodes, edges, {
        projectName: currentProject.name,
        secrets: [],
        outputs: {},
      });

      const yamlContent = stackToYamlString(stackYaml);

      // 검증
      const isValid = await deploymentCommands.validateStackYaml(yamlContent);

      if (isValid) {
        alert('✅ stack.yaml 검증 성공!');
      } else {
        alert('❌ stack.yaml 검증 실패');
      }
    } catch (error) {
      alert(`검증 실패: ${error}`);
    } finally {
      setIsValidating(false);
    }
  }, [currentProject, nodes, edges]);

  // 배포
  const handleDeploy = useCallback(async () => {
    if (!currentProject) {
      alert('먼저 프로젝트를 생성하거나 열어주세요.');
      return;
    }

    // 저장되지 않은 변경사항이 있으면 먼저 저장
    if (isDirty) {
      const shouldSave = confirm('변경사항을 먼저 저장하시겠습니까?');
      if (shouldSave) {
        await handleSave();
      }
    }

    setIsDeploying(true);
    try {
      // Docker 체크
      const hasDocker = await deploymentCommands.checkDocker();
      if (!hasDocker) {
        alert('Docker가 설치되어 있지 않습니다. Docker를 먼저 설치해주세요.');
        return;
      }

      // 배포 실행
      const stackYamlPath = `${currentProject.path}/stack.yaml`;
      const result = await deploymentCommands.deployStack(
        currentProject.path,
        stackYamlPath
      );

      if (result.status === 'deploying') {
        alert('배포가 시작되었습니다. 로그를 확인하세요.');
      }
    } catch (error) {
      alert(`배포 실패: ${error}`);
    } finally {
      setIsDeploying(false);
    }
  }, [currentProject, isDirty, handleSave]);

  // 배포 중단
  const handleStopDeployment = useCallback(async () => {
    try {
      await deploymentCommands.stopDeployment();
      alert('배포가 중단되었습니다.');
      setIsDeploying(false);
    } catch (error) {
      alert(`배포 중단 실패: ${error}`);
    }
  }, []);

  return (
    <div className="h-12 bg-gray-800 text-white flex items-center justify-between px-4 border-b border-gray-600">
      <div className="flex items-center space-x-4">
        <h1 className="text-lg font-semibold">
          ARFNI Canvas
          {currentProject && (
            <span className="ml-2 text-sm text-gray-400">
              - {currentProject.name}
            </span>
          )}
        </h1>

        <div className="flex space-x-2">
          <button
            onClick={handleNewProject}
            className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors flex items-center gap-1"
          >
            <PlusCircle className="w-4 h-4" />
            New
          </button>

          <button
            onClick={handleOpenProject}
            className="px-3 py-1 bg-gray-600 text-white rounded hover:bg-gray-700 transition-colors flex items-center gap-1"
          >
            <FolderOpen className="w-4 h-4" />
            Open
          </button>

          <button
            onClick={handleSave}
            disabled={isSaving || !currentProject}
            className="px-3 py-1 bg-gray-600 text-white rounded hover:bg-gray-700 transition-colors flex items-center gap-1 disabled:opacity-50"
          >
            {isSaving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            Save
            {isDirty && <span className="ml-1 text-yellow-400">*</span>}
          </button>

          <button
            onClick={handleValidate}
            disabled={isValidating || !currentProject}
            className="px-3 py-1 bg-purple-600 text-white rounded hover:bg-purple-700 transition-colors flex items-center gap-1 disabled:opacity-50"
          >
            {isValidating ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <CheckCircle className="w-4 h-4" />
            )}
            Validate
          </button>

          {!isDeploying ? (
            <button
              onClick={handleDeploy}
              disabled={!currentProject}
              className="px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700 transition-colors flex items-center gap-1 disabled:opacity-50"
            >
              <PlayCircle className="w-4 h-4" />
              Deploy
            </button>
          ) : (
            <button
              onClick={handleStopDeployment}
              className="px-3 py-1 bg-red-600 text-white rounded hover:bg-red-700 transition-colors flex items-center gap-1"
            >
              <StopCircle className="w-4 h-4" />
              Stop
            </button>
          )}
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