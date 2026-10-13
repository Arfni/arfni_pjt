import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { afterEach, expect, it, vi } from 'vitest';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { deploymentReducer, startDeployment } from '@features/deployment/model/deploymentSlice';
import { DeploymentPage } from './DeploymentPage';

const { navigate, callbacks, deployStack, project } = vi.hoisted(() => ({
  navigate: vi.fn(), callbacks: {} as Record<string, (payload: any) => void>, deployStack: vi.fn(),
  project: { id: 'example', name: 'Example', path: 'C:/example', environment: 'local' },
}));
vi.mock('react-router-dom', () => ({ useNavigate: () => navigate }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@features/project/model/projectSlice', () => ({ selectCurrentProject: () => project }));
vi.mock('@shared/api/tauri/commands', () => ({
  eventListeners: Object.fromEntries(['onDeploymentLog', 'onDeploymentCompleted', 'onDeploymentFailed', 'onDeploymentStopped'].map(name => [name, (callback: (payload: any) => void) => { callbacks[name] = callback; return Promise.resolve(() => {}); }])),
  projectCommands: { readStackYaml: async () => 'services: {}' }, ec2ServerCommands: {}, deploymentCommands: { deployStack },
}));
vi.mock('./SuccessModal', () => ({ SuccessModal: ({ isOpen, onClose }: any) => isOpen ? <button onClick={onClose}>close success</button> : null }));
vi.mock('./FailedModal', () => ({ FailedModal: () => null }));
vi.mock('./AIAnalysisModal', () => ({ AIAnalysisModal: () => null }));

let view: ReactTestRenderer;
afterEach(async () => { if (view) await act(async () => view.unmount()); });

it('keeps the monitoring warning after success closes and opens monitoring without redeploying', async () => {
  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
  const store = configureStore({ reducer: { deployment: deploymentReducer } });
  store.dispatch(startDeployment());
  await act(async () => { view = create(<Provider store={store}><DeploymentPage /></Provider>); });
  await act(async () => {
    callbacks.onDeploymentLog({ timestamp: '', level: 'warning', message: 'reason', data: { monitoring_verification: 'unverified' } });
    callbacks.onDeploymentCompleted({ outputs: {} });
  });
  await act(async () => { view.root.findAllByType('button').find(button => button.children.includes('close success'))!.props.onClick(); });
  expect(view.root.findByProps({ role: 'alert' }).findAllByType('p')[0].children).toContain('monitoringWarning.title');
  const retry = view.root.findAllByType('button').find(button => button.children.includes('monitoringWarning.open'));
  expect(retry).toBeDefined();
  await act(async () => retry!.props.onClick());
  expect(navigate).toHaveBeenCalledWith('/monitoring', { state: { project, ec2Server: null } });
  expect(deployStack).not.toHaveBeenCalled();
});
