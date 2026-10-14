import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { buildGo } from './build-go.mjs';

let root;
function fixture(tauriVersion = '1.0.4') {
  root = mkdtempSync(join(tmpdir(), 'arfni-build-'));
  mkdirSync(join(root, 'arfni-gui/src-tauri'), { recursive: true });
  writeFileSync(join(root, 'arfni-gui/package.json'), JSON.stringify({ version: '1.0.4' }));
  writeFileSync(join(root, 'arfni-gui/src-tauri/tauri.conf.json'), JSON.stringify({ version: tauriVersion }));
  writeFileSync(join(root, 'arfni-gui/src-tauri/Cargo.toml'), '[package]\nversion = "1.0.4"\n');
  return vi.fn((command, args) => command === 'git' ? (args[0] === 'rev-parse' ? 'abcdef123456\n' : '')
    : command === 'go' ? undefined : 'arfni version 1.0.4 (commit: abcdef123456, built: 2026-10-14T00:00:00Z)\n');
}
afterEach(() => { if (root) rmSync(root, { recursive: true, force: true }); });

it('builds every executable with the app version and source identity without shell interpolation', () => {
  const run = fixture();
  buildGo(root, run, '2026-10-14T00:00:00Z');
  const builds = run.mock.calls.filter(([command]) => command === 'go');
  expect(builds.map(([, args]) => args.at(-1))).toEqual(['./cmd/ic', './cmd/arfni-go', './cmd/arfni-monitoring']);
  for (const [, args, options] of builds) {
    expect(args[2]).toContain('version.Version=1.0.4');
    expect(args[2]).toContain('version.GitCommit=abcdef123456');
    expect(args[2]).toContain('version.BuildDate=2026-10-14T00:00:00Z');
    expect(options.shell).not.toBe(true);
  }
});

it('rejects mismatched app versions before starting a compiler', () => {
  const run = fixture('1.0.3');
  expect(() => buildGo(root, run)).toThrow(/version/i);
  expect(run).not.toHaveBeenCalled();
});

it('rejects an executable whose embedded version does not match the requested build', () => {
  const run = fixture();
  const original = run.getMockImplementation();
  run.mockImplementation((command, args, options) => command.endsWith('.exe') ? 'arfni version dev' : original(command, args, options));
  expect(() => buildGo(root, run, '2026-10-14T00:00:00Z')).toThrow(/metadata/i);
});

it('marks uncommitted source builds and stops immediately on a failed compiler', () => {
  const run = fixture();
  run.mockImplementation((command, args) => {
    if (command === 'git') return args[0] === 'rev-parse' ? 'abcdef123456' : ' M BE/arfni/cmd/ic/main.go';
    throw new Error('compiler failed');
  });
  expect(() => buildGo(root, run)).toThrow('compiler failed');
  const builds = run.mock.calls.filter(([command]) => command === 'go');
  expect(builds).toHaveLength(1);
  expect(builds[0][1][2]).toContain('version.GitCommit=abcdef123456-dirty');
});
