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
    // 이걸 remote로 보면 사용자가 방금 exit로 닫은 셸이 3초 뒤에 혼자 열린다
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
    // 상한이 없으면 96초, 192초로 늘어나 사실상 재시도가 멈춘 것처럼 보인다
    expect(nextRetryDelay(6)).toBe(60_000);
    expect(nextRetryDelay(7)).toBe(60_000);
    expect(nextRetryDelay(100)).toBe(60_000);
  });

  it('상수와 실제 계산이 어긋나지 않는다', () => {
    expect(nextRetryDelay(1)).toBe(RECONNECT_BASE_MS);
    expect(nextRetryDelay(100)).toBe(RECONNECT_MAX_MS);
  });

  it('0회차 이하는 첫 간격으로 취급한다', () => {
    // 호출부 오프바이원으로 0이 넘어와도 즉시 재시도(0ms)로 폭주하면 안 된다
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
    // 끊으려고 누른 걸 다시 붙이면 사용자가 통제권을 잃는다
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
    // 무한 재시도는 죽은 서버에 계속 붙으려 하며 로그만 채운다
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
    // 재접속 성공 시 카운터를 리셋해야 다음 장애에서 60초를 기다리지 않는다
    expect(planReconnect('remote', 0)).toEqual({
      action: 'retry',
      attempt: 1,
      delayMs: RECONNECT_BASE_MS,
    });
  });
});
