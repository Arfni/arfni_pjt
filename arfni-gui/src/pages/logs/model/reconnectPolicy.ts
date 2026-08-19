/**
 * Automatic reconnect policy.
 *
 * Kept as pure functions: buried among timers and IPC, "how long until the next retry
 * and how many of them" has no way of being verified.
 */

/** Delay before the first retry */
export const RECONNECT_BASE_MS = 3_000;

/** Ceiling on the exponential growth; without it the gaps reach minutes and look dead. */
export const RECONNECT_MAX_MS = 60_000;

/** Give up past this count rather than hammering a dead server forever. */
export const MAX_RECONNECT_ATTEMPTS = 6;

/** Why the session ended; this is what decides whether to retry. */
export type DisconnectReason =
  /** The remote hung up or the network died */
  | 'remote'
  /** The user pressed Disconnect */
  | 'user'
  /** The tab was closed */
  | 'tab-closed';

/**
 * Maps an `ssh:closed` event onto a reason the reconnect logic can act on.
 *
 * A pty EOF cannot tell "the user typed exit" from "the link dropped and ssh died":
 * both look identical. So Rust inspects the ssh exit code and ships `clean` along with
 * the event (SshClosedEvent in `ssh_rt.rs`).
 *
 * Without `clean` the decision leans towards not reviving: reopening a session nobody
 * asked for is worse than leaving it closed.
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
 * Delay before the nth retry, with `attempt` counted from one.
 * An off-by-one at the call site must not turn into an immediate 0ms retry storm, so
 * anything below one falls back to the first interval.
 */
export function nextRetryDelay(attempt: number): number {
  const n = Math.max(1, Math.floor(attempt));
  const raw = RECONNECT_BASE_MS * 2 ** (n - 1);
  return Math.min(raw, RECONNECT_MAX_MS);
}

/**
 * Picks the next action from the disconnect reason and the failures so far.
 * `previousAttempts` counts retries that already failed, reset to zero on success.
 */
export function planReconnect(
  reason: DisconnectReason,
  previousAttempts: number
): ReconnectPlan {
  // Never revive after a deliberate disconnect or a tab that is gone.
  if (reason !== 'remote') {
    return { action: 'stop' };
  }

  const attempt = Math.max(0, Math.floor(previousAttempts)) + 1;
  if (attempt > MAX_RECONNECT_ATTEMPTS) {
    return { action: 'give-up', attempt: MAX_RECONNECT_ATTEMPTS };
  }

  return { action: 'retry', attempt, delayMs: nextRetryDelay(attempt) };
}
