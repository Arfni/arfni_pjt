/**
 * 탭별 재접속 예약기.
 *
 * `reconnectPolicy`가 "몇 초 뒤에, 몇 번까지"를 정하고 여기서는 그 결정을
 * 실제 타이머와 탭별 상태로 옮긴다. 정책과 타이머를 나눠 둔 덕분에
 * 이 파일은 fake timer만으로 전부 검증된다.
 */

import {
  planReconnect,
  MAX_RECONNECT_ATTEMPTS,
  type DisconnectReason,
} from './reconnectPolicy';

/** 재시도가 예약됐을 때 넘어오는 정보 */
export type ReconnectSchedule = {
  /** 몇 번째 재시도인지. 1부터 센다. */
  attempt: number;
  /** 지금부터 몇 ms 뒤에 붙는지 */
  delayMs: number;
};

export type ReconnectSchedulerOptions = {
  /** 실제 재접속. 예약된 시각에 호출된다. */
  connect: (tabId: string) => void;
  /** 한도를 넘겨 포기했을 때. 탭당 한 번만 온다. */
  onGiveUp?: (tabId: string) => void;
  /** 재시도를 예약한 즉시. 카운트다운 UI를 그리라고 알리는 용도. */
  onScheduled?: (tabId: string, schedule: ReconnectSchedule) => void;
};

export type ReconnectScheduler = {
  /** 세션이 끊겼다. 이유에 따라 예약하거나 무시한다. */
  onDisconnected: (tabId: string, reason: DisconnectReason) => void;
  /** 붙었다. 대기 중이던 예약을 지우고 실패 횟수를 리셋한다. */
  onConnected: (tabId: string) => void;
  /** 이 탭은 잊는다. 탭을 닫거나 사용자가 끊었을 때. */
  cancel: (tabId: string) => void;
  /** 전부 잊는다. 앱 종료나 계정 전환 같은 전면 정리용. */
  cancelAll: () => void;
};

type TabState = {
  /** 실제로 시도해 본 재접속 횟수 */
  attempts: number;
  /** 대기 중인 타이머. 있으면 중복 예약하지 않는다. */
  timer: ReturnType<typeof setTimeout> | null;
  /** 이미 포기를 알렸는지. 끊길 때마다 포기 알림을 반복하지 않기 위함. */
  gaveUp: boolean;
};

export function createReconnectScheduler(
  options: ReconnectSchedulerOptions
): ReconnectScheduler {
  const { connect, onGiveUp, onScheduled } = options;
  const tabs = new Map<string, TabState>();

  function stateOf(tabId: string): TabState {
    let state = tabs.get(tabId);
    if (!state) {
      state = { attempts: 0, timer: null, gaveUp: false };
      tabs.set(tabId, state);
    }
    return state;
  }

  function clearTimer(state: TabState): void {
    if (state.timer !== null) {
      clearTimeout(state.timer);
      state.timer = null;
    }
  }

  function forget(tabId: string): void {
    const state = tabs.get(tabId);
    if (!state) return;
    clearTimer(state);
    tabs.delete(tabId);
  }

  return {
    onDisconnected(tabId, reason) {
      const state = stateOf(tabId);

      // 사용자가 끊었거나 탭이 사라졌으면 되살리지 않는다.
      // 대기 중이던 예약도 같이 버린다 — 안 그러면 닫은 뒤에 혼자 다시 붙는다.
      const plan = planReconnect(reason, state.attempts);
      if (plan.action === 'stop') {
        forget(tabId);
        return;
      }

      // 이미 대기 중이면 이벤트가 두 번 와도 타이머는 하나만 남긴다.
      if (state.timer !== null) return;

      if (plan.action === 'give-up') {
        if (!state.gaveUp) {
          state.gaveUp = true;
          onGiveUp?.(tabId);
        }
        return;
      }

      const { attempt, delayMs } = plan;
      state.timer = setTimeout(() => {
        state.timer = null;
        state.attempts = attempt;
        connect(tabId);
      }, delayMs);

      onScheduled?.(tabId, { attempt, delayMs });
    },

    onConnected(tabId) {
      const state = tabs.get(tabId);
      if (!state) return;
      clearTimer(state);
      state.attempts = 0;
      state.gaveUp = false;
    },

    cancel(tabId) {
      forget(tabId);
    },

    cancelAll() {
      for (const state of tabs.values()) {
        clearTimer(state);
      }
      tabs.clear();
    },
  };
}

export { MAX_RECONNECT_ATTEMPTS };
