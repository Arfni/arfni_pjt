import React, { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Save,
  ArrowLeft,
  PlayCircle,
  StopCircle,
} from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation('canvas');

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
  const [showMonitoringHelp, setShowMonitoringHelp] = useState(false);

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

      // 4. stack.yaml 생성 - updatedProject 사용
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

      // Canvas 노드를 stack.yaml로 변환
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

    // Start loading immediately
    setIsDeploying(true);
    dispatch(startDeployment());

    if (isDirty) {
      try {
        console.log('[Deploy] Saving stack.yaml...');
        let ec2Server = null;
        if (currentProject.environment === 'ec2' && currentProject.ec2_server_id) {
          ec2Server = await ec2ServerCommands.getServerById(currentProject.ec2_server_id);
        }

        // Generate stack.yaml using PluginStackGenerator
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
          },
        })).unwrap();
        dispatch(setDirty(false));
        console.log('[Deploy] stack.yaml saved');

        // If GitHub project, commit and push to GitHub
        if (currentProject.github_repo_url) {
          try {
            console.log('[Deploy] Committing stack.yaml to GitHub...');
            await projectCommands.commitAndPushStackYaml(currentProject.id, yamlContent);
            console.log('[Deploy] stack.yaml committed to GitHub');
          } catch (commitError) {
            console.error('[Deploy] GitHub commit failed:', commitError);
            alert(`GitHub 커밋 실패: ${commitError}`);
            setIsDeploying(false);
            return;
          }
        }
      } catch (error) {
        alert(`저장 실패: ${error}`);
        setIsDeploying(false);
        return;
      }
    }
    if (currentProject.environment === 'local') {
      try {
        const hasDocker = await deploymentCommands.checkDocker();
        if (!hasDocker) {
          alert('Docker가 설치되어 있지 않습니다.');
          setIsDeploying(false);
          return;
        }
        const isDockerRunning = await deploymentCommands.checkDockerRunning();
        if (!isDockerRunning) {
          alert('Docker가 실행되고 있지 않습니다.');
          setIsDeploying(false);
          return;
        }
      } catch (error) {
        alert(`Docker 검증 실패: ${error}`);
        setIsDeploying(false);
        return;
      }
    }

    // Start deployment
    console.log('[Deploy] Starting deployment...');
    try {
      const stackYamlPath = `${currentProject.path}/stack.yaml`;
      const result = await deploymentCommands.deployStack(currentProject.path, stackYamlPath, currentProject.id);
      if (result.status === 'deploying') {
        console.log('[Deploy] Navigating to deployment page');
        navigate('/deployment', { replace: true });
      }
    } catch (error) {
      alert(`배포 실패: ${error}`);
      setIsDeploying(false);
    }
  }, [currentProject, isDirty, nodes, edges, dispatch, navigate]);

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
      <div className="h-10 bg-white border-b border-gray-200 flex items-center justify-between px-6">
        {/* Left section */}
        <div className="flex items-center gap-6">
          <button
            onClick={() => navigate('/')}
            className="text-gray-700 hover:text-gray-900 transition-colors flex items-center gap-2"
            title={t('toolbar.home')}
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-base font-bold text-gray-900">
            {currentProject && (
              <span>{currentProject.name}</span>
            )}
          </h1>
        </div>

        {/* Middle section */}
        <div className="flex items-center gap-6">
          <button
            onClick={() => setShowSettingsDialog(true)}
            className="text-sm text-gray-700 hover:text-gray-900 hover:bg-gray-100 transition-colors px-3 py-1.5 rounded"
            title={t('toolbar.settings')}
          >
            {t('toolbar.settings')}
          </button>

          <button
            onClick={handleAutoAlign}
            disabled={nodes.length === 0}
            className="text-sm text-gray-700 hover:text-gray-900 hover:bg-gray-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed px-3 py-1.5 rounded"
            title={t('toolbar.autoAlignment')}
          >
            {t('toolbar.autoAlignment')}
          </button>

          <button
            onClick={() => setShowExportDialog(true)}
            className="text-sm text-gray-700 hover:text-gray-900 hover:bg-gray-100 transition-colors px-3 py-1.5 rounded"
            title={t('toolbar.exportCanvas')}
          >
            {t('toolbar.export')}
          </button>

          <button
            onClick={() => navigate('/yml')}
            disabled={true}
            className="text-sm text-gray-700 hover:text-gray-900 hover:bg-gray-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed px-3 py-1.5 rounded"
            title={t('toolbar.githubYml')}
          >
            {t('toolbar.githubYml')}
          </button>

          {isEC2Project && (
            <>
            <div className="flex items-center gap-2">
                <span className="text-sm text-gray-700">{t('toolbar.monitoring')}</span>
                <select
                  value={currentMonitoringMode}
                  onChange={(e) => handleMonitoringModeChange(e.target.value)}
                  disabled={!currentProject}
                  className="text-sm bg-white text-gray-700 border border-gray-300 rounded px-2 py-0.5 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                >
                  <option value="all-in-one">{t('toolbar.mode.allInOne')}</option>
                  <option value="hybrid">{t('toolbar.mode.hybrid')}</option>
                  <option value="no-monitoring">{t('toolbar.mode.noMonitoring')}</option>
                </select>

                <div className="flex items-center relative">
                  <button
                    onClick={() => setShowMonitoringHelp(!showMonitoringHelp)}
                    className="text-gray-700 hover:text-gray-900 hover:bg-gray-100 transition-colors p-1 rounded"
                    title={t('toolbar.help')}
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <circle cx="12" cy="12" r="10" strokeWidth="1.5"/>
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3m.08 4h.01"/>
                    </svg>
                  </button>

                  {/* Monitoring Help Tooltip */}
                  {showMonitoringHelp && (
                    <>
                      {/* Backdrop to close tooltip */}
                      <div
                        className="fixed inset-0 z-40"
                        onClick={() => setShowMonitoringHelp(false)}
                      />
                      {/* Tooltip */}
                      <div className="absolute top-full right-0 mt-4 w-96 bg-white border border-gray-300 rounded-lg shadow-lg p-4 z-50">
                        <ol className="list-decimal list-inside space-y-2 text-sm text-gray-700">
                          <li>
                            <strong>{t('toolbar.mode.allInOne')}:</strong> {t('toolbar.monitoringHelp.allInOne')}
                          </li>
                          <li>
                            <strong>{t('toolbar.mode.hybrid')}:</strong> {t('toolbar.monitoringHelp.hybrid')}
                          </li>
                          <li>
                            <strong>{t('toolbar.mode.noMonitoring')}:</strong> {t('toolbar.monitoringHelp.noMonitoring')}
                          </li>
                        </ol>
                      </div>
                    </>
                  )}
                </div>
              </div>              
              
            </>
          )}

          

          {isEC2Project && (
            <button
              onClick={() => setShowAIDialog(true)}
              className="text-sm text-gray-700 hover:text-gray-900 hover:bg-gray-100 transition-colors flex items-center gap-1 px-3 py-1.5 rounded"
              title={t('toolbar.ai')}
            >
              <img src={aiLogo} alt="AI" className="w-3 h-3" />

            </button>
          )}

          <button
            onClick={handleSave}
            disabled={isSaving || !currentProject}
            className="p-2 text-gray-700 hover:text-gray-900 hover:bg-gray-100 transition-colors relative disabled:opacity-50 rounded"
            title={t('toolbar.save')}
          >
            <Save className="w-4 h-4" />
            {isDirty && <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-yellow-400 rounded-full"></span>}
          </button>

          

          {!isDeploying ? (
            <button
              onClick={handleDeploy}
              disabled={!currentProject}
              className="px-4 py-1.5 bg-blue-600 text-white text-sm font-bold rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center gap-1.5"
            >
              <PlayCircle className="w-4 h-4" strokeWidth={2.5} />
              {t('toolbar.deploy')}
            </button>
          ) : (
            <button
              onClick={handleStopDeployment}
              className="px-4 py-1.5 bg-red-600 text-white text-sm rounded-md hover:bg-red-700 transition-colors flex items-center gap-1.5"
            >
              <StopCircle className="w-4 h-4" strokeWidth={2.5} />
              {t('toolbar.stop')}
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
