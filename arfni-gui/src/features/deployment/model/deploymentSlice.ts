import { createSlice, PayloadAction } from '@reduxjs/toolkit';

export type DeploymentStatus = 'idle' | 'deploying' | 'success' | 'failed';
export type DeploymentStage = 'prepare' | 'generate' | 'build' | 'start' | 'post-process' | 'health-check';

export interface DeploymentLog {
  timestamp: string;
  level: 'info' | 'warning' | 'error' | 'success';
  message: string;
}

export interface DeploymentEndpoint {
  name: string;
  url: string;
  type: 'service' | 'health-check' | 'monitoring';
}

export interface DeploymentState {
  status: DeploymentStatus;
  currentStage: DeploymentStage | null;
  completedStages: DeploymentStage[];
  logs: DeploymentLog[];
  startTime: string | null;
  endTime: string | null;
  error: string | null;

  // 배포 결과 정보
  endpoints: DeploymentEndpoint[];
  serviceCount: number;
  containerCount: number;
  composeDir: string | null;
}

const initialState: DeploymentState = {
  status: 'idle',
  currentStage: null,
  completedStages: [],
  logs: [],
  startTime: null,
  endTime: null,
  error: null,
  endpoints: [],
  serviceCount: 0,
  containerCount: 0,
  composeDir: null,
};

const deploymentSlice = createSlice({
  name: 'deployment',
  initialState,
  reducers: {
    // 배포 시작
    startDeployment: (state) => {
      state.status = 'deploying';
      state.currentStage = 'prepare';
      state.completedStages = [];
      state.logs = [];
      state.startTime = new Date().toISOString();
      state.endTime = null;
      state.error = null;
      state.endpoints = [];
      state.serviceCount = 0;
      state.containerCount = 0;
      state.composeDir = null;
    },

    // 로그 추가
    addLog: (state, action: PayloadAction<DeploymentLog>) => {
      state.logs.push(action.payload);

      // 로그에서 단계 정보 파싱
      const message = action.payload.message;

      // "Phase 1/5" 형식 파싱
      if (message.includes('Phase 1/5')) {
        state.currentStage = 'prepare';
      } else if (message.includes('Phase 2/5')) {
        if (!state.completedStages.includes('prepare')) {
          state.completedStages.push('prepare');
        }
        state.currentStage = 'generate';
      } else if (message.includes('Phase 3/5')) {
        if (!state.completedStages.includes('generate')) {
          state.completedStages.push('generate');
        }
        state.currentStage = 'build';
      } else if (message.includes('Phase 4/5')) {
        if (!state.completedStages.includes('build')) {
          state.completedStages.push('build');
        }
        state.currentStage = 'start';
      } else if (message.includes('Phase 5/5')) {
        if (!state.completedStages.includes('start')) {
          state.completedStages.push('start');
        }
        state.currentStage = 'health-check';
      }
    },

    // 현재 단계 설정
    setCurrentStage: (state, action: PayloadAction<DeploymentStage>) => {
      state.currentStage = action.payload;
    },

    // 단계 완료 표시
    completeStage: (state, action: PayloadAction<DeploymentStage>) => {
      if (!state.completedStages.includes(action.payload)) {
        state.completedStages.push(action.payload);
      }
    },

    // 배포 성공
    deploymentSuccess: (state, action: PayloadAction<{
      endpoints?: DeploymentEndpoint[];
      serviceCount?: number;
      containerCount?: number;
      composeDir?: string | null;
    }>) => {
      state.status = 'success';
      state.currentStage = null;
      state.endTime = new Date().toISOString();

      // 모든 단계 완료 표시
      const allStages: DeploymentStage[] = ['prepare', 'generate', 'build', 'start', 'post-process', 'health-check'];
      state.completedStages = allStages;

      // 결과 정보 저장
      if (action.payload.endpoints) {
        state.endpoints = action.payload.endpoints;
      }
      if (action.payload.serviceCount !== undefined) {
        state.serviceCount = action.payload.serviceCount;
      }
      if (action.payload.containerCount !== undefined) {
        state.containerCount = action.payload.containerCount;
      }
      if (action.payload.composeDir) {
        state.composeDir = action.payload.composeDir;
      }
    },

    // 배포 실패
    deploymentFailed: (state, action: PayloadAction<string>) => {
      state.status = 'failed';
      state.currentStage = null;
      state.endTime = new Date().toISOString();
      state.error = action.payload;
    },

    // 배포 초기화
    resetDeployment: (state) => {
      return initialState;
    },

    // 로그 초기화
    clearLogs: (state) => {
      state.logs = [];
    },
  },
});

export const {
  startDeployment,
  addLog,
  setCurrentStage,
  completeStage,
  deploymentSuccess,
  deploymentFailed,
  resetDeployment,
  clearLogs,
} = deploymentSlice.actions;

export const deploymentReducer = deploymentSlice.reducer;

// Selectors
export const selectDeploymentStatus = (state: { deployment: DeploymentState }) =>
  state.deployment.status;
export const selectCurrentStage = (state: { deployment: DeploymentState }) =>
  state.deployment.currentStage;
export const selectCompletedStages = (state: { deployment: DeploymentState }) =>
  state.deployment.completedStages;
export const selectDeploymentLogs = (state: { deployment: DeploymentState }) =>
  state.deployment.logs;
export const selectDeploymentError = (state: { deployment: DeploymentState }) =>
  state.deployment.error;
export const selectDeploymentDuration = (state: { deployment: DeploymentState }) => {
  if (!state.deployment.startTime) return null;
  const endTime = state.deployment.endTime || new Date().toISOString();
  const start = new Date(state.deployment.startTime).getTime();
  const end = new Date(endTime).getTime();
  return Math.floor((end - start) / 1000); // 초 단위
};
export const selectDeploymentEndpoints = (state: { deployment: DeploymentState }) =>
  state.deployment.endpoints;
export const selectDeploymentStats = (state: { deployment: DeploymentState }) => ({
  serviceCount: state.deployment.serviceCount,
  containerCount: state.deployment.containerCount,
  composeDir: state.deployment.composeDir,
});
