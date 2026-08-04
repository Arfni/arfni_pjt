/**
 * 자동 재접속 정책.
 *
 * 순수 함수로 분리한 이유: 타이머와 IPC가 얽힌 곳에 규칙을 묻어 두면
 * "몇 초 뒤에 몇 번까지 재시도하는가"를 검증할 방법이 없어진다.
 */

/** 첫 재시도까지 기다리는 시간 */
export const RECONNECT_BASE_MS = 3_000;

/** 지수 증가의 상한. 이게 없으면 몇 분씩 벌어져 사실상 멈춘 것처럼 보인다. */
export const RECONNECT_MAX_MS = 60_000;

/** 이 횟수를 넘기면 포기한다. 죽은 서버에 무한히 붙으려 하지 않는다. */
export const MAX_RECONNECT_ATTEMPTS = 6;

/** 왜 끊겼는지. 재시도 여부가 여기서 갈린다. */
export type DisconnectReason =
  /** 원격이 끊었거나 네트워크가 죽었다 */
  | 'remote'
  /** 사용자가 Disconnect를 눌렀다 */
  | 'user'
  /** 탭이 닫혔다 */
  | 'tab-closed';

/**
 * `ssh:closed` 이벤트를 재접속 판단용 사유로 옮긴다.
 *
 * PTY EOF만으로는 "사용자가 셸에서 exit 했다"와 "연결이 끊겨 ssh가 죽었다"가
 * 완전히 같은 모양이라 구분할 수 없다. 그래서 Rust가 ssh 종료 코드를 보고
 * `clean`을 실어 보낸다 (`ssh_rt.rs`의 SshClosedEvent).
 *
 * `clean`이 없으면 되살리지 않는 쪽으로 기운다.
 * 멋대로 세션을 다시 여는 것이 안 여는 것보다 나쁘다.
 */
export function disconnectReasonFromClose(
  clean: boolean | undefined
): DisconnectReason {
  return clean === false ? 'remote' : 'user';
}

export type ReconnectPlan =
  | { action: 'retry'; attempt: number; delayMs: number }
  | { action: 'give-up'; attempt: number }
  | { action: 'stop' };

/**
 * n번째 재시도까지 기다릴 시간. `attempt`는 1부터 센다.
 * 호출부 오프바이원으로 0 이하가 들어와도 즉시 재시도(0ms)로 폭주하지 않게 첫 간격을 준다.
 */
export function nextRetryDelay(attempt: number): number {
  const n = Math.max(1, Math.floor(attempt));
  const raw = RECONNECT_BASE_MS * 2 ** (n - 1);
  return Math.min(raw, RECONNECT_MAX_MS);
}

/**
 * 끊긴 이유와 지금까지의 실패 횟수로 다음 행동을 정한다.
 * `previousAttempts`는 이미 실패한 재시도 횟수(성공 시 0으로 리셋).
 */
export function planReconnect(
  reason: DisconnectReason,
  previousAttempts: number
): ReconnectPlan {
  // 사용자가 의도적으로 끊었거나 탭이 사라졌으면 되살리지 않는다.
  if (reason !== 'remote') {
    return { action: 'stop' };
  }

  const attempt = Math.max(0, Math.floor(previousAttempts)) + 1;
  if (attempt > MAX_RECONNECT_ATTEMPTS) {
    return { action: 'give-up', attempt: MAX_RECONNECT_ATTEMPTS };
  }

  return { action: 'retry', attempt, delayMs: nextRetryDelay(attempt) };
}
