import React, { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Save,
  PlayCircle,
  StopCircle,
  Loader2,
  ArrowLeft,
  Camera,
  Settings,
  FileText,
  AlignJustify
} from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import html2canvas from 'html2canvas';
import aiLogo from '../../../assets/ai.png';
import { useAppDispatch, useAppSelector } from '@app/hooks';
import {
  selectNodes,
  selectEdges,
  selectIsDirty,
  setDirty,
  selectTargetNodes,
  autoAlignNodes,
} from '@features/canvas';
import {
  selectCurrentProject,
  selectIsSaving,
  createProject,
  openProject,
  saveStackYaml,
  setCurrentProject,
} from '@features/project';
import { startDeployment } from '@features/deployment/model/deploymentSlice';
import { PluginStackGenerator } from '@features/canvas/lib/pluginStackGenerator';
import {
  deploymentCommands,
  projectCommands,
  CanvasNode,
  CanvasEdge,
  ec2ServerCommands,
} from '@shared/api/tauri/commands';
import { SettingsDialog } from './dialogs/SettingsDialog';
import { ExportDialog } from './dialogs/ExportDialog';
import { ExportSuccessNotification } from './dialogs/ExportSuccessNotification';
import { AIDialog } from './dialogs/AIDialog';

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
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [selectedFormat, setSelectedFormat] = useState<'png' | 'svg' | 'pdf'>('png');
  const [showExportSuccess, setShowExportSuccess] = useState(false);
  const [showSettingsDialog, setShowSettingsDialog] = useState(false);
  const [showAIDialog, setShowAIDialog] = useState(false);

  const isEC2Project = currentProject?.environment === 'ec2';
  const ec2TargetNode = isEC2Project && targetNodes.length > 0 ? targetNodes[0] : null;
  const currentMonitoringMode = currentProject?.mode || 'all-in-one';

  // 공통 스크린샷 캡처 함수
  const captureCanvasScreenshot = useCallback(async (): Promise<string | null> => {
    try {
      const reactFlowWrapper = document.querySelector('.react-flow') as HTMLElement;
      if (!reactFlowWrapper) return null;

      const viewport = reactFlowWrapper.querySelector('.react-flow__viewport') as HTMLElement;
      if (!viewport) return null;

      // 현재 상태 저장
      const currentTransform = viewport.style.transform;
      const currentTransition = viewport.style.transition;
      const currentOpacity = reactFlowWrapper.style.opacity;
      const currentPointerEvents = reactFlowWrapper.style.pointerEvents;

      // 모든 노드의 바운딩 박스 계산 (DOM에서)
      const nodeElements = viewport.querySelectorAll('.react-flow__node');
      if (nodeElements.length === 0) {
        console.warn('No nodes to capture');
        return null;
      }

      // 현재 transform을 파싱하여 실제 노드 위치 계산
      const transformMatch = currentTransform.match(/translate\((.+?)px,\s*(.+?)px\)\s*scale\((.+?)\)/);
      let currentTranslateX = 0, currentTranslateY = 0, currentScale = 1;
      if (transformMatch) {
        currentTranslateX = parseFloat(transformMatch[1]);
        currentTranslateY = parseFloat(transformMatch[2]);
        currentScale = parseFloat(transformMatch[3]);
      }

      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      const viewportRect = viewport.getBoundingClientRect();

      nodeElements.forEach((nodeEl) => {
        const rect = nodeEl.getBoundingClientRect();
        // viewport 기준 상대 좌표로 변환
        const x = (rect.left - viewportRect.left - currentTranslateX) / currentScale;
        const y = (rect.top - viewportRect.top - currentTranslateY) / currentScale;
        const width = rect.width / currentScale;
        const height = rect.height / currentScale;

        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x + width);
        maxY = Math.max(maxY, y + height);
      });

      const nodesBoundsWidth = maxX - minX;
      const nodesBoundsHeight = maxY - minY;

      // padding 증가하여 여유 공간 확보
      const padding = 80; // 50 -> 80으로 증가
      const scaleX = (viewportRect.width - padding * 2) / nodesBoundsWidth;
      const scaleY = (viewportRect.height - padding * 2) / nodesBoundsHeight;
      const scale = Math.min(scaleX, scaleY, 1);

      console.log('📸 Toolbar screenshot capture:', {
        nodesCount: nodeElements.length,
        bounds: { minX, minY, maxX, maxY },
        size: { width: nodesBoundsWidth, height: nodesBoundsHeight },
        viewport: { width: viewportRect.width, height: viewportRect.height },
        scale
      });

      const centerX = (minX + maxX) / 2;
      const centerY = (minY + maxY) / 2;
      const translateX = viewportRect.width / 2 - centerX * scale;
      const translateY = viewportRect.height / 2 - centerY * scale;

      // 1단계: 화면에서 완전히 숨김 (사용자에게 안 보이게)
      reactFlowWrapper.style.opacity = '0';
      reactFlowWrapper.style.pointerEvents = 'none';

      // 다음 프레임에서 transform 적용 및 캡처 (opacity 변경이 먼저 렌더링되도록)
      const dataUrl = await new Promise<string>((resolve) => {
        requestAnimationFrame(() => {
          // 2단계: transition 비활성화 및 transform 적용
          viewport.style.transition = 'none';
          viewport.style.transform = `translate(${translateX}px, ${translateY}px) scale(${scale})`;

          // 3단계: 또 다른 프레임에서 캡처 (transform이 완전히 적용된 후)
          requestAnimationFrame(async () => {
            const canvas = await html2canvas(viewport, {
              backgroundColor: '#f9fafb',
              scale: 2,
              logging: false,
              useCORS: true,
              allowTaint: true,
            });

            // 4단계: 즉시 원래 상태로 복원
            viewport.style.transition = currentTransition;
            viewport.style.transform = currentTransform;
            reactFlowWrapper.style.opacity = currentOpacity;
            reactFlowWrapper.style.pointerEvents = currentPointerEvents;

            resolve(canvas.toDataURL('image/png'));
          });
        });
      });

      return dataUrl;
    } catch (err) {
      console.error('Failed to capture screenshot:', err);
      return null;
    }
  }, []);

  const handleMonitoringModeChange = useCallback(async (newMode: string) => {
    if (!currentProject?.id) return;
    try {
      const updatedProject = await projectCommands.updateProject(
        currentProject.id,
        newMode,
        undefined
      );
      dispatch(setCurrentProject(updatedProject));

      // 1. 스크린샷 캡처
      const thumbnail = await captureCanvasScreenshot();
      if (thumbnail) {
        console.log('✓ Canvas screenshot captured from Monitoring mode change');
      }

      // 2. EC2 서버 정보 가져오기
      let ec2Server = null;
      if (updatedProject.ec2_server_id) {
        ec2Server = await ec2ServerCommands.getServerById(updatedProject.ec2_server_id);
      }

      // 3. stack.yaml 생성 - updatedProject 사용
      const yamlContent = await PluginStackGenerator.generateStack({
        nodes,
        edges,
        projectName: updatedProject.name,
        environment: updatedProject.environment as 'local' | 'ec2',
        ec2Server: ec2Server || undefined,
        mode: updatedProject.mode,
        workdir: updatedProject.workdir,
        secrets: [],
      });
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
        thumbnail: thumbnail || undefined,
      };
      await projectCommands.saveStackYaml(updatedProject.path, yamlContent, canvasData);
      dispatch(setDirty(false));
    } catch (error) {
      console.error('모니터링 모드 업데이트 실패:', error);
      alert(`모니터링 모드 변경 실패: ${error}`);
    }
  }, [currentProject, dispatch, nodes, edges, captureCanvasScreenshot]);

  const handleSave = useCallback(async () => {
    if (!currentProject) {
      alert('먼저 프로젝트를 생성하거나 열어주세요.');
      return;
    }
    try {
      // 1. 스크린샷 캡처
      const thumbnail = await captureCanvasScreenshot();
      if (thumbnail) {
        console.log('✓ Canvas screenshot captured from Save button');
      }

      // 2. EC2 서버 정보 가져오기
      let ec2Server = null;
      if (currentProject.environment === 'ec2' && currentProject.ec2_server_id) {
        ec2Server = await ec2ServerCommands.getServerById(currentProject.ec2_server_id);
      }

      // 3. Canvas 노드를 stack.yaml로 변환
      const yamlContent = await PluginStackGenerator.generateStack({
        nodes,
        edges,
        projectName: currentProject.name,
        environment: currentProject.environment as 'local' | 'ec2',
        ec2Server: ec2Server || undefined,
        mode: currentProject.mode,
        workdir: currentProject.workdir,
        secrets: [],
      });

      // 4. Canvas 노드를 Tauri 형식으로 변환 (thumbnail 포함)
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
      await dispatch(saveStackYaml({
        projectPath: currentProject.path,
        yamlContent,
        canvasData: {
          nodes: canvasNodes,
          edges: canvasEdges,
          project_name: currentProject.name,
          secrets: [],
          thumbnail: thumbnail || undefined,
        },
      })).unwrap();
      dispatch(setDirty(false));
      alert('stack.yaml이 저장되었습니다!');
    } catch (error) {
      alert(`저장 실패: ${error}`);
    }
  }, [currentProject, nodes, edges, dispatch, captureCanvasScreenshot]);

  const handleDeploy = useCallback(async () => {
    if (!currentProject) {
      alert('먼저 프로젝트를 생성하거나 열어주세요.');
      return;
    }
    if (isDirty) {
      try {
        // 1. 스크린샷 캡처
        const thumbnail = await captureCanvasScreenshot();
        if (thumbnail) {
          console.log('✓ Canvas screenshot captured from Deploy button');
        }

        // 2. EC2 서버 정보 가져오기
        let ec2Server = null;
        if (currentProject.environment === 'ec2' && currentProject.ec2_server_id) {
          ec2Server = await ec2ServerCommands.getServerById(currentProject.ec2_server_id);
        }

        // 3. Generate stack.yaml using PluginStackGenerator
        const yamlContent = await PluginStackGenerator.generateStack({
          nodes,
          edges,
          projectName: currentProject.name,
          environment: currentProject.environment as 'local' | 'ec2',
          ec2Server: ec2Server || undefined,
          mode: currentProject.mode,
          workdir: currentProject.workdir,
          secrets: [],
        });

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
        await dispatch(saveStackYaml({
          projectPath: currentProject.path,
          yamlContent,
          canvasData: {
            nodes: canvasNodes,
            edges: canvasEdges,
            project_name: currentProject.name,
            secrets: [],
            thumbnail: thumbnail || undefined,
          },
        })).unwrap();
        dispatch(setDirty(false));
      } catch (error) {
        alert(`저장 실패: ${error}`);
        return;
      }
    }
    if (currentProject.environment === 'local') {
      try {
        const hasDocker = await deploymentCommands.checkDocker();
        if (!hasDocker) {
          alert('Docker가 설치되어 있지 않습니다.');
          return;
        }
        const isDockerRunning = await deploymentCommands.checkDockerRunning();
        if (!isDockerRunning) {
          alert('Docker가 실행되고 있지 않습니다.');
          return;
        }
      } catch (error) {
        alert(`Docker 검증 실패: ${error}`);
        return;
      }
    }
    dispatch(startDeployment());
    setIsDeploying(true);
    try {
      const stackYamlPath = `${currentProject.path}/stack.yaml`;
      const result = await deploymentCommands.deployStack(currentProject.path, stackYamlPath);
      if (result.status === 'deploying') navigate('/deployment', { replace: true });
    } catch (error) {
      alert(`배포 실패: ${error}`);
      setIsDeploying(false);
    }
  }, [currentProject, isDirty, nodes, edges, dispatch, navigate, captureCanvasScreenshot]);

  const handleStopDeployment = useCallback(async () => {
    try {
      await deploymentCommands.stopDeployment();
      alert('배포가 중단되었습니다.');
      setIsDeploying(false);
    } catch (error) {
      alert(`배포 중단 실패: ${error}`);
    }
  }, []);

  const handleConfirmExport = useCallback(async () => {
    setShowExportDialog(false);
    const reactFlowElement = document.querySelector('.react-flow') as HTMLElement;
    if (!reactFlowElement) {
      alert('캔버스를 찾을 수 없습니다.');
      return;
    }
    const minimap = document.querySelector('.react-flow__minimap') as HTMLElement;
    const controls = document.querySelector('.react-flow__controls') as HTMLElement;
    const attribution = document.querySelector('.react-flow__attribution') as HTMLElement;
    const elementsToHide = [minimap, controls, attribution].filter(el => el !== null);
    const originalDisplays = elementsToHide.map(el => el.style.display);
    elementsToHide.forEach(el => el.style.display = 'none');

    setTimeout(() => {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
      const baseFileName = currentProject ? `${currentProject.name}_canvas_${timestamp}` : `canvas_${timestamp}`;
      import('html-to-image').then(async (htmlToImage) => {
        try {
          let dataUrl: string;
          let fileName: string;
          if (selectedFormat === 'png') {
            dataUrl = await htmlToImage.toPng(reactFlowElement, { backgroundColor: '#ffffff', pixelRatio: 2, cacheBust: true });
            fileName = `${baseFileName}.png`;
          } else if (selectedFormat === 'svg') {
            dataUrl = await htmlToImage.toSvg(reactFlowElement, { backgroundColor: '#ffffff', cacheBust: true });
            fileName = `${baseFileName}.svg`;
          } else {
            const pngDataUrl = await htmlToImage.toPng(reactFlowElement, { backgroundColor: '#ffffff', pixelRatio: 2, cacheBust: true });
            const { jsPDF } = await import('jspdf');
            const pdf = new jsPDF({ orientation: 'landscape', unit: 'px', format: [reactFlowElement.offsetWidth, reactFlowElement.offsetHeight] });
            pdf.addImage(pngDataUrl, 'PNG', 0, 0, reactFlowElement.offsetWidth, reactFlowElement.offsetHeight);
            const pdfBlob = pdf.output('blob');
            dataUrl = URL.createObjectURL(pdfBlob);
            fileName = `${baseFileName}.pdf`;
          }
          elementsToHide.forEach((el, index) => el.style.display = originalDisplays[index]);
          const link = document.createElement('a');
          link.href = dataUrl;
          link.download = fileName;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          setShowExportSuccess(true);
        } catch (error) {
          elementsToHide.forEach((el, index) => el.style.display = originalDisplays[index]);
          console.error('Export 실패:', error);
          alert('Export에 실패했습니다.');
        }
      });
    }, 100);
  }, [currentProject, selectedFormat]);

  const handleOpenFolder = useCallback(async () => {
    try {
      await invoke('open_downloads_folder');
    } catch (error) {
      console.error('폴더 열기 실패:', error);
      alert('폴더를 열 수 없습니다.');
    }
  }, []);

  const handleOpenProjectFolder = useCallback(async () => {
    if (!currentProject?.path) {
      alert('프로젝트 경로가 없습니다.');
      return;
    }
    try {
      await invoke('open_folder_in_explorer', { path: currentProject.path });
    } catch (error) {
      console.error('폴더 열기 실패:', error);
      alert('폴더를 열 수 없습니다.');
    }
  }, [currentProject]);

  const handleAutoAlign = useCallback(() => {
    dispatch(autoAlignNodes());
  }, [dispatch]);


  return (
    <>
      <div className="h-12 bg-gray-800 text-white flex items-center justify-between px-4 border-b border-gray-600">
        {/* Left section */}
        <div className="flex items-center space-x-4">
          <button onClick={() => navigate('/')} className="p-1 hover:bg-gray-700 rounded transition-colors" title="홈으로">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-lg font-semibold">
            ARFNI Canvas
            {currentProject && (
              <span className="ml-2 text-sm text-gray-400">- {currentProject.name}</span>
            )}
          </h1>
        </div>

        {/* Middle section */}
        <div className="flex items-center space-x-2">
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
                onClick={() => { }}
                disabled={!currentProject}
                className="px-2.5 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 transition-colors flex items-center gap-1 disabled:opacity-50"
              >
                CI/CD
              </button>
            </>
          )}
        </div>

        {/* Right section */}
        <div className="flex items-center space-x-2">
          <button onClick={() => setShowAIDialog(true)} className="p-2 hover:bg-gray-700 rounded transition-colors" title="AI">
            <img src={aiLogo} alt="AI" className="w-4 h-4" />
          </button>

          <button onClick={() => setShowSettingsDialog(true)} className="p-2 hover:bg-gray-700 rounded transition-colors" title="설정">
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
            onClick={() => navigate('/yml')}
            className="flex items-center gap-1.5 px-2.5 py-1 bg-purple-600 text-white text-sm rounded hover:bg-purple-700 transition-colors"
            title="GitHub Actions YML 생성"
          >
            <FileText className="w-3.5 h-3.5" />
            Github YML
          </button>

          <button
            onClick={handleAutoAlign}
            disabled={nodes.length === 0}
            className="flex items-center gap-1.5 px-2.5 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title="노드 자동 정렬"
          >
            <AlignJustify className="w-3.5 h-3.5" />
            Auto Alignment
          </button>

          <button
            onClick={() => setShowExportDialog(true)}
            className="flex items-center gap-1.5 px-2.5 py-1 bg-indigo-600 text-white text-sm rounded hover:bg-indigo-700 transition-colors"
            title="캔버스 내보내기"
          >
            <Camera className="w-3.5 h-3.5" />
            Export
          </button>

          {!isDeploying ? (
            <button
              onClick={handleDeploy}
              disabled={!currentProject}
              className="px-2.5 py-1 bg-green-600 text-white text-sm rounded hover:bg-green-700 transition-colors flex items-center gap-1.5 disabled:opacity-50"
            >
              <PlayCircle className="w-3.5 h-3.5" />
              Deploy
            </button>
          ) : (
            <button
              onClick={handleStopDeployment}
              className="px-2.5 py-1 bg-red-600 text-white text-sm rounded hover:bg-red-700 transition-colors flex items-center gap-1.5"
            >
              <StopCircle className="w-3.5 h-3.5" />
              Stop
            </button>
          )}
        </div>
      </div>


      <ExportDialog
        show={showExportDialog}
        onClose={() => setShowExportDialog(false)}
        selectedFormat={selectedFormat}
        onFormatChange={setSelectedFormat}
        onConfirm={handleConfirmExport}
      />

      <ExportSuccessNotification
        show={showExportSuccess}
        onClose={() => setShowExportSuccess(false)}
        onOpenFolder={handleOpenFolder}
      />

      <SettingsDialog
        show={showSettingsDialog}
        onClose={() => setShowSettingsDialog(false)}
        currentProject={currentProject}
        onOpenProjectFolder={handleOpenProjectFolder}
      />

      <AIDialog
        show={showAIDialog}
        onClose={() => setShowAIDialog(false)}
        currentProject={currentProject}
      />
    </>
  );
}
