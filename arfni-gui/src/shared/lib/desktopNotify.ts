import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from '@tauri-apps/plugin-notification';
import { getCurrentWindow, UserAttentionType } from '@tauri-apps/api/window';

/**
 * Only a granted permission is cached. Caching a denial would keep the app silent
 * forever after the user enables notifications in the OS, until a restart.
 */
let granted = false;

async function ensurePermission(): Promise<boolean> {
  if (granted) return true;
  try {
    granted = (await isPermissionGranted()) || (await requestPermission()) === 'granted';
  } catch {
    granted = false; // no plugin host, e.g. plain browser dev
  }
  return granted;
}

/** Whether the window is in front of the user; a toast on a watched screen is noise. */
export async function isWindowFocused(): Promise<boolean> {
  if (document.hidden) return false;
  try {
    return await getCurrentWindow().isFocused();
  } catch {
    return !document.hidden;
  }
}

export interface NotifyOptions {
  title: string;
  body: string;
  /** Skip while the window has focus (default). */
  skipWhenFocused?: boolean;
  /**
   * Flash the taskbar icon. A toast disappears after a few seconds, so for a user who
   * stepped away this is the only trace left.
   */
  flashTaskbar?: boolean;
}

/**
 * Sends the notification, swallowing failures: a notification must never break the
 * terminal flow. Returns whether it was actually sent so the caller can decide on
 * in-app signals such as the tab badge separately.
 */
export async function notifyDesktop(opts: NotifyOptions): Promise<boolean> {
  if (opts.skipWhenFocused !== false && (await isWindowFocused())) return false;

  if (opts.flashTaskbar) {
    // Done first: this survives even when the toast permission is missing or fails.
    try {
      await getCurrentWindow().requestUserAttention(UserAttentionType.Informational);
    } catch {
      /* denied or unsupported platform */
    }
  }

  if (!(await ensurePermission())) return false;
  try {
    sendNotification({ title: opts.title, body: opts.body });
    return true;
  } catch {
    return false;
  }
}
