import React, { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Save,
  PlayCircle,
  StopCircle,
  CheckCircle,
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
  const [settingsTab, setSettingsTab] = useState<'projectPath' | 'activePort'>('projectPath');
  const [portSearchQuery, setPortSearchQuery] = useState('');
  const [activePorts, setActivePorts] = useState<number[]>([]);

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

  const fetchActivePorts = useCallback(async () => {
    try {
      if (currentProject?.environment === 'ec2') {
        if (!currentProject.ec2_server_id) {
          console.error('EC2 서버 ID가 없습니다.');
          setActivePorts([]);
          return;
        }
        const ec2Server = await ec2ServerCommands.getServerById(currentProject.ec2_server_id);
        const params = {
          host: ec2Server.host,
          user: ec2Server.user,
          pem_path: ec2Server.pem_path,
        };
        const result = await invoke<number[]>('list_ec2_listening_ports', { params });
        setActivePorts(result);
      } else {
        const result = await invoke<number[]>('list_listening_ports');
        setActivePorts(result);
      }
    } catch (error) {
      console.error('포트 조회 실패:', error);
      setActivePorts([]);
    }
  }, [currentProject]);

  const handleSettingsTabChange = useCallback(async (tab: 'projectPath' | 'activePort') => {
    setSettingsTab(tab);
    if (tab === 'activePort') {
      await fetchActivePorts();
    }
  }, [fetchActivePorts]);

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
                onClick={handleConfirmExport}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
              >
                확인
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Export Success */}
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

      {/* Settings Dialog */}
      {showSettingsDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-[800px] h-[600px] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b">
              <h2 className="text-2xl font-bold text-gray-800">Setting</h2>
              <button
                onClick={() => setShowSettingsDialog(false)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="flex flex-1 overflow-hidden">
              {/* Left Sidebar */}
              <div className="w-48 bg-gray-50 border-r p-4">
                <div className="relative mb-4">
                  <input
                    type="text"
                    placeholder="Search..."
                    className="w-full px-3 py-2 border rounded-lg text-sm pr-8"
                  />
                  <svg className="w-4 h-4 absolute right-3 top-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </div>

                <div className="space-y-1">
                  <button
                    onClick={() => handleSettingsTabChange('projectPath')}
                    className={`w-full text-left px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
                      settingsTab === 'projectPath'
                        ? 'bg-blue-100 text-blue-700'
                        : 'text-gray-700 hover:bg-gray-100'
                    }`}
                  >
                    Project Path
                  </button>
                  <button
                    onClick={() => handleSettingsTabChange('activePort')}
                    className={`w-full text-left px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
                      settingsTab === 'activePort'
                        ? 'bg-blue-100 text-blue-700'
                        : 'text-gray-700 hover:bg-gray-100'
                    }`}
                  >
                    Active Port
                  </button>
                </div>
              </div>

              {/* Right Content */}
              <div className="flex-1 p-8 overflow-y-auto">
                {settingsTab === 'projectPath' && (
                  <div>
                    <h3 className="text-xl font-semibold text-gray-800 mb-6">Project Path</h3>
                    <div className="flex items-center gap-3">
                      <input
                        type="text"
                        value={currentProject?.path || ''}
                        readOnly
                        className="flex-1 px-4 py-3 border rounded-lg bg-gray-50 text-gray-700"
                      />
                      <button
                        onClick={handleOpenProjectFolder}
                        className="px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                        title="폴더 열기"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                        </svg>
                      </button>
                    </div>
                  </div>
                )}

                {settingsTab === 'activePort' && (
                  <div>
                    <h3 className="text-xl font-semibold text-gray-800 mb-6">
                      Activate Port {currentProject?.environment === 'ec2' ? '(EC2)' : '(Local)'}
                    </h3>

                    {/* Search */}
                    <div className="mb-6">
                      <label className="block text-sm font-medium text-gray-700 mb-2">Search</label>
                      <div className="relative">
                        <input
                          type="text"
                          value={portSearchQuery}
                          onChange={(e) => setPortSearchQuery(e.target.value)}
                          placeholder="포트 번호 입력..."
                          className="w-full px-4 py-3 border rounded-lg pr-10"
                        />
                        <svg className="w-5 h-5 absolute right-3 top-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                      </div>
                      {portSearchQuery && (
                        <div className="mt-2">
                          {activePorts.includes(parseInt(portSearchQuery)) ? (
                            <p className="text-green-600 font-medium">This port is activate!</p>
                          ) : (
                            <p className="text-red-600 font-medium">This port is unactivate!</p>
                          )}
                        </div>
                      )}
                    </div>

                    {/* All Active Ports */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">All Active Port</label>
                      <div className="border rounded-lg p-4 bg-gray-50 max-h-64 overflow-y-auto">
                        <p className="text-gray-700 text-sm leading-relaxed break-all">
                          {activePorts.length > 0 ? activePorts.join(', ') : '활성 포트가 없습니다.'}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
