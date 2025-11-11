import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ReactFlow,
  MiniMap,
  Controls,
  Background,
  Connection,
  Edge,
  BackgroundVariant,
  NodeChange,
  EdgeChange,
  useReactFlow,
  ReactFlowProvider,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { useTranslation } from 'react-i18next';

import { useAppDispatch, useAppSelector } from '@app/hooks';
import {
  selectNodes,
  selectEdges,
  selectSelectedTemplate,
  selectSelectedNodeId,
  onNodesChange as handleNodesChange,
  onEdgesChange as handleEdgesChange,
  addEdge as addEdgeAction,
  addNode,
  selectNode,
  selectTemplate,
  deleteNode,
  deleteEdge,
} from '@features/canvas';
import { selectCurrentProject } from '@features/project';

import { ServiceNode } from '@entities/service/ui/ServiceNode';
import { TargetNode } from '@entities/target/ui/TargetNode';
import {
  createServiceNode,
  createTargetNode,
  createDatabaseNode
} from '@shared/config/nodeTypes';
import { useAutoSave } from '@features/canvas/hooks/useAutoSave';
import { pluginService } from '@services/pluginLoader';

const nodeTypes = {
  service: ServiceNode,
  target: TargetNode,
  database: ServiceNode,
};

// MiniMap용 커스텀 노드 컴포넌트
function MiniMapNode({ x, y, width, height }: any) {
  return (
    <g>
      {/* 그림자 효과 */}
      <rect
        x={x}
        y={y + 2}
        width={width}
        height={height}
        rx={6}
        fill="rgba(0,0,0,0.25)"
      />
      {/* 메인 노드 */}
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        rx={6}
        fill="white"
        stroke="#E5E7EB"
        strokeWidth={0.5}
      />
    </g>
  );
}

function CanvasEditorInner() {
  const { t } = useTranslation('canvas');
  const dispatch = useAppDispatch();
  const nodes = useAppSelector(selectNodes);
  const edges = useAppSelector(selectEdges);
  const selectedTemplate = useAppSelector(selectSelectedTemplate);
  const selectedNodeId = useAppSelector(selectSelectedNodeId);
  const currentProject = useAppSelector(selectCurrentProject);
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const reactFlowInstance = useReactFlow();
  const { project } = reactFlowInstance;
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);

  // Auto-save: Canvas 변경 후 2초 뒤 자동 저장
  const { isSaving, lastSaved } = useAutoSave(2000);

  // 초기 노드 설정 (첫 렌더링시만)
  useEffect(() => {
    if (nodes.length === 0) {
      // 빈 캔버스로 시작 - 사용자가 직접 노드 추가
      // 원하면 아래 주석 해제하여 샘플 노드 추가 가능
      /*
      dispatch(addNode(createTargetNode(
        {
          name: t('nodeDefaults.localDocker'),
          type: 'docker-desktop',
        },
        { x: 100, y: 100 }
      )));

      dispatch(addNode(createDatabaseNode(
        {
          name: t('nodeDefaults.postgres'),
          type: 'postgres',
          version: '15',
          ports: ['5432:5432'],
        },
        { x: 400, y: 100 }
      )));
      */
    }
  }, []);

  // ESC 키로 템플릿 선택 취소, Del 키로 노드/엣지 삭제
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        dispatch(selectTemplate(null));
        dispatch(selectNode(null));
        setSelectedEdgeId(null);
      } else if (e.key === 'Delete') {
        if (selectedNodeId) {
          dispatch(deleteNode(selectedNodeId));
        } else if (selectedEdgeId) {
          dispatch(deleteEdge(selectedEdgeId));
          setSelectedEdgeId(null);
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [dispatch, selectedNodeId, selectedEdgeId]);

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    dispatch(handleNodesChange(changes));
  }, [dispatch]);

  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    dispatch(handleEdgesChange(changes));
  }, [dispatch]);

  const onConnect = useCallback((params: Edge | Connection) => {
    dispatch(addEdgeAction(params));
  }, [dispatch]);

  // 드래그 오버 처리
  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  // 드롭 처리
  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();

      const data = event.dataTransfer.getData('application/reactflow');
      if (!data) return;

      const { type: nodeType, category } = JSON.parse(data);

      if (!reactFlowWrapper.current) return;

      const reactFlowBounds = reactFlowWrapper.current.getBoundingClientRect();
      const position = project({
        x: event.clientX - reactFlowBounds.left,
        y: event.clientY - reactFlowBounds.top,
      });

      // 현재 프로젝트의 environment에 따라 target 결정
      const defaultTarget = currentProject?.environment === 'ec2' ? 'ec2' : 'local';

      let newNode;

      // 플러그인 정보 가져오기
      const plugin = pluginService.getPluginByNodeType(nodeType);
      const canvasConfig = plugin?.manifest.contributes?.canvas;

      if (category === 'service') {
        // 서비스 노드 - 플러그인 설정 사용
        const serviceData: any = {
          name: canvasConfig?.label || nodeType.toUpperCase(),
          serviceType: nodeType,
          icon: plugin?.iconPath // 플러그인 아이콘 저장
        };

        // 플러그인의 serviceTemplate에서 기본값 가져오기
        if (plugin?.frameworkDefinition?.serviceTemplate?.spec) {
          const templateSpec = plugin.frameworkDefinition.serviceTemplate.spec;

          // ports - 템플릿에 있으면 사용
          if (templateSpec.ports && templateSpec.ports.length > 0) {
            serviceData.ports = templateSpec.ports;
          } else if (canvasConfig?.ports && canvasConfig.ports.length > 0) {
            const defaultPort = canvasConfig.ports[0].port;
            serviceData.ports = [`${defaultPort}:${defaultPort}`];
          }

          // build path - 템플릿에 있으면 사용
          if (templateSpec.build) {
            serviceData.build = templateSpec.build;
          } else if (plugin?.manifest.category === 'framework') {
            // 사용자가 지정할 수 있도록 빈 값으로 시작
            serviceData.build = '';
          }

          // image - 템플릿에 있으면 사용
          if (templateSpec.image) {
            serviceData.image = templateSpec.image;
          }

          // health - 템플릿에 있으면 사용
          if (templateSpec.health) {
            serviceData.health = templateSpec.health;
          }

          // env와 volumes는 초기에는 비워둠 (사용자가 설정)
          // 연결 시 자동 추가되도록 postProcessFrameworkSpec에서 처리
        } else {
          // 템플릿이 없는 경우 플러그인 기본값 사용
          if (canvasConfig?.ports && canvasConfig.ports.length > 0) {
            const defaultPort = canvasConfig.ports[0].port;
            serviceData.ports = [`${defaultPort}:${defaultPort}`];
          }

          if (plugin?.manifest.category === 'framework') {
            serviceData.build = '';
          } else {
            serviceData.image = `${nodeType}:latest`;
          }
        }

        newNode = createServiceNode(serviceData, position, defaultTarget);
      } else if (category === 'database') {
        // 데이터베이스 노드 - 플러그인 설정 사용
        const dbData: any = {
          name: canvasConfig?.label || nodeType.toUpperCase(),
          type: nodeType as 'mysql' | 'postgres' | 'redis' | 'mongodb'
        };

        // 플러그인에서 포트 정보 가져오기
        if (canvasConfig?.ports && canvasConfig.ports.length > 0) {
          const defaultPort = canvasConfig.ports[0].port;
          dbData.ports = [`${defaultPort}:${defaultPort}`];
        }

        // 플러그인 템플릿에서 기본 설정 가져오기
        if (plugin?.manifest.contributes?.services) {
          const serviceTemplate = plugin.manifest.contributes.services[nodeType];

          if (serviceTemplate?.spec) {
            // 버전 정보
            if (serviceTemplate.spec.version) {
              dbData.version = serviceTemplate.spec.version;
            }

            // 환경변수 템플릿 (사용자가 수정 가능)
            if (serviceTemplate.spec.env) {
              dbData.env = {};  // 빈 객체로 시작 (사용자가 필요시 추가)
            }

            // volumes 템플릿 (사용자가 수정 가능)
            if (serviceTemplate.spec.volumes) {
              dbData.volumes = [];  // 빈 배열로 시작 (사용자가 필요시 추가)
            }
          }
        }

        newNode = createDatabaseNode(dbData, position, defaultTarget);
      } else if (category === 'target') {
        // 타겟 노드
        const targetData: any = {
          name: nodeType === 'docker-local' ? t('nodeDefaults.dockerLocal') : t('nodeDefaults.ec2'),
          type: nodeType === 'docker-local' ? 'docker-desktop' : 'ec2.ssh'
        };

        newNode = createTargetNode(targetData, position);
      } else {
        return;
      }

      dispatch(addNode(newNode as any));
    },
    [dispatch, project, currentProject]
  );

  // 캔버스 클릭 시 선택 해제만 처리
  const onPaneClick = useCallback(() => {
    // 빈 캔버스 클릭 시 노드/엣지 선택 해제
    dispatch(selectNode(null));
    setSelectedEdgeId(null);
  }, [dispatch]);

  const onNodeClick = useCallback((_event: React.MouseEvent, node: any) => {
    dispatch(selectNode(node.id));
    setSelectedEdgeId(null);
  }, [dispatch]);

  const onEdgeClick = useCallback((event: React.MouseEvent, edge: any) => {
    event.stopPropagation();
    setSelectedEdgeId(edge.id);
    dispatch(selectNode(null));
  }, [dispatch]);

  const handleDeleteEdge = useCallback((e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
    }
    if (selectedEdgeId) {
      dispatch(deleteEdge(selectedEdgeId));
      setSelectedEdgeId(null);
    }
  }, [dispatch, selectedEdgeId]);

  // 선택된 엣지의 중간점 계산
  const getEdgeCenterPosition = useCallback(() => {
    if (!selectedEdgeId || !reactFlowWrapper.current) return null;

    const selectedEdge = edges.find(e => e.id === selectedEdgeId);
    if (!selectedEdge) return null;

    const sourceNode = nodes.find(n => n.id === selectedEdge.source);
    const targetNode = nodes.find(n => n.id === selectedEdge.target);

    if (!sourceNode || !targetNode) return null;

    // 노드 중심점 계산
    const sourceX = sourceNode.position.x + (sourceNode.width || 140) / 2;
    const sourceY = sourceNode.position.y + (sourceNode.height || 80) / 2;
    const targetX = targetNode.position.x + (targetNode.width || 140) / 2;
    const targetY = targetNode.position.y + (targetNode.height || 80) / 2;

    // 중간점 계산
    const centerX = (sourceX + targetX) / 2;
    const centerY = (sourceY + targetY) / 2;

    return { x: centerX, y: centerY };
  }, [selectedEdgeId, edges, nodes]);

  return (
    <div
      ref={reactFlowWrapper}
      className="h-full w-full bg-gray-50"
      onDrop={onDrop}
      onDragOver={onDragOver}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges.map(edge => ({
          ...edge,
          style: {
            strokeWidth: edge.id === selectedEdgeId ? 3 : 2,
            stroke: edge.id === selectedEdgeId ? '#ef4444' : '#94a3b8',
          },
        }))}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={onNodeClick}
        onEdgeClick={onEdgeClick}
        onPaneClick={onPaneClick}
        nodeTypes={nodeTypes}
        fitView
        deleteKeyCode={null}
        defaultEdgeOptions={{
          type: 'smoothstep',
          style: { strokeWidth: 2, stroke: '#94a3b8' },
        }}
      >
        <Controls className="!bg-white !border !border-gray-200 !shadow-md" />
        <MiniMap
          className="!bg-white !border !border-gray-200 !shadow-md"
          nodeComponent={MiniMapNode}
          nodeColor={(node) => {
            if (node.type === 'database') return '#3b82f6';
            if (node.type === 'service') return '#06b6d4';
            return '#6b7280';
          }}
        />
        <Background variant={BackgroundVariant.Dots} gap={16} size={1} color="#d1d5db" />
      </ReactFlow>

      {/* Auto-save 인디케이터 */}
      {isSaving && (
        <div className="absolute top-4 right-4 bg-white border border-yellow-300 text-yellow-700 px-3 py-1.5 rounded-lg shadow-md z-10 flex items-center gap-2 text-sm">
          <div className="w-3 h-3 border-2 border-yellow-500 border-t-transparent rounded-full animate-spin"></div>
          {t('autoSave.saving')}
        </div>
      )}
      {!isSaving && lastSaved && (
        <div className="absolute top-4 right-4 bg-white border border-green-300 text-green-700 px-3 py-1.5 rounded-lg shadow-md z-10 text-sm">
          {t('autoSave.saved')} {lastSaved.toLocaleTimeString()}
        </div>
      )}
    </div>
  );
}

export function CanvasEditor() {
  return (
    <ReactFlowProvider>
      <CanvasEditorInner />
    </ReactFlowProvider>
  );
}