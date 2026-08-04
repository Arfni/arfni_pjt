import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createReconnectScheduler } from './reconnectScheduler';
import { MAX_RECONNECT_ATTEMPTS } from './reconnectPolicy';

describe('createReconnectScheduler', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('원격 종료 후 3초가 지나야 재접속을 시도한다', () => {
    const connect = vi.fn();
    const s = createReconnectScheduler({ connect });

    s.onDisconnected('t1', 'remote');
    expect(connect).not.toHaveBeenCalled();

    vi.advanceTimersByTime(2_999);
    expect(connect).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(connect).toHaveBeenCalledExactlyOnceWith('t1');
  });

  it('연달아 실패하면 간격이 늘어난다', () => {
    const connect = vi.fn();
    const s = createReconnectScheduler({ connect });

    s.onDisconnected('t1', 'remote');
    vi.advanceTimersByTime(3_000);
    expect(connect).toHaveBeenCalledTimes(1);

    // 재시도가 또 끊겼다
    s.onDisconnected('t1', 'remote');
    vi.advanceTimersByTime(3_000);
    expect(connect).toHaveBeenCalledTimes(1); // 아직 6초가 안 됨
    vi.advanceTimersByTime(3_000);
    expect(connect).toHaveBeenCalledTimes(2);
  });

  it('사용자가 직접 끊으면 예약하지 않는다', () => {
    const connect = vi.fn();
    const s = createReconnectScheduler({ connect });

    s.onDisconnected('t1', 'user');
    vi.advanceTimersByTime(600_000);
    expect(connect).not.toHaveBeenCalled();
  });

  it('접속에 성공하면 간격이 초기화된다', () => {
    const connect = vi.fn();
    const s = createReconnectScheduler({ connect });

    s.onDisconnected('t1', 'remote');
    vi.advanceTimersByTime(3_000);
    s.onDisconnected('t1', 'remote');
    vi.advanceTimersByTime(6_000);
    expect(connect).toHaveBeenCalledTimes(2);

    s.onConnected('t1');

    // 리셋됐으니 다시 3초
    s.onDisconnected('t1', 'remote');
    vi.advanceTimersByTime(3_000);
    expect(connect).toHaveBeenCalledTimes(3);
  });

  it('대기 중에 탭을 닫으면 예약이 취소된다', () => {
    // 취소를 안 하면 닫힌 탭에 세션이 다시 열려 아무도 안 닫는 PTY가 남는다
    const connect = vi.fn();
    const s = createReconnectScheduler({ connect });

    s.onDisconnected('t1', 'remote');
    s.cancel('t1');
    vi.advanceTimersByTime(600_000);
    expect(connect).not.toHaveBeenCalled();
  });

  it('대기 중에 사용자가 직접 연결하면 예약이 취소된다', () => {
    const connect = vi.fn();
    const s = createReconnectScheduler({ connect });

    s.onDisconnected('t1', 'remote');
    s.onConnected('t1');
    vi.advanceTimersByTime(600_000);
    expect(connect).not.toHaveBeenCalled();
  });

  it('탭마다 독립적으로 예약된다', () => {
    const connect = vi.fn();
    const s = createReconnectScheduler({ connect });

    s.onDisconnected('t1', 'remote');
    s.onDisconnected('t2', 'remote');
    s.cancel('t1');

    vi.advanceTimersByTime(3_000);
    expect(connect).toHaveBeenCalledExactlyOnceWith('t2');
  });

  it('중복 예약을 만들지 않는다', () => {
    // 같은 세션에 대해 이벤트가 두 번 오더라도 타이머는 하나여야 한다
    const connect = vi.fn();
    const s = createReconnectScheduler({ connect });

    s.onDisconnected('t1', 'remote');
    s.onDisconnected('t1', 'remote');
    vi.advanceTimersByTime(600_000);
    expect(connect).toHaveBeenCalledTimes(1);
  });

  it('한도를 넘기면 포기하고 알린다', () => {
    const connect = vi.fn();
    const onGiveUp = vi.fn();
    const s = createReconnectScheduler({ connect, onGiveUp });

    for (let i = 0; i < MAX_RECONNECT_ATTEMPTS; i += 1) {
      s.onDisconnected('t1', 'remote');
      vi.advanceTimersByTime(60_000);
    }
    expect(connect).toHaveBeenCalledTimes(MAX_RECONNECT_ATTEMPTS);
    expect(onGiveUp).not.toHaveBeenCalled();

    s.onDisconnected('t1', 'remote');
    vi.advanceTimersByTime(600_000);
    expect(connect).toHaveBeenCalledTimes(MAX_RECONNECT_ATTEMPTS);
    expect(onGiveUp).toHaveBeenCalledExactlyOnceWith('t1');
  });

  it('재시도 예정을 알려준다', () => {
    const onScheduled = vi.fn();
    const s = createReconnectScheduler({ connect: vi.fn(), onScheduled });

    s.onDisconnected('t1', 'remote');
    expect(onScheduled).toHaveBeenCalledExactlyOnceWith('t1', { attempt: 1, delayMs: 3_000 });
  });

  it('cancelAll은 모든 예약을 지운다', () => {
    const connect = vi.fn();
    const s = createReconnectScheduler({ connect });

    s.onDisconnected('t1', 'remote');
    s.onDisconnected('t2', 'remote');
    s.cancelAll();

    vi.advanceTimersByTime(600_000);
    expect(connect).not.toHaveBeenCalled();
  });
});
