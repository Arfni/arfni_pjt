/**
 * Per-tab reconnect scheduler.
 *
 * `reconnectPolicy` decides "after how long, how many times" and this file turns that
 * decision into real timers and per-tab state. Splitting policy from timers is what
 * lets this file be verified with fake timers alone.
 */

import {
  planReconnect,
  MAX_RECONNECT_ATTEMPTS,
  type DisconnectReason,
} from './reconnectPolicy';

/** Handed over when a retry is scheduled */
export type ReconnectSchedule = {
  /** Which retry this is, counted from one */
  attempt: number;
  /** How many ms from now the attempt runs */
  delayMs: number;
};

export type ReconnectSchedulerOptions = {
  /** The reconnect itself, called at the scheduled time */
  connect: (tabId: string) => void;
  /** Gave up past the limit; fires once per tab */
  onGiveUp?: (tabId: string) => void;
  /** Right after scheduling, so a countdown can be drawn */
  onScheduled?: (tabId: string, schedule: ReconnectSchedule) => void;
};

export type ReconnectScheduler = {
  /** The session ended; schedules or ignores depending on the reason */
  onDisconnected: (tabId: string, reason: DisconnectReason) => void;
  /** Connected; clears a pending schedule and resets the failure count */
  onConnected: (tabId: string) => void;
  /** Forget this tab, on close or a user disconnect */
  cancel: (tabId: string) => void;
  /** Forget everything, for shutdown or an account switch */
  cancelAll: () => void;
};

type TabState = {
  /** Reconnects actually attempted */
  attempts: number;
  /** Pending timer; while it exists no second schedule is made */
  timer: ReturnType<typeof setTimeout> | null;
  /** Whether giving up was already reported, so it is not repeated on every drop */
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

      // No revival after a user disconnect or a closed tab, and drop any pending
      // schedule as well, or the tab reconnects by itself after being closed.
      const plan = planReconnect(reason, state.attempts);
      if (plan.action === 'stop') {
        forget(tabId);
        return;
      }

      // A duplicate event must not leave a second timer behind.
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
