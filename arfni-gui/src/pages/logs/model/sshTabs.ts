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
  /** 탭이 막 열려서 터미널이 준비되는 대로 자동 접속해야 하는 상태 */
  autoConnect: boolean;
  /** 앱이 만든 안내/오류 메시지. 터미널 버퍼에 회색으로 찍힌다. */
  notices: string[];
  /**
   * 마지막으로 접속할 때 쓴 PTY 크기.
   * 자동 재접속은 xterm이 다시 알려주기를 기다릴 수 없으므로 이 값으로 연다.
   */
  lastSize: { rows: number; cols: number } | null;
}

interface TabsState {
  tabs: SshTab[];
  activeTabId: string | null;
}

/**
 * 탭 상태를 모듈 스코프에 둔다.
 *
 * SSH 세션은 Rust 쪽 SESSIONS 맵에 살아 있으므로, 다른 라우트로 갔다 돌아와도
 * 프로세스는 그대로다. 탭 목록까지 컴포넌트 state에 두면 되돌아왔을 때
 * 살아 있는 세션에 다시 붙을 방법이 없어진다.
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
 * 세션을 실제로 연다.
 *
 * 훅 밖(모듈 스코프)에 두는 이유: 자동 재접속은 LogPage가 언마운트된 뒤에도
 * 돌아야 한다. 훅 안의 useCallback에 묶어 두면 라우트를 떠나는 순간 재접속이 죽는다.
 */
async function startSession(
  tabId: string,
  rows: number,
  cols: number,
  opts: { auto: boolean } = { auto: false }
) {
  const tab = state.tabs.find((t) => t.tabId === tabId);
  if (!tab || tab.sessionId) return;

  // 재접속도 같은 크기로 열어야 하므로 시도할 때마다 최신 크기를 남긴다.
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
      // 서버별 설정. 켜져 있으면 원격 셸이 tmux로 감싸여 끊겨도 작업이 살아남는다.
      persistent: tab.server.persistent_session === true,
      // 탭마다 다른 tmux 세션을 쓴다. 같은 이름이면 두 탭이 한 화면을 공유해 버린다.
      sessionKey: tabId,
    });

    // 접속하는 동안 탭이 닫혔을 수 있다. 그대로 두면 아무도 안 닫는 PTY가 남는다.
    if (!state.tabs.some((t) => t.tabId === tabId)) {
      await invoke('ssh_close', { id: sessionId }).catch(() => {});
      return;
    }

    patchTab(tabId, { sessionId, connected: true });
    reconnectScheduler.onConnected(tabId);
    // 자동으로 붙었으면 반드시 알린다.
    // 말없이 새 프롬프트만 띄우면 끊기기 전에 돌던 codex/vim이 아직 살아 있는 줄 안다.
    // 원격 sshd가 연결이 끊긴 시점에 SIGHUP을 보내 이미 죽였는데도.
    if (opts.auto) {
      appendNotice(tabId, i18n.t('logs:terminal.reconnected'));
    }
    void invoke('update_ec2_server_last_connected', { serverId: tab.server.id }).catch(
      () => {}
    );
  } catch (err) {
    appendNotice(tabId, i18n.t('logs:terminal.connectFailed', { error: String(err) }));
    // 자동 재접속이 실패했으면 다음 간격으로 이어 간다.
    // 수동 연결 실패까지 되살리지는 않는다. 그건 사용자가 판단할 몫이다.
    if (opts.auto && state.tabs.some((t) => t.tabId === tabId)) {
      reconnectScheduler.onDisconnected(tabId, 'remote');
    }
  }
}

/**
 * 재접속 예약기도 모듈 스코프다. 탭 상태와 수명을 같이 가야
 * 다른 라우트에 가 있는 동안 끊긴 탭도 되살아난다.
 */
const reconnectScheduler = createReconnectScheduler({
  connect: (tabId) => {
    const tab = state.tabs.find((t) => t.tabId === tabId);
    if (!tab || tab.sessionId) return;
    // 크기를 모르는 경우는 첫 접속 전에 끊긴 탭뿐이라 관례값으로 연다.
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
 * 세션 종료 이벤트는 LogPage가 마운트돼 있는지와 무관하게 도착해야 한다.
 * 모듈 로드 시 한 번만 등록하고 해제하지 않는다.
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
    // 정상 종료면 'user'로 분류돼 정책이 stop을 낸다. 되살리면 사용자가 방금
    // 닫은 셸이 3초 뒤에 혼자 다시 열린다.
    reconnectScheduler.onDisconnected(tab.tabId, disconnectReasonFromClose(clean));
  });
}

/**
 * 탭을 닫은 뒤 활성화할 탭을 고른다.
 *
 * 브라우저 탭과 같은 규칙: 활성 탭을 닫으면 **오른쪽** 이웃으로,
 * 오른쪽이 없으면 **왼쪽** 이웃으로 넘어간다. 마지막 탭이면 null.
 * 활성 탭이 아닌 탭을 닫으면 활성 탭은 그대로 둔다.
 *
 * `tabs`는 닫기 **전** 목록이어야 한다.
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
  // 삭제 후 목록에서 idx는 원래의 오른쪽 이웃을 가리킨다.
  return remaining[idx]?.tabId ?? remaining[idx - 1]?.tabId ?? null;
}

/**
 * 탭 라벨. 같은 서버로 연 탭이 둘 이상일 때만 순번을 붙여 구분한다.
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
    // 예약을 먼저 지운다. 남겨 두면 닫힌 탭에 세션이 다시 열려 주인 없는 PTY가 남는다.
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

  /** xterm이 실제 행/열을 알려준 뒤에만 호출된다. PTY 크기가 처음부터 정확해야 한다. */
  const connectTab = useCallback(
    (tabId: string, rows: number, cols: number) => {
      // 사용자가 직접 눌렀으면 대기 중인 자동 재접속은 의미가 없다.
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
    // 사용자가 끊었으니 되살리지 않는다.
    reconnectScheduler.cancel(tabId);
    // sessionId를 먼저 비우므로 ssh:closed 리스너가 이 탭을 못 찾는다.
    // 사용자가 "아무 반응 없음"으로 느끼지 않도록 여기서 직접 알린다.
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

  /** 터널/서버 로드 같은 탭 밖의 알림을 현재 보고 있는 탭에 남긴다. */
  const noticeActiveTab = useCallback((line: string) => {
    if (!state.activeTabId) return;
    appendNotice(state.activeTabId, line);
  }, []);

  /** 해당 서버로 살아 있는 세션이 하나라도 있는지 (컨테이너 목록 조회 조건) */
  const isServerConnected = useCallback(
    (serverId: string | undefined) =>
      !!serverId && state.tabs.some((t) => t.server.id === serverId && t.connected),
    // tabs가 바뀔 때마다 새 함수여야 호출부의 useEffect가 다시 돈다
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
