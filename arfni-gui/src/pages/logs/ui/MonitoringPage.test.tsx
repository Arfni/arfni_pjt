import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import MonitoringPage from './MonitoringPage';

const { invoke, navigate, location, t } = vi.hoisted(() => ({
  invoke: vi.fn(), navigate: vi.fn(),
  location: { state: { project: { path: 'C:/projects/example' } } },
  t: (key: string) => key,
}));
vi.mock('@tauri-apps/api/core', () => ({ invoke }));
vi.mock('@tauri-apps/plugin-opener', () => ({ openUrl: vi.fn() }));
vi.mock('react-router-dom', () => ({ useNavigate: () => navigate, useLocation: () => location }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t }) }));

const config = {
  mode: 'local', prometheus_url: 'http://localhost:9090', prometheus_port: 9090,
  grafana_url: 'http://localhost:3200', grafana_port: 3200, dashboard_uid: 'node-exporter',
};
let view: ReactTestRenderer;
let mode: string;
let healthy: boolean;

beforeEach(() => {
  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
  vi.useFakeTimers();
  invoke.mockReset();
  navigate.mockReset();
  mode = 'local';
  healthy = true;
  invoke.mockImplementation(async (command: string) => {
    if (command === 'get_monitoring_config') return { ...config, mode };
    if (command === 'check_monitoring_running') return healthy;
    return 'ready';
  });
});
afterEach(async () => {
  if (view) await act(async () => view.unmount());
  vi.useRealTimers();
});
async function mount() {
  await act(async () => { view = create(<MonitoringPage />); });
}

describe('monitoring startup', () => {
  it('shows an already healthy Grafana instead of staying on the loading screen', async () => {
    await mount();
    expect(view.root.findAllByType('iframe')).toHaveLength(1);
    expect(invoke.mock.calls.some(([cmd]) => cmd === 'start_monitoring_stack')).toBe(false);
  });

  it('ensures project-owned remote tunnels even when localhost already answers', async () => {
    mode = 'all-in-one';
    await mount();
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(invoke).toHaveBeenCalledWith('start_monitoring_stack', { projectPath: 'C:/projects/example' });
    expect(view.root.findAllByType('iframe')).toHaveLength(1);
  });

  it('keeps the timeout visible and does not display an unready iframe', async () => {
    healthy = false;
    await mount();
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    expect(view.root.findAllByType('iframe')).toHaveLength(0);
    expect(JSON.stringify(view.toJSON())).toContain('monitoring.timeoutError');
  });

  it('retries on the same page after a transient startup failure', async () => {
    mode = 'all-in-one';
    invoke.mockImplementationOnce(async () => ({ ...config, mode }));
    invoke.mockImplementationOnce(async () => { throw new Error('SSH temporarily unavailable'); });
    await mount();
    const retry = view.root.findAllByType('button').find(button => button.children.includes('monitoring.retry'));
    expect(retry).toBeDefined();
    await act(async () => { retry!.props.onClick(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(view.root.findAllByType('iframe')).toHaveLength(1);
  });

  it('does not start monitoring if the page unmounts while reading its config', async () => {
    let resolveConfig!: (value: typeof config) => void;
    invoke.mockImplementationOnce(() => new Promise(resolve => { resolveConfig = resolve; }));
    await mount();
    await act(async () => view.unmount());
    await act(async () => { resolveConfig(config); });
    expect(invoke.mock.calls.map(([command]) => command)).toEqual(['get_monitoring_config']);
  });

  it('stops only the current project when leaving the dashboard', async () => {
    await mount();
    await act(async () => { await view.root.findAllByType('button')[0].props.onClick(); });
    expect(invoke).toHaveBeenCalledWith('stop_monitoring_stack', { projectPath: 'C:/projects/example' });
    expect(navigate).toHaveBeenCalledWith('/logs', expect.anything());
  });

  it('waits for a pending start before stopping so it cannot reopen ports after leaving', async () => {
    mode = 'all-in-one';
    let finishStart!: (value: string) => void;
    invoke.mockImplementationOnce(async () => ({ ...config, mode }));
    invoke.mockImplementationOnce(() => new Promise(resolve => { finishStart = resolve; }));
    await mount();
    let leaving!: Promise<void>;
    await act(async () => { leaving = view.root.findAllByType('button')[0].props.onClick(); });
    expect(invoke.mock.calls.some(([command]) => command === 'stop_monitoring_stack')).toBe(false);
    await act(async () => { finishStart('ready'); await leaving; });
    expect(invoke.mock.calls.map(([command]) => command)).toEqual([
      'get_monitoring_config', 'start_monitoring_stack', 'stop_monitoring_stack',
    ]);
  });
});
