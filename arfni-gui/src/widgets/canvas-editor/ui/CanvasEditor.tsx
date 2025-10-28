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

import { ServiceNode } from '@entities/service/ui/ServiceNode';
import { TargetNode } from '@entities/target/ui/TargetNode';
import { DatabaseNode } from '@entities/service/ui/DatabaseNode';
import {
  createServiceNode,
  createTargetNode,
  createDatabaseNode
} from '@shared/config/nodeTypes';
import { useAutoSave } from '@features/canvas/hooks/useAutoSave';

// 노드 타입 등록
const nodeTypes = {
  service: ServiceNode,
  target: TargetNode,
  database: DatabaseNode,
};

function CanvasEditorInner() {
  const dispatch = useAppDispatch();
  const nodes = useAppSelector(selectNodes);
  const edges = useAppSelector(selectEdges);
  const selectedTemplate = useAppSelector(selectSelectedTemplate);
  const selectedNodeId = useAppSelector(selectSelectedNodeId);
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
          name: 'Local Docker',
          type: 'docker-desktop',
        },
        { x: 100, y: 100 }
      )));

      dispatch(addNode(createDatabaseNode(
        {
          name: 'PostgreSQL',
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

      let newNode;

      if (category === 'service') {
        // 서비스 노드
        const serviceData: any = {
          name: nodeType.toUpperCase(),
          serviceType: nodeType
        };

        switch (nodeType) {
          case 'react':
            serviceData.build = './apps/react';
            serviceData.ports = ['3000:80'];
            break;
          case 'nextjs':
            serviceData.build = './apps/nextjs';
            serviceData.ports = ['3000:3000'];
            break;
          case 'spring':
            serviceData.build = './apps/spring';
            serviceData.ports = ['8080:8080'];
            break;
          case 'nodejs':
            serviceData.build = './apps/nodejs';
            serviceData.ports = ['3000:3000'];
            break;
          case 'python':
            serviceData.build = './apps/python';
            serviceData.ports = ['8000:8000'];
            break;
          case 'fastapi':
            serviceData.build = './apps/fastapi';
            serviceData.ports = ['8000:8000'];
            break;
          default:
            serviceData.image = 'nginx:latest';
            serviceData.ports = ['80:80'];
        }

        newNode = createServiceNode(serviceData, position);
      } else if (category === 'database') {
        // 데이터베이스 노드
        const dbData: any = {
          name: nodeType.toUpperCase(),
          type: nodeType as 'mysql' | 'postgres' | 'redis' | 'mongodb'
        };

        switch (nodeType) {
          case 'mysql':
            dbData.version = '8.0';
            dbData.ports = ['3306:3306'];
            break;
          case 'postgres':
            dbData.version = '15';
            dbData.ports = ['5432:5432'];
            break;
          case 'redis':
            dbData.version = '7';
            dbData.ports = ['6379:6379'];
            break;
          case 'mongodb':
            dbData.version = '6';
            dbData.ports = ['27017:27017'];
            break;
        }

        newNode = createDatabaseNode(dbData, position);
      } else if (category === 'target') {
        // 타겟 노드
        const targetData: any = {
          name: nodeType === 'docker-local' ? 'Docker Local' : 'EC2',
          type: nodeType === 'docker-local' ? 'docker-desktop' : 'ec2.ssh'
        };

        newNode = createTargetNode(targetData, position);
      } else {
        return;
      }

      dispatch(addNode(newNode as any));
    },
    [dispatch, project]
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
          저장 중...
        </div>
      )}
      {!isSaving && lastSaved && (
        <div className="absolute top-4 right-4 bg-white border border-green-300 text-green-700 px-3 py-1.5 rounded-lg shadow-md z-10 text-sm">
          ✓ 저장됨 {lastSaved.toLocaleTimeString()}
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