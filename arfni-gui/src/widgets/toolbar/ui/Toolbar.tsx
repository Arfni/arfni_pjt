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
  FileText
} from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { useAppDispatch, useAppSelector } from '@app/hooks';
import {
  selectNodes,
  selectEdges,
  selectIsDirty,
  setDirty,
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
import { startDeployment } from '@features/deployment/model/deploymentSlice';
import { stackYamlGenerator, stackToYamlString } from '@features/canvas/lib/stackYamlGenerator';
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

  const handleMonitoringModeChange = useCallback(async (newMode: string) => {
    if (!currentProject?.id) return;
    try {
      const updatedProject = await projectCommands.updateProject(
        currentProject.id,
        newMode,
        undefined
      );
      dispatch(setCurrentProject(updatedProject));
      let ec2Server = null;
      if (updatedProject.ec2_server_id) {
        ec2Server = await ec2ServerCommands.getServerById(updatedProject.ec2_server_id);
      }
      const stackYaml = stackYamlGenerator(nodes, edges, {
        projectName: updatedProject.name,
        environment: updatedProject.environment,
        ec2Server: ec2Server || undefined,
        mode: updatedProject.mode,
        workdir: updatedProject.workdir,
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
      await projectCommands.saveStackYaml(updatedProject.path, yamlContent, canvasData);
      dispatch(setDirty(false));
    } catch (error) {
      console.error('모니터링 모드 업데이트 실패:', error);
      alert(`모니터링 모드 변경 실패: ${error}`);
    }
  }, [currentProject, dispatch, nodes, edges]);

  const handleSave = useCallback(async () => {
    if (!currentProject) {
      alert('먼저 프로젝트를 생성하거나 열어주세요.');
      return;
    }
    try {
      let ec2Server = null;
      if (currentProject.environment === 'ec2' && currentProject.ec2_server_id) {
        ec2Server = await ec2ServerCommands.getServerById(currentProject.ec2_server_id);
      }
      const stackYaml = stackYamlGenerator(nodes, edges, {
        projectName: currentProject.name,
        environment: currentProject.environment,
        ec2Server: ec2Server || undefined,
        secrets: [],
        outputs: {},
      });
      const yamlContent = stackToYamlString(stackYaml);
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
        },
      })).unwrap();
      dispatch(setDirty(false));
      alert('stack.yaml이 저장되었습니다!');
    } catch (error) {
      alert(`저장 실패: ${error}`);
    }
  }, [currentProject, nodes, edges, dispatch]);

  const handleDeploy = useCallback(async () => {
    if (!currentProject) {
      alert('먼저 프로젝트를 생성하거나 열어주세요.');
      return;
    }
    if (isDirty) {
      const shouldSave = confirm('변경사항을 먼저 저장하시겠습니까?');
      if (shouldSave) await handleSave();
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
  }, [currentProject, isDirty, handleSave, dispatch, navigate]);

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
                className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors flex items-center gap-1 disabled:opacity-50"
              >
                CI/CD
              </button>
            </>
          )}
        </div>

        {/* Right section */}
        <div className="flex items-center space-x-2">
          <button onClick={() => setShowAIDialog(true)} className="p-2 hover:bg-gray-700 rounded transition-colors" title="AI">
            <img src="/src/assets/ai.png" alt="AI" className="w-4 h-4" />
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
            className="flex items-center gap-2 px-3 py-1 bg-purple-600 text-white rounded hover:bg-purple-700 transition-colors"
            title="GitHub Actions YML 생성"
          >
            <FileText className="w-4 h-4" />
            Github YML
          </button>

          <button
            onClick={() => setShowExportDialog(true)}
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
      />
    </>
  );
}
