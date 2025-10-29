import { configureStore } from '@reduxjs/toolkit';
import { canvasReducer } from '@features/canvas/model/canvasSlice';
import { projectReducer } from '@features/project/model/projectSlice';
import { deploymentReducer } from '@features/deployment/model/deploymentSlice';

export const store = configureStore({
  reducer: {
    canvas: canvasReducer,
    project: projectReducer,
    deployment: deploymentReducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        // ReactFlow 노드와 엣지는 직렬화 체크 제외
        ignoredActions: ['canvas/setNodes', 'canvas/setEdges', 'canvas/updateNode'],
        ignoredPaths: ['canvas.nodes', 'canvas.edges'],
      },
    }),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;