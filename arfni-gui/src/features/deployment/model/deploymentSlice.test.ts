import { describe, expect, it } from 'vitest';
import { deploymentReducer, startDeployment, addLog, deploymentSuccess, deploymentFailed, setContainers, clearLogs, updateContainerStatus } from './deploymentSlice';

describe('monitoring verification after deployment', () => {
  it.each(['unverified', 'failed'])('preserves %s monitoring warning after success and log clearing', (verification) => {
    let state = deploymentReducer(undefined, startDeployment());
    state = deploymentReducer(state, addLog({ timestamp: '', level: 'warning', message: 'localized reason', data: { monitoring_verification: verification } }));
    state = deploymentReducer(state, deploymentSuccess({}));
    state = deploymentReducer(state, clearLogs());
    expect(state.status).toBe('success');
    expect(state.monitoringWarning).toBe(true);
    expect(deploymentReducer(state, startDeployment()).monitoringWarning).toBe(false);
  });

  it('does not derive monitoring warnings from English log messages', () => {
    const state = deploymentReducer(undefined, addLog({ timestamp: '', level: 'warning', message: 'monitoring verification failed' }));
    expect(state.monitoringWarning).toBe(false);
  });

  it('keeps services without public endpoints successful when deployment succeeds', () => {
    let state = deploymentReducer(undefined, setContainers([{ name: 'db', status: 'pending' }]));
    state = deploymentReducer(state, deploymentSuccess({ endpoints: [] }));
    expect(state.containers[0].status).toBe('success');
    state = deploymentReducer(state, deploymentFailed('compose failed'));
    expect(state.status).toBe('failed');
    expect(state.containers[0].status).toBe('failed');
  });

  it('preserves explicit container failure despite successful command completion', () => {
    let state = deploymentReducer(undefined, setContainers([{ name: 'db', status: 'pending' }]));
    state = deploymentReducer(state, updateContainerStatus({ name: 'db', status: 'failed' }));
    state = deploymentReducer(state, deploymentSuccess({ endpoints: [] }));
    expect(state.containers[0].status).toBe('failed');
  });

  it('clears the warning when a later verification succeeds', () => {
    let state = deploymentReducer(undefined, addLog({ timestamp: '', level: 'warning', message: '', data: { monitoring_verification: 'unverified' } }));
    state = deploymentReducer(state, addLog({ timestamp: '', level: 'success', message: '', data: { monitoring_verification: 'verified' } }));
    expect(state.monitoringWarning).toBe(false);
  });
});
