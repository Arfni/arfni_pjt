import React, { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Save,
  FolderOpen,
  PlayCircle,
  StopCircle,
  CheckCircle,
  PlusCircle,
  Loader2,
  ArrowLeft,
  Camera,
  Settings
} from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { useAppDispatch, useAppSelector } from '@app/hooks';
import {
  selectNodes,
  selectEdges,
  selectIsDirty,
  setDirty,
  updateNode,
  selectTargetNodes,
} from '@features/canvas';
import {
  selectCurrentProject,
  selectIsSaving,
  createProject,
  openProject,
  saveStackYaml,
  setCurrentProject,
} from '@features/project';
import {
  startDeployment,
} from '@features/deployment/model/deploymentSlice';
import { stackYamlGenerator, stackToYamlString } from '@features/canvas/lib/stackYamlGenerator';
import {
  deploymentCommands,
  projectCommands,
  CanvasNode,
  CanvasEdge,
  ec2ServerCommands,
} from '@shared/api/tauri/commands';

export function Toolbar() {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();

  const nodes = useAppSelector(selectNodes);
  const edges = useAppSelector(selectEdges);
  const isDirty = useAppSelector(selectIsDirty);
  const currentProject = useAppSelector(selectCurrentProject);
  const isSaving = useAppSelector(selectIsSaving);
  const targetNodes = useAppSelector(selectTargetNodes);

  const [isDeploying, setIsDeploying] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [selectedFormat, setSelectedFormat] = useState<'png' | 'svg' | 'pdf'>('png');
  const [showExportSuccess, setShowExportSuccess] = useState(false);
  const [exportedFilePath, setExportedFilePath] = useState('');

  // EC2 프로젝트인지 확인 및 현재 모니터링 모드 가져오기
  const isEC2Project = currentProject?.environment === 'ec2';
  const ec2TargetNode = isEC2Project && targetNodes.length > 0 ? targetNodes[0] : null;

  // 모니터링 모드: Redux (currentProject)에서 직접 읽기
  // currentProject.mode는 stack.yaml에서 파싱된 값
  const currentMonitoringMode = currentProject?.mode || 'all-in-one';

  // 모니터링 모드 변경 핸들러 - projects 테이블에 저장하고 stack.yaml 업데이트
  const handleMonitoringModeChange = useCallback(async (newMode: string) => {
    if (!currentProject?.id) return;

    try {
      // 1. 프로젝트 mode 업데이트 (projects 테이블 + stack.yaml 캐시)
      const updatedProject = await projectCommands.updateProject(
        currentProject.id,
        newMode,
        undefined // workdir는 변경하지 않음
      );

      // 2. Redux 프로젝트 상태 업데이트 - 이제 YamlEditor가 자동으로 감지함!
      dispatch(setCurrentProject(updatedProject));

      // 3. EC2 서버 정보 가져오기 (연결 정보만)
      let ec2Server = null;
      if (updatedProject.ec2_server_id) {
        ec2Server = await ec2ServerCommands.getServerById(updatedProject.ec2_server_id);
      }

      // 4. stack.yaml 생성 - updatedProject 사용
      const stackYaml = stackYamlGenerator(nodes, edges, {
        projectName: updatedProject.name,
        environment: updatedProject.environment,
        ec2Server: ec2Server || undefined,
        mode: updatedProject.mode, // 업데이트된 mode 사용
        workdir: updatedProject.workdir, // 업데이트된 workdir
        secrets: [],
        outputs: {},
      });

      const yamlContent = stackToYamlString(stackYaml);

      const canvasData = {
        nodes: nodes.map(node => ({
          id: node.id,
          node_type: node.type,
          data: node.data,
          position: node.position,
        })),
        edges: edges.map(edge => ({
          id: edge.id,
          source: edge.source,
          target: edge.target,
        })),
        project_name: updatedProject.name,
        secrets: [],
      };

      // 5. stack.yaml 파일 저장
      await projectCommands.saveStackYaml(
        updatedProject.path,
        yamlContent,
        canvasData
      );

      // 6. dirty 상태 해제
      dispatch(setDirty(false));
    } catch (error) {
      console.error('모니터링 모드 업데이트 실패:', error);
      alert(`모니터링 모드 변경 실패: ${error}`);
    }
  }, [currentProject, dispatch, nodes, edges]);

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
      // EC2 서버 정보 로드
      let ec2Server = null;
      if (currentProject.environment === 'ec2' && currentProject.ec2_server_id) {
        try {
          ec2Server = await ec2ServerCommands.getServerById(currentProject.ec2_server_id);
        } catch (err) {
          console.error('EC2 서버 정보 로드 실패:', err);
        }
      }

      // Canvas 노드를 stack.yaml로 변환
      const stackYaml = stackYamlGenerator(nodes, edges, {
        projectName: currentProject.name,
        environment: currentProject.environment,
        ec2Server: ec2Server || undefined,
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
      // EC2 서버 정보 로드
      let ec2Server = null;
      if (currentProject.environment === 'ec2' && currentProject.ec2_server_id) {
        try {
          ec2Server = await ec2ServerCommands.getServerById(currentProject.ec2_server_id);
        } catch (err) {
          console.error('EC2 서버 정보 로드 실패:', err);
        }
      }

      // stack.yaml 생성
      const stackYaml = stackYamlGenerator(nodes, edges, {
        projectName: currentProject.name,
        environment: currentProject.environment,
        ec2Server: ec2Server || undefined,
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

    // Local 프로젝트만 Docker 검증
    if (currentProject.environment === 'local') {
      try {
        const hasDocker = await deploymentCommands.checkDocker();
        if (!hasDocker) {
          alert('Docker가 설치되어 있지 않습니다. Docker를 먼저 설치해주세요.');
          return;
        }

        const isDockerRunning = await deploymentCommands.checkDockerRunning();
        if (!isDockerRunning) {
          alert('Docker가 실행되고 있지 않습니다. Docker를 먼저 실행해주세요.');
          return;
        }
      } catch (error) {
        alert(`Docker 검증 실패: ${error}`);
        return;
      }
    }

    // Redux에 배포 시작 상태 저장
    dispatch(startDeployment());

    setIsDeploying(true);
    try {
      // 배포 실행
      const stackYamlPath = `${currentProject.path}/stack.yaml`;
      const result = await deploymentCommands.deployStack(
        currentProject.path,
        stackYamlPath
      );

      if (result.status === 'deploying') {
        // 배포 페이지로 이동
        navigate('/deployment', { replace: true });
      }
    } catch (error) {
      alert(`배포 실패: ${error}`);
      setIsDeploying(false);
    }
  }, [currentProject, isDirty, handleSave, dispatch, navigate]);

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


  // Export 다이얼로그 열기
  const handleOpenExportDialog = useCallback(() => {
    setShowExportDialog(true);
  }, []);

  // Export 실행
  const handleExport = useCallback(async () => {
    setShowExportDialog(false);

    // ReactFlow 요소 찾기
    const reactFlowElement = document.querySelector('.react-flow') as HTMLElement;
    if (!reactFlowElement) {
      alert('캔버스를 찾을 수 없습니다.');
      return;
    }

    // 미니맵, 컨트롤 등 UI 요소들 숨기기
    const minimap = document.querySelector('.react-flow__minimap') as HTMLElement;
    const controls = document.querySelector('.react-flow__controls') as HTMLElement;
    const attribution = document.querySelector('.react-flow__attribution') as HTMLElement;

    const elementsToHide = [minimap, controls, attribution].filter(el => el !== null);
    const originalDisplays = elementsToHide.map(el => el.style.display);

    // UI 요소들 숨기기
    elementsToHide.forEach(el => {
      el.style.display = 'none';
    });

    // 약간의 딜레이 후 스크린샷 생성 (DOM 업데이트 대기)
    setTimeout(() => {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
      const baseFileName = currentProject
        ? `${currentProject.name}_canvas_${timestamp}`
        : `canvas_${timestamp}`;

      // html-to-image를 사용하여 이미지 생성
      import('html-to-image').then(async (htmlToImage) => {
        try {
          let dataUrl: string;
          let fileName: string;

          if (selectedFormat === 'png') {
            dataUrl = await htmlToImage.toPng(reactFlowElement, {
              backgroundColor: '#ffffff',
              pixelRatio: 2,
              cacheBust: true,
            });
            fileName = `${baseFileName}.png`;
          } else if (selectedFormat === 'svg') {
            dataUrl = await htmlToImage.toSvg(reactFlowElement, {
              backgroundColor: '#ffffff',
              cacheBust: true,
            });
            fileName = `${baseFileName}.svg`;
          } else if (selectedFormat === 'pdf') {
            // PDF는 jsPDF 사용
            const pngDataUrl = await htmlToImage.toPng(reactFlowElement, {
              backgroundColor: '#ffffff',
              pixelRatio: 2,
              cacheBust: true,
            });

            // jsPDF 동적 import
            const { jsPDF } = await import('jspdf');
            const pdf = new jsPDF({
              orientation: 'landscape',
              unit: 'px',
              format: [reactFlowElement.offsetWidth, reactFlowElement.offsetHeight]
            });

            pdf.addImage(pngDataUrl, 'PNG', 0, 0, reactFlowElement.offsetWidth, reactFlowElement.offsetHeight);
            const pdfBlob = pdf.output('blob');
            dataUrl = URL.createObjectURL(pdfBlob);
            fileName = `${baseFileName}.pdf`;
          } else {
            throw new Error('지원하지 않는 형식입니다.');
          }

          // UI 요소들 다시 보이기
          elementsToHide.forEach((el, index) => {
            el.style.display = originalDisplays[index];
          });

          // 다운로드
          const link = document.createElement('a');
          link.href = dataUrl;
          link.download = fileName;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);

          // 성공 메시지 표시
          setExportedFilePath(fileName);
          setShowExportSuccess(true);

        } catch (error) {
          // 에러 발생 시에도 UI 요소들 복원
          elementsToHide.forEach((el, index) => {
            el.style.display = originalDisplays[index];
          });
          console.error('Export 실패:', error);
          alert('Export에 실패했습니다.');
        }
      }).catch((error: Error) => {
        // 에러 발생 시에도 UI 요소들 복원
        elementsToHide.forEach((el, index) => {
          el.style.display = originalDisplays[index];
        });
        console.error('라이브러리 로드 실패:', error);
        alert('Export 라이브러리 로드에 실패했습니다.');
      });
    }, 100);
  }, [currentProject, selectedFormat]);

  // 폴더 열기
  const handleOpenFolder = useCallback(async () => {
    try {
      // Tauri의 shell.open을 사용하여 다운로드 폴더 열기
      await invoke('open_downloads_folder');
    } catch (error) {
      console.error('폴더 열기 실패:', error);
      // 폴더 열기 실패시 기본 동작
      alert('폴더를 열 수 없습니다.');
    }
  }, []);

  return (
    <>
      <div className="h-12 bg-gray-800 text-white flex items-center justify-between px-4 border-b border-gray-600">
        {/* Left section */}
        <div className="flex items-center space-x-4">
          <button
            onClick={() => navigate('/')}
            className="p-1 hover:bg-gray-700 rounded transition-colors"
            title="홈으로"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>

          <h1 className="text-lg font-semibold">
            ARFNI Canvas
            {currentProject && (
              <span className="ml-2 text-sm text-gray-400">
                - {currentProject.name}
              </span>
            )}
          </h1>
        </div>

        {/* Middle section */}
        <div className="flex items-center space-x-2">
          {/* EC2 모니터링 모드 선택 (EC2 프로젝트만) */}
          {isEC2Project && (
            <>
              <div className="flex items-center gap-2 px-3 py-1 bg-gray-700 rounded">
                <span className="text-xs text-gray-300">Monitoring:</span>
                <select
                  value={currentMonitoringMode}
                  onChange={(e) => handleMonitoringModeChange(e.target.value)}
                  disabled={!currentProject}
                  className="px-2 py-0.5 text-xs bg-gray-600 text-white rounded border border-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                >
                  <option value="all-in-one">All-in-One</option>
                  <option value="hybrid">Hybrid</option>
                  <option value="no-monitoring">No Monitoring</option>
                </select>
              </div>

              <button
                onClick={() => {/* TODO: CI/CD 기능 구현 */}}
                disabled={!currentProject}
                className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors flex items-center gap-1 disabled:opacity-50"
              >
                CI/CD
              </button>
            </>
          )}
        </div>

        {/* Right section */}
        <div className="flex items-center space-x-2">
          <button
            onClick={() => {/* TODO: 설정 기능 구현 */}}
            className="p-2 hover:bg-gray-700 rounded transition-colors"
            title="설정"
          >
            <Settings className="w-4 h-4" />
          </button>

          <button
            onClick={handleSave}
            disabled={isSaving || !currentProject}
            className="p-2 hover:bg-gray-700 rounded transition-colors relative disabled:opacity-50"
            title="저장"
          >
            {isSaving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            {isDirty && <span className="absolute -top-1 -right-1 w-2 h-2 bg-yellow-400 rounded-full"></span>}
          </button>

          <button
            onClick={handleOpenExportDialog}
            className="flex items-center gap-2 px-3 py-1 bg-indigo-600 text-white rounded hover:bg-indigo-700 transition-colors"
            title="캔버스 내보내기"
          >
            <Camera className="w-4 h-4" />
            Export
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

      {/* Export Format Selection Dialog */}
      {showExportDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-8 w-[500px]">
            <h2 className="text-3xl font-bold text-gray-800 mb-6 text-center">Export Image</h2>

            <div className="mb-6">
              <h3 className="text-xl font-semibold text-gray-700 mb-4">File Format</h3>
              <div className="flex gap-2">
                <button
                  onClick={() => setSelectedFormat('png')}
                  className={`flex-1 py-4 px-6 rounded-lg font-semibold text-lg transition-all ${
                    selectedFormat === 'png'
                      ? 'bg-blue-500 text-white'
                      : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
                  }`}
                >
                  PNG
                </button>
                <button
                  onClick={() => setSelectedFormat('svg')}
                  className={`flex-1 py-4 px-6 rounded-lg font-semibold text-lg transition-all ${
                    selectedFormat === 'svg'
                      ? 'bg-blue-500 text-white'
                      : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
                  }`}
                >
                  SVG
                </button>
                <button
                  onClick={() => setSelectedFormat('pdf')}
                  className={`flex-1 py-4 px-6 rounded-lg font-semibold text-lg transition-all ${
                    selectedFormat === 'pdf'
                      ? 'bg-blue-500 text-white'
                      : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
                  }`}
                >
                  PDF
                </button>
              </div>
            </div>

            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowExportDialog(false)}
                className="px-6 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400 transition-colors font-medium"
              >
                취소
              </button>
              <button
                onClick={handleExport}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
              >
                확인
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Export Success Message */}
      {showExportSuccess && (
        <div className="fixed top-20 left-1/2 transform -translate-x-1/2 z-50 w-full max-w-2xl">
          <div className="bg-green-500 text-white px-6 py-4 rounded-lg shadow-lg flex items-center justify-between">
            <div className="flex items-center gap-3">
              <CheckCircle className="w-6 h-6" />
              <span className="font-medium text-lg">Success Export!</span>
              <button
                onClick={handleOpenFolder}
                className="ml-4 underline hover:text-green-100 transition-colors font-medium"
              >
                Click here to show save folder.
              </button>
            </div>
            <button
              onClick={() => setShowExportSuccess(false)}
              className="text-white hover:text-green-100 transition-colors"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </>
  );
}