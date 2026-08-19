import { useCallback, useSyncExternalStore } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { EC2Server } from '@shared/api/tauri/commands';
import i18n from '@shared/config/i18n';
import { dropSession } from './sshDataBus';
import { createReconnectScheduler } from './reconnectScheduler';
import {
  disconnectReasonFromClose,
  MAX_RECONNECT_ATTEMPTS,
} from './reconnectPolicy';

export interface SshTab {
  tabId: string;
  server: EC2Server;
  sessionId: string | null;
  connected: boolean;
  /** Freshly opened tab, waiting to connect as soon as the terminal is ready */
  autoConnect: boolean;
  /** Notices and errors from the app, printed into the terminal buffer in grey */
  notices: string[];
  /**
   * Pty size used for the last connect.
   * An automatic reconnect cannot wait for xterm to report again, so it opens with this.
   */
  lastSize: { rows: number; cols: number } | null;
}

interface TabsState {
  tabs: SshTab[];
  activeTabId: string | null;
}

/**
 * Tab state lives at module scope.
 *
 * The ssh sessions themselves live in the SESSIONS map on the Rust side, so the
 * processes survive navigating away and back. Keeping the tab list in component state
 * would leave no way to reattach to those live sessions on return.
 */
let state: TabsState = { tabs: [], activeTabId: null };

const listeners = new Set<() => void>();

function setState(next: TabsState) {
  state = next;
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

function getSnapshot() {
  return state;
}

function patchTab(tabId: string, patch: Partial<SshTab>) {
  setState({
    ...state,
    tabs: state.tabs.map((t) => (t.tabId === tabId ? { ...t, ...patch } : t)),
  });
}

function appendNotice(tabId: string, line: string) {
  setState({
    ...state,
    tabs: state.tabs.map((t) =>
      t.tabId === tabId ? { ...t, notices: [...t.notices, line] } : t
    ),
  });
}

/**
 * Opens the session for real.
 *
 * Outside the hook on purpose: automatic reconnects have to keep running after LogPage
 * unmounts. Tied to a useCallback inside the hook, they would die on leaving the route.
 */
async function startSession(
  tabId: string,
  rows: number,
  cols: number,
  opts: { auto: boolean } = { auto: false }
) {
  const tab = state.tabs.find((t) => t.tabId === tabId);
  if (!tab || tab.sessionId) return;

  // A reconnect must open at the same size, so every attempt records the latest one.
  patchTab(tabId, { autoConnect: false, lastSize: { rows, cols } });
  try {
    const sessionId = await invoke<string>('ssh_start', {
      params: {
        host: tab.server.host,
        user: tab.server.user,
        pem_path: tab.server.pem_path,
      },
      rows,
      cols,
      // Per-server setting: wrapping the remote shell in tmux keeps work alive across drops.
      persistent: tab.server.persistent_session === true,
      // One tmux session per tab; a shared name would put two tabs on one screen.
      sessionKey: tabId,
    });

    // The tab may have closed while connecting; left alone that pty would leak.
    if (!state.tabs.some((t) => t.tabId === tabId)) {
      await invoke('ssh_close', { id: sessionId }).catch(() => {});
      return;
    }

    patchTab(tabId, { sessionId, connected: true });
    reconnectScheduler.onConnected(tabId);
    // An automatic reconnect must say so. A silent new prompt reads as if the codex or
    // vim from before the drop were still running, when the remote sshd already killed
    // it with SIGHUP the moment the link went down.
    if (opts.auto) {
      appendNotice(tabId, i18n.t('logs:terminal.reconnected'));
    }
    void invoke('update_ec2_server_last_connected', { serverId: tab.server.id }).catch(
      () => {}
    );
  } catch (err) {
    appendNotice(tabId, i18n.t('logs:terminal.connectFailed', { error: String(err) }));
    // A failed automatic reconnect continues with the next interval. A failed manual
    // connect is not retried; that call belongs to the user.
    if (opts.auto && state.tabs.some((t) => t.tabId === tabId)) {
      reconnectScheduler.onDisconnected(tabId, 'remote');
    }
  }
}

/**
 * The scheduler is module scope as well: sharing its lifetime with the tab state is
 * what revives a tab that dropped while the user was on another route.
 */
const reconnectScheduler = createReconnectScheduler({
  connect: (tabId) => {
    const tab = state.tabs.find((t) => t.tabId === tabId);
    if (!tab || tab.sessionId) return;
    // Only a tab that dropped before its first connect has no size, so use the convention.
    const { rows, cols } = tab.lastSize ?? { rows: 24, cols: 80 };
    void startSession(tabId, rows, cols, { auto: true });
  },
  onScheduled: (tabId, { attempt, delayMs }) => {
    appendNotice(
      tabId,
      i18n.t('logs:terminal.reconnectScheduled', {
        seconds: Math.round(delayMs / 1000),
        attempt,
        max: MAX_RECONNECT_ATTEMPTS,
      })
    );
  },
  onGiveUp: (tabId) => {
    appendNotice(
      tabId,
      i18n.t('logs:terminal.reconnectGaveUp', { max: MAX_RECONNECT_ATTEMPTS })
    );
  },
});

/**
 * Session close events must arrive whether or not LogPage is mounted, so this is
 * registered once at module load and never torn down.
 */
let closedListenerReady = false;
function ensureClosedListener() {
  if (closedListenerReady) return;
  closedListenerReady = true;
  void listen<{ id: string; chunk: string; clean?: boolean }>('ssh:closed', (e) => {
    const { id, clean } = e.payload;
    dropSession(id); // 버스에 남은 버퍼/소비자 정리
    const tab = state.tabs.find((t) => t.sessionId === id);
    if (!tab) return;
    setState({
      ...state,
      tabs: state.tabs.map((t) =>
        t.sessionId === id
          ? {
              ...t,
              sessionId: null,
              connected: false,
              autoConnect: false,
              notices: [
                ...t.notices,
                i18n.t(
                  clean === false
                    ? 'logs:terminal.sessionLost'
                    : 'logs:terminal.sessionClosed'
                ),
              ],
            }
          : t
      ),
    });
    // A clean exit classifies as 'user' and the policy answers stop. Reviving it would
    // reopen the shell the user just closed three seconds later.
    reconnectScheduler.onDisconnected(tab.tabId, disconnectReasonFromClose(clean));
  });
}

/**
 * Picks the tab to activate after closing one.
 *
 * Same rule as browser tabs: closing the active tab moves to the **right** neighbour,
 * or the **left** one when there is nothing on the right, and null for the last tab.
 * Closing any other tab leaves the active one alone.
 *
 * `tabs` must be the list from **before** the close.
 */
export function computeNextActiveTab(
  tabs: Pick<SshTab, 'tabId'>[],
  closingTabId: string,
  activeTabId: string | null
): string | null {
  if (activeTabId !== closingTabId) return activeTabId;

  const idx = tabs.findIndex((t) => t.tabId === closingTabId);
  if (idx === -1) return activeTabId;

  const remaining = tabs.filter((t) => t.tabId !== closingTabId);
  // In the list after removal, idx points at the original right neighbour.
  return remaining[idx]?.tabId ?? remaining[idx - 1]?.tabId ?? null;
}

/**
 * Tab label; an ordinal is only added when the same server has more than one tab.
 */
export function tabDisplayLabel(
  tabs: Pick<SshTab, 'tabId' | 'server'>[],
  tab: Pick<SshTab, 'tabId' | 'server'>
): string {
  const sameServer = tabs.filter((t) => t.server.id === tab.server.id);
  if (sameServer.length < 2) return tab.server.name;
  return `${tab.server.name} (${sameServer.findIndex((t) => t.tabId === tab.tabId) + 1})`;
}

let tabSeq = 0;
function nextTabId() {
  tabSeq += 1;
  return `tab-${Date.now()}-${tabSeq}`;
}

export function useSshTabs() {
  ensureClosedListener();
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const { tabs, activeTabId } = snapshot;

  const openTab = useCallback((server: EC2Server) => {
    const tabId = nextTabId();
    setState({
      tabs: [
        ...state.tabs,
        {
          tabId,
          server,
          sessionId: null,
          connected: false,
          autoConnect: true,
          notices: [],
          lastSize: null,
        },
      ],
      activeTabId: tabId,
    });
    return tabId;
  }, []);

  const setActiveTab = useCallback((tabId: string) => {
    setState({ ...state, activeTabId: tabId });
  }, []);

  const closeTab = useCallback(async (tabId: string) => {
    const tab = state.tabs.find((t) => t.tabId === tabId);
    const remaining = state.tabs.filter((t) => t.tabId !== tabId);
    // Cancel the schedule first, or a closed tab reopens a session and leaks its pty.
    reconnectScheduler.cancel(tabId);
    setState({
      tabs: remaining,
      activeTabId: computeNextActiveTab(state.tabs, tabId, state.activeTabId),
    });

    if (tab?.sessionId) {
      dropSession(tab.sessionId);
      await invoke('ssh_close', { id: tab.sessionId }).catch(() => {});
    }
  }, []);

  /** Only called once xterm reports real rows and cols, so the pty size starts correct. */
  const connectTab = useCallback(
    (tabId: string, rows: number, cols: number) => {
      // An explicit press makes any pending automatic reconnect pointless.
      reconnectScheduler.cancel(tabId);
      return startSession(tabId, rows, cols);
    },
    []
  );

  const disconnectTab = useCallback(async (tabId: string) => {
    const tab = state.tabs.find((t) => t.tabId === tabId);
    if (!tab?.sessionId) return;
    const sessionId = tab.sessionId;
    dropSession(sessionId);
    // The user disconnected, so nothing is revived.
    reconnectScheduler.cancel(tabId);
    // Clearing sessionId first hides this tab from the ssh:closed listener, so the
    // notice is written here instead of leaving the action looking unanswered.
    setState({
      ...state,
      tabs: state.tabs.map((t) =>
        t.tabId === tabId
          ? {
              ...t,
              sessionId: null,
              connected: false,
              notices: [...t.notices, i18n.t('logs:terminal.disconnected')],
            }
          : t
      ),
    });
    await invoke('ssh_close', { id: sessionId }).catch(() => {});
  }, []);

  const clearNotices = useCallback((tabId: string) => {
    patchTab(tabId, { notices: [] });
  }, []);

  /** Puts notices from outside any tab, such as tunnel or server loading, on the visible tab. */
  const noticeActiveTab = useCallback((line: string) => {
    if (!state.activeTabId) return;
    appendNotice(state.activeTabId, line);
  }, []);

  /** Whether any live session exists for that server, which gates the container list */
  const isServerConnected = useCallback(
    (serverId: string | undefined) =>
      !!serverId && state.tabs.some((t) => t.server.id === serverId && t.connected),
    // A new function per tabs change is what re-runs the caller's useEffect
    [tabs]
  );

  return {
    tabs,
    activeTabId,
    openTab,
    setActiveTab,
    closeTab,
    connectTab,
    disconnectTab,
    clearNotices,
    noticeActiveTab,
    isServerConnected,
  };
}
