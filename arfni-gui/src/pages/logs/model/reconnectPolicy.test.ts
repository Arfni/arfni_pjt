import { describe, expect, it } from 'vitest';
import {
  MAX_RECONNECT_ATTEMPTS,
  RECONNECT_BASE_MS,
  RECONNECT_MAX_MS,
  disconnectReasonFromClose,
  nextRetryDelay,
  planReconnect,
} from './reconnectPolicy';

describe('disconnectReasonFromClose', () => {
  it('연결이 끊겨 죽은 세션만 재접속 대상으로 본다', () => {
    expect(disconnectReasonFromClose(false)).toBe('remote');
    expect(planReconnect(disconnectReasonFromClose(false), 0).action).toBe('retry');
  });

  it('원격 셸에서 exit 한 정상 종료는 되살리지 않는다', () => {
    // Reading this as remote reopens the shell the user just exited, three seconds later
    expect(disconnectReasonFromClose(true)).toBe('user');
    expect(planReconnect(disconnectReasonFromClose(true), 0)).toEqual({ action: 'stop' });
  });

  it('백엔드가 사유를 안 주면 되살리지 않는 쪽을 고른다', () => {
    expect(disconnectReasonFromClose(undefined)).toBe('user');
  });
});

describe('nextRetryDelay', () => {
  it('3초에서 시작해 매번 2배로 늘린다', () => {
    expect(nextRetryDelay(1)).toBe(3_000);
    expect(nextRetryDelay(2)).toBe(6_000);
    expect(nextRetryDelay(3)).toBe(12_000);
    expect(nextRetryDelay(4)).toBe(24_000);
    expect(nextRetryDelay(5)).toBe(48_000);
  });

  it('60초에서 상한을 건다', () => {
    // Without a ceiling this grows to 96s then 192s and retries look stopped
    expect(nextRetryDelay(6)).toBe(60_000);
    expect(nextRetryDelay(7)).toBe(60_000);
    expect(nextRetryDelay(100)).toBe(60_000);
  });

  it('상수와 실제 계산이 어긋나지 않는다', () => {
    expect(nextRetryDelay(1)).toBe(RECONNECT_BASE_MS);
    expect(nextRetryDelay(100)).toBe(RECONNECT_MAX_MS);
  });

  it('0회차 이하는 첫 간격으로 취급한다', () => {
    // An off-by-one passing zero must not collapse into an immediate 0ms retry storm
    expect(nextRetryDelay(0)).toBe(RECONNECT_BASE_MS);
    expect(nextRetryDelay(-1)).toBe(RECONNECT_BASE_MS);
  });
});

describe('planReconnect', () => {
  it('원격에서 끊기면 재시도를 예약한다', () => {
    expect(planReconnect('remote', 0)).toEqual({
      action: 'retry',
      attempt: 1,
      delayMs: 3_000,
    });
  });

  it('실패가 쌓이면 간격이 늘어난다', () => {
    expect(planReconnect('remote', 1)).toEqual({ action: 'retry', attempt: 2, delayMs: 6_000 });
    expect(planReconnect('remote', 2)).toEqual({ action: 'retry', attempt: 3, delayMs: 12_000 });
  });

  it('사용자가 직접 끊으면 재시도하지 않는다', () => {
    // Reconnecting what the user pressed to disconnect takes their control away
    expect(planReconnect('user', 0)).toEqual({ action: 'stop' });
    expect(planReconnect('user', 3)).toEqual({ action: 'stop' });
  });

  it('탭을 닫으면 재시도하지 않는다', () => {
    expect(planReconnect('tab-closed', 0)).toEqual({ action: 'stop' });
    expect(planReconnect('tab-closed', 5)).toEqual({ action: 'stop' });
  });

  it('마지막 시도까지는 재시도한다', () => {
    const plan = planReconnect('remote', MAX_RECONNECT_ATTEMPTS - 1);
    expect(plan.action).toBe('retry');
    expect(plan).toMatchObject({ attempt: MAX_RECONNECT_ATTEMPTS });
  });

  it('한도를 넘기면 포기한다', () => {
    // Endless retries keep hammering a dead server and only fill the log
    expect(planReconnect('remote', MAX_RECONNECT_ATTEMPTS)).toEqual({
      action: 'give-up',
      attempt: MAX_RECONNECT_ATTEMPTS,
    });
    expect(planReconnect('remote', MAX_RECONNECT_ATTEMPTS + 10).action).toBe('give-up');
  });

  it('포기 시점에도 마지막 간격은 상한을 넘지 않는다', () => {
    for (let a = 0; a <= MAX_RECONNECT_ATTEMPTS; a += 1) {
      const plan = planReconnect('remote', a);
      if (plan.action === 'retry') {
        expect(plan.delayMs).toBeLessThanOrEqual(RECONNECT_MAX_MS);
        expect(plan.delayMs).toBeGreaterThanOrEqual(RECONNECT_BASE_MS);
      }
    }
  });

  it('성공 후 0으로 초기화되면 다시 첫 간격부터 시작한다', () => {
    // Resetting the counter on success is what keeps the next failure from waiting 60s
    expect(planReconnect('remote', 0)).toEqual({
      action: 'retry',
      attempt: 1,
      delayMs: RECONNECT_BASE_MS,
    });
  });
});
