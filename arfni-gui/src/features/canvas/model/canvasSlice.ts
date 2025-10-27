import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { Edge, Connection, addEdge as addEdgeHelper, applyNodeChanges, applyEdgeChanges, NodeChange, EdgeChange } from 'reactflow';
import { CanvasState, CustomNode, CustomNodeData } from './types';

const initialState: CanvasState = {
  nodes: [],
  edges: [],
  selectedNodeId: null,
  selectedTemplate: null,
  isDirty: false,
};

const canvasSlice = createSlice({
  name: 'canvas',
  initialState,
  reducers: {
    // 노드 관련 액션
    setNodes: (state, action: PayloadAction<CustomNode[]>) => {
      state.nodes = action.payload;
      state.isDirty = true;
    },

    addNode: (state, action: PayloadAction<CustomNode>) => {
      state.nodes.push(action.payload);
      state.isDirty = true;
    },

    updateNode: (state, action: PayloadAction<{ id: string; data: Partial<CustomNodeData> }>) => {
      const node = state.nodes.find(n => n.id === action.payload.id);
      if (node) {
        node.data = { ...node.data, ...action.payload.data } as CustomNodeData;
        state.isDirty = true;
      }
    },

    deleteNode: (state, action: PayloadAction<string>) => {
      state.nodes = state.nodes.filter(n => n.id !== action.payload);
      state.edges = state.edges.filter(
        e => e.source !== action.payload && e.target !== action.payload
      );
      if (state.selectedNodeId === action.payload) {
        state.selectedNodeId = null;
      }
      state.isDirty = true;
    },

    onNodesChange: (state, action: PayloadAction<NodeChange[]>) => {
      state.nodes = applyNodeChanges(action.payload, state.nodes) as CustomNode[];
      state.isDirty = true;
    },

    // 엣지 관련 액션
    setEdges: (state, action: PayloadAction<Edge[]>) => {
      state.edges = action.payload;
      state.isDirty = true;
    },

    addEdge: (state, action: PayloadAction<Edge | Connection>) => {
      state.edges = addEdgeHelper(action.payload, state.edges);
      state.isDirty = true;
    },

    deleteEdge: (state, action: PayloadAction<string>) => {
      state.edges = state.edges.filter(e => e.id !== action.payload);
      state.isDirty = true;
    },

    onEdgesChange: (state, action: PayloadAction<EdgeChange[]>) => {
      state.edges = applyEdgeChanges(action.payload, state.edges);
      state.isDirty = true;
    },

    // 선택 관련 액션
    selectNode: (state, action: PayloadAction<string | null>) => {
      state.selectedNodeId = action.payload;
    },

    selectTemplate: (state, action: PayloadAction<{ type: string; category: 'service' | 'database' | 'target' } | null>) => {
      state.selectedTemplate = action.payload;
    },

    // Canvas 상태 관련
    clearCanvas: (state) => {
      state.nodes = [];
      state.edges = [];
      state.selectedNodeId = null;
      state.selectedTemplate = null;
      state.isDirty = false;
    },

    setDirty: (state, action: PayloadAction<boolean>) => {
      state.isDirty = action.payload;
    },

    // 전체 상태 로드 (프로젝트 열기 시)
    loadCanvasState: (state, action: PayloadAction<{ nodes: CustomNode[]; edges: Edge[] }>) => {
      state.nodes = action.payload.nodes;
      state.edges = action.payload.edges;
      state.selectedNodeId = null;
      state.selectedTemplate = null;
      state.isDirty = false;
    },
  },
});

export const {
  setNodes,
  addNode,
  updateNode,
  deleteNode,
  onNodesChange,
  setEdges,
  addEdge,
  deleteEdge,
  onEdgesChange,
  selectNode,
  selectTemplate,
  clearCanvas,
  setDirty,
  loadCanvasState,
} = canvasSlice.actions;

export const canvasReducer = canvasSlice.reducer;

// Selectors
export const selectNodes = (state: { canvas: CanvasState }) => state.canvas.nodes;
export const selectEdges = (state: { canvas: CanvasState }) => state.canvas.edges;
export const selectSelectedNodeId = (state: { canvas: CanvasState }) => state.canvas.selectedNodeId;
export const selectSelectedNode = (state: { canvas: CanvasState }) => {
  const { nodes, selectedNodeId } = state.canvas;
  return selectedNodeId ? nodes.find(n => n.id === selectedNodeId) : null;
};
export const selectSelectedTemplate = (state: { canvas: CanvasState }) => state.canvas.selectedTemplate;
export const selectIsDirty = (state: { canvas: CanvasState }) => state.canvas.isDirty;

// Target 노드만 선택
export const selectTargetNodes = (state: { canvas: CanvasState }) =>
  state.canvas.nodes.filter(n => n.type === 'target');

// Service와 Database 노드 선택
export const selectServiceNodes = (state: { canvas: CanvasState }) =>
  state.canvas.nodes.filter(n => n.type === 'service' || n.type === 'database');