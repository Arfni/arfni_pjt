import React, { useCallback } from 'react';
import {
  ReactFlow,
  MiniMap,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  addEdge,
  Connection,
  Edge,
  BackgroundVariant,
} from 'reactflow';
import 'reactflow/dist/style.css';

import { ServiceNode } from '@entities/service/ui/ServiceNode';
import { TargetNode } from '@entities/target/ui/TargetNode';
import { DatabaseNode } from '@entities/service/ui/DatabaseNode';
import {
  CustomNode,
  createServiceNode,
  createTargetNode,
  createDatabaseNode
} from '@shared/config/nodeTypes';

// 노드 타입 등록
const nodeTypes = {
  service: ServiceNode,
  target: TargetNode,
  database: DatabaseNode,
};

const initialNodes: CustomNode[] = [
  createServiceNode(
    {
      name: 'API Service',
      image: 'nginx:latest',
      ports: ['8080:80'],
      target: 'local',
    },
    { x: 250, y: 250 }
  ),
  createTargetNode(
    {
      name: 'Local Docker',
      type: 'docker-desktop',
    },
    { x: 100, y: 100 }
  ),
  createDatabaseNode(
    {
      name: 'PostgreSQL',
      type: 'postgres',
      version: '15',
      ports: ['5432:5432'],
    },
    { x: 400, y: 100 }
  ),
];

const initialEdges: Edge[] = [];

export function CanvasEditor() {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  const onConnect = useCallback((params: Edge | Connection) => {
    setEdges((eds) => addEdge(params, eds));
  }, [setEdges]);

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();

      const type = event.dataTransfer.getData('application/reactflow');
      if (typeof type === 'undefined' || !type) {
        return;
      }

      const position = {
        x: event.clientX - 200,
        y: event.clientY - 100,
      };

      let newNode: CustomNode;

      switch (type) {
        case 'service':
          newNode = createServiceNode({}, position);
          break;
        case 'target':
          newNode = createTargetNode({}, position);
          break;
        case 'database':
          newNode = createDatabaseNode({}, position);
          break;
        default:
          return;
      }

      setNodes((nds) => nds.concat(newNode));
    },
    [setNodes]
  );

  return (
    <div className="h-full w-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onDrop={onDrop}
        onDragOver={onDragOver}
        nodeTypes={nodeTypes}
        fitView
      >
        <Controls />
        <MiniMap />
        <Background variant={BackgroundVariant.Dots} gap={12} size={1} />
      </ReactFlow>
    </div>
  );
}