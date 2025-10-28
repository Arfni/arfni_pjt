import { createSlice, PayloadAction, createAsyncThunk } from '@reduxjs/toolkit';
import {
  projectCommands,
  fileWatcherCommands,
  ec2ServerCommands,
  Project,
  StackYamlData
} from '@shared/api/tauri/commands';
import { loadCanvasState, clearCanvas, addNode } from '@features/canvas/model/canvasSlice';

export interface ProjectState {
  currentProject: Project | null;
  recentProjects: Project[];
  isLoading: boolean;
  error: string | null;
  isSaving: boolean;
  lastSaved: string | null;
}

const initialState: ProjectState = {
  currentProject: null,
  recentProjects: [],
  isLoading: false,
  error: null,
  isSaving: false,
  lastSaved: null,
};

// Async Thunks
export const createProject = createAsyncThunk(
  'project/create',
  async (params: { name: string; path: string; description?: string }) => {
    const project = await projectCommands.createProject(
      params.name,
      params.path,
      'local', // 기본값: local 환경
      undefined, // ec2_server_id
      params.description
    );

    // 최근 프로젝트에 추가
    await projectCommands.addToRecentProjects(project.id);

    // 파일 감시 시작
    await fileWatcherCommands.watchStackYaml(project.path);

    return project;
  }
);

export const openProject = createAsyncThunk(
  'project/open',
  async (path: string, { dispatch }) => {
    // 1. 먼저 캔버스 초기화 (이전 프로젝트 상태 제거)
    dispatch(clearCanvas());

    const project = await projectCommands.openProjectByPath(path);

    // 2. Canvas 상태 복원
    const canvasState = await projectCommands.loadCanvasState(path);
    if (canvasState.nodes.length > 0 || canvasState.edges.length > 0) {
      // Canvas store에 상태 로드
      const nodes = canvasState.nodes.map(n => ({
        ...n,
        type: n.node_type as 'service' | 'target' | 'database',
      }));

      dispatch(loadCanvasState({
        nodes: nodes as any,
        edges: canvasState.edges,
      }));
    }

    // 2.5. EC2 프로젝트인 경우 서버 정보 로드하여 Target 노드 업데이트
    if (project.environment === 'ec2' && project.ec2_server_id) {
      try {
        const ec2Server = await ec2ServerCommands.getServerById(project.ec2_server_id);

        // Canvas에서 EC2 Target 노드 찾기
        const targetNode = canvasState.nodes.find(n => n.node_type === 'target');

        if (targetNode) {
          // 기존 Target 노드가 있으면 EC2 서버 정보로 업데이트
          const updatedNode = {
            ...targetNode,
            data: {
              ...targetNode.data,
              host: ec2Server.host,
              user: ec2Server.user,
              sshKey: ec2Server.pem_path,
              workdir: ec2Server.workdir || '/home/ubuntu',
              mode: ec2Server.mode || 'all-in-one',
            }
          };

          // 업데이트된 노드로 재로드 (이미 loadCanvasState가 호출되었으므로 개별 업데이트는 필요 없음)
          console.log('EC2 Target 노드 정보 업데이트:', updatedNode);
        } else {
          // Target 노드가 없으면 자동 생성
          const newTargetNode = {
            id: 'ec2-target-1',
            type: 'target' as const,
            position: { x: 400, y: 200 },
            data: {
              name: ec2Server.name,
              host: ec2Server.host,
              user: ec2Server.user,
              sshKey: ec2Server.pem_path,
              workdir: ec2Server.workdir || '/home/ubuntu',
              mode: ec2Server.mode || 'all-in-one',
            }
          };

          dispatch(addNode(newTargetNode));
          console.log('EC2 Target 노드 자동 생성:', newTargetNode);
        }
      } catch (error) {
        console.error('EC2 서버 정보 로드 실패:', error);
      }
    }

    // 3. 최근 프로젝트에 추가
    await projectCommands.addToRecentProjects(project.id);

    // 4. 파일 감시 시작
    await fileWatcherCommands.watchStackYaml(project.path);

    return project;
  }
);

export const saveStackYaml = createAsyncThunk(
  'project/saveStackYaml',
  async (params: {
    projectPath: string;
    yamlContent: string;
    canvasData: StackYamlData;
  }) => {
    await projectCommands.saveStackYaml(
      params.projectPath,
      params.yamlContent,
      params.canvasData
    );

    return new Date().toISOString();
  }
);

export const loadRecentProjects = createAsyncThunk(
  'project/loadRecent',
  async () => {
    return await projectCommands.getRecentProjects();
  }
);

export const closeProject = createAsyncThunk(
  'project/close',
  async (projectPath: string) => {
    // 파일 감시 중지
    await fileWatcherCommands.stopWatching(projectPath);
    return null;
  }
);

// Slice
const projectSlice = createSlice({
  name: 'project',
  initialState,
  reducers: {
    clearError: (state) => {
      state.error = null;
    },

    setCurrentProject: (state, action: PayloadAction<Project | null>) => {
      state.currentProject = action.payload;
    },
  },
  extraReducers: (builder) => {
    // Create Project
    builder
      .addCase(createProject.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(createProject.fulfilled, (state, action) => {
        state.isLoading = false;
        state.currentProject = action.payload;
        state.error = null;
      })
      .addCase(createProject.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.error.message || '프로젝트 생성 실패';
      });

    // Open Project
    builder
      .addCase(openProject.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(openProject.fulfilled, (state, action) => {
        state.isLoading = false;
        state.currentProject = action.payload;
        state.error = null;
      })
      .addCase(openProject.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.error.message || '프로젝트 열기 실패';
      });

    // Save Stack YAML
    builder
      .addCase(saveStackYaml.pending, (state) => {
        state.isSaving = true;
        state.error = null;
      })
      .addCase(saveStackYaml.fulfilled, (state, action) => {
        state.isSaving = false;
        state.lastSaved = action.payload;
        state.error = null;
      })
      .addCase(saveStackYaml.rejected, (state, action) => {
        state.isSaving = false;
        state.error = action.error.message || 'stack.yaml 저장 실패';
      });

    // Load Recent Projects
    builder
      .addCase(loadRecentProjects.fulfilled, (state, action) => {
        state.recentProjects = action.payload;
      });

    // Close Project
    builder
      .addCase(closeProject.fulfilled, (state) => {
        state.currentProject = null;
        state.lastSaved = null;
      });
  },
});

export const { clearError, setCurrentProject } = projectSlice.actions;

export const projectReducer = projectSlice.reducer;

// Selectors
export const selectCurrentProject = (state: { project: ProjectState }) =>
  state.project.currentProject;
export const selectRecentProjects = (state: { project: ProjectState }) =>
  state.project.recentProjects;
export const selectProjectLoading = (state: { project: ProjectState }) =>
  state.project.isLoading;
export const selectProjectError = (state: { project: ProjectState }) =>
  state.project.error;
export const selectIsSaving = (state: { project: ProjectState }) =>
  state.project.isSaving;
export const selectLastSaved = (state: { project: ProjectState }) =>
  state.project.lastSaved;