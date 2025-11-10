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
import html2canvas from 'html2canvas';

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

// Export handle 타입 정의
export interface CanvasEditorHandle {
  captureScreenshot: () => Promise<string | null>;
}

const CanvasEditorInner = () => {
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

  // 캔버스 스크린샷 캡처 함수 (Toolbar의 방식 + 크기 조정)
  const captureScreenshot = useCallback(async (): Promise<string | null> => {
    try {
      if (!reactFlowWrapper.current) {
        console.error('ReactFlow wrapper ref is not available');
        return null;
      }

      const viewport = reactFlowWrapper.current.querySelector('.react-flow__viewport') as HTMLElement;
      if (!viewport) {
        console.error('ReactFlow viewport not found');
        return null;
      }

      // 현재 상태 저장
      const currentTransform = viewport.style.transform;
      const currentTransition = viewport.style.transition;
      const currentOpacity = reactFlowWrapper.current.style.opacity;
      const currentPointerEvents = reactFlowWrapper.current.style.pointerEvents;
      const currentWrapperWidth = reactFlowWrapper.current.style.width;
      const currentWrapperHeight = reactFlowWrapper.current.style.height;

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
      const padding = 80;

      // 캡처할 캔버스 크기 계산 (노드 범위 + padding)
      const captureWidth = nodesBoundsWidth + padding * 2;
      const captureHeight = nodesBoundsHeight + padding * 2;

      // 스케일은 1.0으로 고정
      const scale = 1.0;

      console.log('📸 Auto-save screenshot capture:', {
        nodesCount: nodeElements.length,
        bounds: { minX, minY, maxX, maxY },
        nodesBounds: { width: nodesBoundsWidth, height: nodesBoundsHeight },
        captureSize: { width: captureWidth, height: captureHeight },
        scale
      });

      const centerX = (minX + maxX) / 2;
      const centerY = (minY + maxY) / 2;
      const translateX = captureWidth / 2 - centerX * scale;
      const translateY = captureHeight / 2 - centerY * scale;

      // 1단계: 화면에서 완전히 숨기고 크기 조정
      reactFlowWrapper.current.style.opacity = '0';
      reactFlowWrapper.current.style.pointerEvents = 'none';
      reactFlowWrapper.current.style.width = `${captureWidth}px`;
      reactFlowWrapper.current.style.height = `${captureHeight}px`;

      // 다음 프레임에서 transform 적용 및 캡처
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
            reactFlowWrapper.current!.style.opacity = currentOpacity;
            reactFlowWrapper.current!.style.pointerEvents = currentPointerEvents;
            reactFlowWrapper.current!.style.width = currentWrapperWidth;
            reactFlowWrapper.current!.style.height = currentWrapperHeight;

            resolve(canvas.toDataURL('image/png'));
          });
        });
      });

      return dataUrl;
    } catch (error) {
      console.error('Failed to capture canvas screenshot:', error);
      return null;
    }
  }, []);

  // Auto-save: Canvas 변경 후 2초 뒤 자동 저장 (스크린샷 포함)
  const { isSaving, lastSaved } = useAutoSave(2000, captureScreenshot);

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
          name: nodeType === 'docker-local' ? 'Docker Local' : 'EC2',
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
};

CanvasEditorInner.displayName = 'CanvasEditorInner';

export function CanvasEditor() {
  return (
    <ReactFlowProvider>
      <CanvasEditorInner />
    </ReactFlowProvider>
  );
}