import { execFileSync } from 'node:child_process';
import { readFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function buildGo(root, run = execFileSync, builtAt = new Date().toISOString()) {
  const gui = join(root, 'arfni-gui');
  const version = JSON.parse(readFileSync(join(gui, 'package.json'), 'utf8')).version;
  const tauriVersion = JSON.parse(readFileSync(join(gui, 'src-tauri/tauri.conf.json'), 'utf8')).version;
  const cargo = readFileSync(join(gui, 'src-tauri/Cargo.toml'), 'utf8');
  const packageSection = cargo.split(/^\[package\]\s*$/m)[1]?.split(/^\[/m)[0];
  const cargoVersion = packageSection?.match(/^version\s*=\s*"([^"]+)"/m)?.[1];
  if (!/^\d+\.\d+\.\d+(?:-[\w.-]+)?(?:\+[\w.-]+)?$/.test(version) || version !== tauriVersion || version !== cargoVersion) {
    throw new Error('App versions must match in package.json, tauri.conf.json and Cargo.toml');
  }
  const gitOptions = { cwd: root, encoding: 'utf8' };
  const commit = run('git', ['rev-parse', 'HEAD'], gitOptions).trim();
  // Generated executables must not make an otherwise clean source build dirty.
  const changes = run('git', ['status', '--porcelain', '--untracked-files=normal', '--', '.',
    ':(exclude)BE/arfni/bin', ':(exclude)arfni-gui/src-tauri/resources/bin'], gitOptions).trim();
  const identity = commit + (changes ? '-dirty' : '');
  const pkg = 'github.com/arfni/arfni/internal/utils/version';
  const flags = `-X ${pkg}.Version=${version} -X ${pkg}.GitCommit=${identity} -X ${pkg}.BuildDate=${builtAt}`;
  const backend = join(root, 'BE/arfni');
  mkdirSync(join(backend, 'bin'), { recursive: true });
  for (const name of ['ic', 'arfni-go', 'arfni-monitoring']) {
    run('go', ['build', '-ldflags', flags, '-o', `bin/${name}.exe`, `./cmd/${name}`], { cwd: backend, stdio: 'inherit' });
    const actual = run(join(backend, 'bin', `${name}.exe`), ['--version'], { encoding: 'utf8', timeout: 10000 }).trim();
    if (actual !== `arfni version ${version} (commit: ${identity}, built: ${builtAt})`) {
      throw new Error(`${name} build metadata does not match the app version and source commit`);
    }
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  buildGo(resolve(dirname(fileURLToPath(import.meta.url)), '../..'));
}
