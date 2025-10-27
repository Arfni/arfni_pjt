import { createSlice, PayloadAction, createAsyncThunk } from '@reduxjs/toolkit';
import {
  projectCommands,
  fileWatcherCommands,
  Project,
  StackYamlData
} from '@shared/api/tauri/commands';
import { loadCanvasState } from '@features/canvas/model/canvasSlice';

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
      params.description
    );

    // 최근 프로젝트에 추가
    await projectCommands.addToRecentProjects(project);

    // 파일 감시 시작
    await fileWatcherCommands.watchStackYaml(project.path);

    return project;
  }
);

export const openProject = createAsyncThunk(
  'project/open',
  async (path: string, { dispatch }) => {
    const project = await projectCommands.openProject(path);

    // Canvas 상태 복원
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

    // 최근 프로젝트에 추가
    await projectCommands.addToRecentProjects(project);

    // 파일 감시 시작
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