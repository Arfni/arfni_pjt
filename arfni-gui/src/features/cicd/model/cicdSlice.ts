import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import type { RootState } from '@app/store';

export type CICDPlatform = 'github' | 'gitlab' | null;
export type AuthMethod = 'oauth' | 'token';

export interface CICDState {
  platform: CICDPlatform;
  authMethod: AuthMethod | null;
  isAuthenticated: boolean;
  accessToken: string | null;
  userName: string | null;
  selectedRepository: string | null;
  repositories: Repository[];
  isLoadingRepos: boolean;
  setupStep: number; // 1-5
  configuration: CICDConfiguration | null;
  isSettingUp: boolean;
  error: string | null;
}

export interface Repository {
  id: string;
  name: string;
  fullName: string;
  url: string;
  defaultBranch: string;
}

export interface CICDConfiguration {
  platform: CICDPlatform;
  repositoryUrl: string;
  branch: string;
  framework: string;
  javaVersion?: string;
  nodeVersion?: string;
  pythonVersion?: string;
  ec2Host: string;
  ec2User: string;
  deployRoot: string;
  dockerService: string;
}

export interface AuthResult {
  token: string;
  user: string;
}

const initialState: CICDState = {
  platform: null,
  authMethod: null,
  isAuthenticated: false,
  accessToken: null,
  userName: null,
  selectedRepository: null,
  repositories: [],
  isLoadingRepos: false,
  setupStep: 1,
  configuration: null,
  isSettingUp: false,
  error: null,
};

// Async thunks
export const authenticateGitHub = createAsyncThunk<AuthResult, AuthMethod>(
  'cicd/authenticateGitHub',
  async (method: AuthMethod, { rejectWithValue }) => {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const result = await invoke<AuthResult>('authenticate_github', { method });
      return result;
    } catch (error) {
      return rejectWithValue(String(error));
    }
  }
);

export const fetchRepositories = createAsyncThunk<Repository[], CICDPlatform>(
  'cicd/fetchRepositories',
  async (platform: CICDPlatform, { getState, rejectWithValue }) => {
    try {
      const state = getState() as RootState;
      const { accessToken } = state.cicd;
      if (!accessToken) throw new Error('No access token');

      const { invoke } = await import('@tauri-apps/api/core');
      const repos = await invoke<Repository[]>('fetch_github_repositories', { token: accessToken });
      return repos;
    } catch (error) {
      return rejectWithValue(String(error));
    }
  }
);

export const setupCICD = createAsyncThunk<
  CICDConfiguration,
  { config: CICDConfiguration; sshKey: string }
>(
  'cicd/setup',
  async ({ config, sshKey }, { getState, rejectWithValue }) => {
    try {
      const state = getState() as RootState;
      const { accessToken } = state.cicd;
      if (!accessToken) throw new Error('No access token');

      const { invoke } = await import('@tauri-apps/api/core');
      const params = {
        config: config,
        accessToken: accessToken,
        sshKey: sshKey,
      };
      console.log('[CICD] Calling setup_cicd with params:', params);
      await invoke<string>('setup_cicd', params);
      return config;
    } catch (error) {
      return rejectWithValue(String(error));
    }
  }
);

export const updateWorkflowFile = createAsyncThunk<
  CICDConfiguration,
  { config: CICDConfiguration }
>(
  'cicd/updateWorkflow',
  async ({ config }, { getState, rejectWithValue }) => {
    try {
      const state = getState() as RootState;
      const { accessToken } = state.cicd;
      if (!accessToken) throw new Error('No access token');

      const { invoke } = await import('@tauri-apps/api/core');
      const params = {
        config: config,
        accessToken: accessToken,
      };
      console.log('[CICD] Calling update_workflow_file with params:', params);
      await invoke<string>('update_workflow_file', params);
      return config;
    } catch (error) {
      return rejectWithValue(String(error));
    }
  }
);

export const setupCompleteCICD = createAsyncThunk<
  CICDConfiguration,
  { config: CICDConfiguration; sshKey: string; projectId: string; ec2ServerId: string }
>(
  'cicd/setupComplete',
  async ({ config, sshKey, projectId, ec2ServerId }, { getState, rejectWithValue }) => {
    try {
      const state = getState() as RootState;
      const { accessToken } = state.cicd;
      if (!accessToken) throw new Error('No access token');

      const { invoke } = await import('@tauri-apps/api/core');
      const params = {
        config: config,
        sshKey: sshKey,
        projectId: projectId,
        ec2ServerId: ec2ServerId,
        accessToken: accessToken,
      };
      console.log('[CICD] Starting complete CI/CD setup with params:', params);
      console.log('[CICD] Project ID:', projectId, 'EC2 Server ID:', ec2ServerId);

      await invoke<string>('setup_complete_cicd', params);

      console.log('[CICD] ✅ Complete CI/CD setup finished successfully');
      return config;
    } catch (error) {
      console.error('[CICD] Complete setup failed:', error);
      return rejectWithValue(String(error));
    }
  }
);

const cicdSlice = createSlice({
  name: 'cicd',
  initialState,
  reducers: {
    setPlatform: (state, action: PayloadAction<CICDPlatform>) => {
      state.platform = action.payload;
      state.setupStep = 2;
      state.error = null;
    },
    setAuthMethod: (state, action: PayloadAction<AuthMethod>) => {
      state.authMethod = action.payload;
    },
    setAccessToken: (state, action: PayloadAction<string>) => {
      state.accessToken = action.payload;
      state.isAuthenticated = true;
      state.setupStep = 3;
    },
    setSelectedRepository: (state, action: PayloadAction<string>) => {
      state.selectedRepository = action.payload;
    },
    setConfiguration: (state, action: PayloadAction<Partial<CICDConfiguration>>) => {
      state.configuration = { ...state.configuration, ...action.payload } as CICDConfiguration;
    },
    nextStep: (state) => {
      if (state.setupStep < 5) {
        state.setupStep += 1;
        state.error = null;
      }
    },
    previousStep: (state) => {
      if (state.setupStep > 1) {
        state.setupStep -= 1;
        state.error = null;
      }
    },
    resetCICD: () => {
      return initialState;
    },
    clearError: (state) => {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      // Authenticate GitHub
      .addCase(authenticateGitHub.pending, (state) => {
        state.error = null;
      })
      .addCase(authenticateGitHub.fulfilled, (state, action) => {
        state.isAuthenticated = true;
        state.accessToken = action.payload.token;
        state.userName = action.payload.user;
        state.setupStep = 3;
      })
      .addCase(authenticateGitHub.rejected, (state, action) => {
        state.error = action.payload as string;
        state.isAuthenticated = false;
      })
      // Fetch repositories
      .addCase(fetchRepositories.pending, (state) => {
        state.isLoadingRepos = true;
        state.error = null;
      })
      .addCase(fetchRepositories.fulfilled, (state, action) => {
        state.repositories = action.payload;
        state.isLoadingRepos = false;
      })
      .addCase(fetchRepositories.rejected, (state, action) => {
        state.error = action.payload as string;
        state.isLoadingRepos = false;
      })
      // Setup CI/CD
      .addCase(setupCICD.pending, (state) => {
        state.isSettingUp = true;
        state.error = null;
      })
      .addCase(setupCICD.fulfilled, (state, action) => {
        state.configuration = action.payload;
        state.isSettingUp = false;
      })
      .addCase(setupCICD.rejected, (state, action) => {
        state.error = action.payload as string;
        state.isSettingUp = false;
      })
      .addCase(updateWorkflowFile.pending, (state) => {
        state.isSettingUp = true;
        state.error = null;
      })
      .addCase(updateWorkflowFile.fulfilled, (state, action) => {
        state.configuration = action.payload;
        state.isSettingUp = false;
      })
      .addCase(updateWorkflowFile.rejected, (state, action) => {
        state.error = action.payload as string;
        state.isSettingUp = false;
      })
      // setupCompleteCICD cases
      .addCase(setupCompleteCICD.pending, (state) => {
        state.isSettingUp = true;
        state.error = null;
      })
      .addCase(setupCompleteCICD.fulfilled, (state, action) => {
        state.isSettingUp = false;
        state.configuration = action.payload;
        state.setupStep = 1; // Reset to initial step
      })
      .addCase(setupCompleteCICD.rejected, (state, action) => {
        state.error = action.payload as string;
        state.isSettingUp = false;
      });
  },
});

export const {
  setPlatform,
  setAuthMethod,
  setAccessToken,
  setSelectedRepository,
  setConfiguration,
  nextStep,
  previousStep,
  resetCICD,
  clearError,
} = cicdSlice.actions;

// Selectors
export const selectCICDPlatform = (state: RootState) => state.cicd.platform;
export const selectAuthMethod = (state: RootState) => state.cicd.authMethod;
export const selectIsAuthenticated = (state: RootState) => state.cicd.isAuthenticated;
export const selectAccessToken = (state: RootState) => state.cicd.accessToken;
export const selectUserName = (state: RootState) => state.cicd.userName;
export const selectRepositories = (state: RootState) => state.cicd.repositories;
export const selectIsLoadingRepos = (state: RootState) => state.cicd.isLoadingRepos;
export const selectSelectedRepository = (state: RootState) => state.cicd.selectedRepository;
export const selectSetupStep = (state: RootState) => state.cicd.setupStep;
export const selectCICDConfiguration = (state: RootState) => state.cicd.configuration;
export const selectIsSettingUp = (state: RootState) => state.cicd.isSettingUp;
export const selectCICDError = (state: RootState) => state.cicd.error;

export default cicdSlice.reducer;
