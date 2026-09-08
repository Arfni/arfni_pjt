import { invoke } from '@tauri-apps/api/core';

/**
 * 원격 Docker 조작.
 *
 * 예전에는 프론트가 `docker start ${containerId}` 문자열을 만들어 `ssh_exec_system`에 넘겼다.
 * 그 문자열은 원격 셸이 그대로 해석하므로 id에 셸 메타문자가 섞이면 임의 명령 실행이 된다.
 * 이제 동작은 열거값으로, 대상은 백엔드에서 검증한 뒤에만 실행된다.
 */

export type DockerAction = 'start' | 'stop' | 'restart' | 'remove';

export interface RemoteDockerTarget {
  host: string;
  user: string;
  pem_path: string;
}

function toParams(t: RemoteDockerTarget) {
  return { host: t.host, user: t.user, pem_path: t.pem_path };
}

export const dockerCommands = {
  containerAction: (target: RemoteDockerTarget, action: DockerAction, containerRef: string) =>
    invoke<string>('docker_container_action', {
      params: toParams(target),
      action,
      containerRef,
    }),

  allContainers: (target: RemoteDockerTarget, start: boolean) =>
    invoke<string>('docker_all_containers', { params: toParams(target), start }),

  ps: (target: RemoteDockerTarget) => invoke<string>('docker_ps', { params: toParams(target) }),
};
