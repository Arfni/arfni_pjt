import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { computeDropdownPosition, DropdownPosition } from '@shared/lib/dropdownPosition';
import { FolderTree, Network, Plus, X, Terminal as TerminalIcon, Server, Bell } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Project, EC2Server, ec2ServerCommands } from '@shared/api/tauri/commands';
import { SshTab, tabDisplayLabel } from '../model/sshTabs';
import { parseCwdFromTitle } from '../model/terminalTitle';
import { AgentDoneEvent, shouldNotifyAgentDone } from '../model/agentActivity';
import { notifyDesktop, isWindowFocused } from '@shared/lib/desktopNotify';
import { TerminalView } from './TerminalView';
import { SftpPanel } from './SftpPanel';
import { TunnelPanel } from './TunnelPanel';

interface TerminalWorkspaceProps {
  project: Project | null;
  /** 프로젝트에 연결된 기본 서버. 첫 탭을 자동으로 여는 데 쓰인다. */
  defaultServer: EC2Server | null;
  tabs: SshTab[];
  activeTabId: string | null;
  onOpenTab: (server: EC2Server) => void;
  onSelectTab: (tabId: string) => void;
  onCloseTab: (tabId: string) => void;
  onConnectTab: (tabId: string, rows: number, cols: number) => void;
  onDisconnectTab: (tabId: string) => void;
  onClearNotices: (tabId: string) => void;
  /** 언마운트 대신 숨김. 뷰를 바꿔도 세션과 스크롤백을 유지한다. */
  hidden?: boolean;
}

type SidePanel = 'sftp' | 'tunnels' | null;

const WIDTH_KEY = 'arfni.sidePanelWidth';
const PANEL_KEY = 'arfni.sidePanel';
const MIN_WIDTH = 260;
const MIN_TERMINAL_WIDTH = 320;
const PICKER_WIDTH = 256;
const PICKER_MAX_HEIGHT = 288;
/**
 * Typing into that terminal within this window counts as the user being present,
 * which is the only case where the notification is skipped.
 */
const RECENT_INPUT_MS = 15000;

export function TerminalWorkspace({
  project,
  defaultServer,
  tabs,
  activeTabId,
  onOpenTab,
  onSelectTab,
  onCloseTab,
  onConnectTab,
  onDisconnectTab,
  onClearNotices,
  hidden,
}: TerminalWorkspaceProps) {
  const { t } = useTranslation('logs');
  const isEc2 = project?.environment === 'ec2';

  const containerRef = useRef<HTMLDivElement>(null);
  const pickerRef = useRef<HTMLDivElement>(null);
  const pickerBtnRef = useRef<HTMLButtonElement>(null);

  const [sidePanel, setSidePanel] = useState<SidePanel>(() => {
    const stored = localStorage.getItem(PANEL_KEY);
    return stored === 'sftp' || stored === 'tunnels' ? stored : null;
  });
  /**
   * 탭별 원격 작업 디렉터리. SFTP 패널이 활성 탭을 따라간다.
   *
   * 탭마다 따로 들고 있어야 한다. 하나로 공유하면 A탭에서 cd 한 경로가
   * B탭 SFTP에 그대로 남는다.
   */
  const [termCwds, setTermCwds] = useState<Record<string, string | null>>({});
  const [panelWidth, setPanelWidth] = useState(() => {
    const stored = Number(localStorage.getItem(WIDTH_KEY));
    return Number.isFinite(stored) && stored >= MIN_WIDTH ? stored : 360;
  });
  const [dragging, setDragging] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [servers, setServers] = useState<EC2Server[]>([]);
  /**
   * Tabs whose agent task finished while the user was not watching. The badge on the
   * tab label keeps the session findable even when the notification was missed.
   */
  const [attention, setAttention] = useState<Record<string, boolean>>({});

  const activeTab = useMemo(
    () => tabs.find((tb) => tb.tabId === activeTabId) ?? null,
    [tabs, activeTabId]
  );
  /**
   * 파싱된 경로만 기록한다.
   *
   * `null`은 "경로를 못 알아봤다"는 뜻이지 "홈으로 돌아갔다"는 뜻이 아니다.
   * codex/vim이 화면을 채우는 동안 null로 덮어쓰면 SFTP가 시작 경로로 튄다.
   */
  const rememberCwd = useCallback((tabId: string, path: string | null) => {
    if (path === null) return;
    setTermCwds((previous) =>
      previous[tabId] === path ? previous : { ...previous, [tabId]: path }
    );
  }, []);
  /**
   * Handles an agent task completion.
   *
   * Silence needs a narrow set of conditions: the tab is active, the window has focus
   * and that terminal was typed into moments ago. With only the first two, a user who
   * had stepped away missed codex waiting on an approval prompt. A window being on
   * screen does not mean anyone is looking at it.
   */
  const handleAgentDone = useCallback(
    (tab: SshTab, event: AgentDoneEvent) => {
      const label = tabDisplayLabel(tabs, tab);
      const seconds = Math.round(event.busyMs / 1000);

      void (async () => {
        const focused = await isWindowFocused();

        // The badge is left unconditionally, so a missed or disabled toast still
        // leaves a way to find the session.
        setAttention((previous) => ({ ...previous, [tab.tabId]: true }));

        const notify = shouldNotifyAgentDone({
          tabActive: tab.tabId === activeTabId,
          workspaceHidden: !!hidden,
          windowFocused: focused,
          sinceUserInputMs: event.sinceUserInputMs,
          recentInputMs: RECENT_INPUT_MS,
        });
        if (!notify) return;

        await notifyDesktop({
          title: t('terminal.agentDoneTitle', { name: label }),
          body:
            event.body ??
            (seconds > 0
              ? t('terminal.agentDoneBody', { seconds })
              : t('terminal.agentDoneBodyPlain')),
          skipWhenFocused: false, // 여기까지 왔으면 보고 있지 않다고 판단한 것이다
          // Flash the taskbar when the window sits behind another app; the toast is
          // gone in seconds.
          flashTaskbar: !focused,
        });
      })();
    },
    [tabs, activeTabId, hidden, t]
  );

  // Clear the badge once the user actually looks at that tab.
  useEffect(() => {
    if (!activeTabId || hidden) return;
    setAttention((previous) =>
      previous[activeTabId] ? { ...previous, [activeTabId]: false } : previous
    );
  }, [activeTabId, hidden]);

  // Drop badge state for closed tabs so the map does not grow with tab churn.
  useEffect(() => {
    setAttention((previous) => {
      const live = Object.keys(previous).filter((tabId) =>
        tabs.some((tb) => tb.tabId === tabId)
      );
      if (live.length === Object.keys(previous).length) return previous;
      return Object.fromEntries(live.map((tabId) => [tabId, previous[tabId]]));
    });
  }, [tabs]);

  useEffect(() => {
    localStorage.setItem(PANEL_KEY, sidePanel ?? '');
  }, [sidePanel]);

  useEffect(() => {
    localStorage.setItem(WIDTH_KEY, String(panelWidth));
  }, [panelWidth]);

  // 프로젝트 서버가 정해지면 첫 탭을 자동으로 연다.
  const openedDefaultRef = useRef(false);
  useEffect(() => {
    if (!isEc2 || !defaultServer || openedDefaultRef.current) return;
    if (tabs.length > 0) {
      openedDefaultRef.current = true; // 라우트 복귀: 기존 탭이 이미 있다
      return;
    }
    openedDefaultRef.current = true;
    onOpenTab(defaultServer);
  }, [isEc2, defaultServer, tabs.length, onOpenTab]);

  // 서버 목록은 피커를 열 때만 읽는다.
  useEffect(() => {
    if (!pickerOpen) return;
    let cancelled = false;
    void ec2ServerCommands
      .getAllServers()
      .then((list) => {
        if (!cancelled) setServers(list);
      })
      .catch(() => {
        if (!cancelled) setServers(defaultServer ? [defaultServer] : []);
      });
    return () => {
      cancelled = true;
    };
  }, [pickerOpen, defaultServer]);

  // 피커 위치 계산. 포털+fixed라 좌표를 직접 잡아야 한다.
  const [pickerPos, setPickerPos] = useState<DropdownPosition | null>(null);
  useEffect(() => {
    if (!pickerOpen) {
      setPickerPos(null);
      return;
    }
    const place = () => {
      const btn = pickerBtnRef.current;
      if (!btn) return;
      const r = btn.getBoundingClientRect();
      setPickerPos(
        computeDropdownPosition(
          { top: r.top, bottom: r.bottom, left: r.left, right: r.right },
          { width: window.innerWidth, height: window.innerHeight },
          { width: PICKER_WIDTH, maxHeight: PICKER_MAX_HEIGHT }
        )
      );
    };
    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [pickerOpen]);

  // 피커 바깥 클릭으로 닫기 (버튼 자신은 토글이므로 제외)
  useEffect(() => {
    if (!pickerOpen) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (pickerRef.current?.contains(target)) return;
      if (pickerBtnRef.current?.contains(target)) return;
      setPickerOpen(false);
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [pickerOpen]);

  // 스플리터 드래그. 터미널은 ResizeObserver로 스스로 fit + PTY resize 한다.
  useEffect(() => {
    if (!dragging) return;

    const onMove = (e: MouseEvent) => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const raw = rect.right - e.clientX;
      const max = Math.max(MIN_WIDTH, rect.width - MIN_TERMINAL_WIDTH);
      setPanelWidth(Math.min(max, Math.max(MIN_WIDTH, raw)));
    };
    const onUp = () => setDragging(false);

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    const prevCursor = document.body.style.cursor;
    const prevSelect = document.body.style.userSelect;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      document.body.style.cursor = prevCursor;
      document.body.style.userSelect = prevSelect;
    };
  }, [dragging]);

  const togglePanel = (panel: Exclude<SidePanel, null>) =>
    setSidePanel((cur) => (cur === panel ? null : panel));

  const headerExtra = (
    <>
      <PanelToggle
        active={sidePanel === 'tunnels'}
        onClick={() => togglePanel('tunnels')}
        title={t('tunnel.title')}
      >
        <Network className="w-4 h-4" />
      </PanelToggle>
      <PanelToggle
        active={sidePanel === 'sftp'}
        onClick={() => togglePanel('sftp')}
        title={t('sftp.title')}
      >
        <FolderTree className="w-4 h-4" />
      </PanelToggle>
    </>
  );


  if (!isEc2) {
    return (
      <div
        className="flex-1 flex items-center justify-center bg-white"
        style={hidden ? { display: 'none' } : undefined}
      >
        <div className="text-center text-gray-500">
          <TerminalIcon className="w-12 h-12 mx-auto mb-4 text-gray-400" />
          <p className="text-lg font-semibold mb-2">{t('terminal.title')}</p>
          <p className="text-sm">{t('terminal.notAvailable')}</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="flex-1 flex flex-col overflow-hidden min-w-0"
      style={hidden ? { display: 'none' } : undefined}
    >
      {/* Tab bar
          탭 목록만 가로 스크롤시키고, + 드롭다운은 스크롤 컨테이너 밖에 둔다.
          overflow-x-auto는 세로축도 auto로 만들어 버려서, 안에 있는 absolute 드롭다운이
          잘려 보이지 않는다. (= "새 세션이 안 열린다"의 정체) */}
      <div className="flex items-stretch bg-gray-100 border-b border-gray-200 flex-shrink-0">
        <div className="flex items-stretch overflow-x-auto min-w-0 flex-1">
        {tabs.map((tab) => (
          <div
            key={tab.tabId}
            onClick={() => onSelectTab(tab.tabId)}
            onAuxClick={(e) => {
              if (e.button === 1) {
                e.preventDefault();
                onCloseTab(tab.tabId); // 가운데 클릭으로 닫기
              }
            }}
            title={`${tab.server.user}@${tab.server.host}`}
            className={`group flex items-center gap-2 px-3 py-2 text-sm cursor-pointer border-r border-gray-200 max-w-[220px] flex-shrink-0 ${
              tab.tabId === activeTabId
                ? 'bg-white text-gray-900'
                : 'text-gray-600 hover:bg-gray-200'
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                tab.connected ? 'bg-green-500' : 'bg-gray-400'
              }`}
            />
            <span className="truncate">{tabDisplayLabel(tabs, tab)}</span>
            {attention[tab.tabId] && tab.tabId !== activeTabId && (
              // A title attribute on an svg is not a tooltip, it needs the span.
              <span className="flex-shrink-0" title={t('terminal.agentDoneBadge')}>
                <Bell className="w-3 h-3 text-amber-500" />
              </span>
            )}
            <button
              onClick={(e) => {
                e.stopPropagation();
                onCloseTab(tab.tabId);
              }}
              className="p-0.5 rounded hover:bg-gray-300 opacity-0 group-hover:opacity-100 flex-shrink-0"
              title={t('terminal.closeTab')}
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        ))}
        </div>

        {/* New tab.
            드롭다운은 body로 포털해서 fixed로 띄운다. 앱 셸이
            `html, body, #root { overflow: hidden }` 이고 레이아웃 곳곳이 overflow-hidden이라
            absolute로는 어느 조상에선가 반드시 잘린다. */}
        <div className="relative flex-shrink-0 border-l border-gray-200">
          <button
            ref={pickerBtnRef}
            onClick={() => setPickerOpen((v) => !v)}
            className="h-full px-3 text-gray-600 hover:bg-gray-200"
            title={t('terminal.newSession')}
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
      </div>

      {pickerOpen &&
        pickerPos &&
        createPortal(
          <div
            ref={pickerRef}
            style={{
              position: 'fixed',
              top: pickerPos.top,
              left: pickerPos.left,
              maxHeight: pickerPos.maxHeight,
              width: PICKER_WIDTH,
            }}
            className="z-[9999] bg-white border border-gray-200 rounded shadow-lg py-1 overflow-y-auto"
          >
              {servers.length === 0 && (
                <div className="px-3 py-2 text-xs text-gray-400">{t('terminal.noServers')}</div>
              )}
              {servers.map((s) => (
                <button
                  key={s.id}
                  onClick={() => {
                    setPickerOpen(false);
                    onOpenTab(s);
                  }}
                  className="w-full text-left px-3 py-2 hover:bg-gray-100 flex items-start gap-2"
                >
                  <Server className="w-3.5 h-3.5 text-gray-400 mt-0.5 flex-shrink-0" />
                  <span className="min-w-0">
                    <span className="block text-sm truncate">{s.name}</span>
                    <span className="block text-[11px] text-gray-500 font-mono truncate">
                      {s.user}@{s.host}
                    </span>
                  </span>
                </button>
              ))}
          </div>,
          document.body
        )}

      {/* Terminal + SFTP */}
      <div ref={containerRef} className="flex-1 flex overflow-hidden min-w-0">
        {tabs.length === 0 ? (
          <div className="flex-1 flex items-center justify-center bg-white">
            <div className="text-center text-gray-500">
              <TerminalIcon className="w-10 h-10 mx-auto mb-3 text-gray-300" />
              <p className="text-sm">{t('terminal.noSessions')}</p>
            </div>
          </div>
        ) : (
          // 모든 탭을 마운트한 채로 두고 숨긴다. 언마운트하면 xterm 스크롤백이 날아간다.
          // hidden에 워크스페이스 숨김까지 합쳐야, 컨테이너 뷰에서 시작한 경우에도
          // 터미널이 보이는 시점에 자동 접속이 다시 시도된다.
          tabs.map((tab) => (
            <TerminalView
              key={tab.tabId}
              server={tab.server}
              connected={tab.connected}
              sessionId={tab.sessionId}
              notices={tab.notices}
              hidden={!!hidden || tab.tabId !== activeTabId}
              autoConnect={tab.autoConnect}
              onConnect={(rows, cols) => onConnectTab(tab.tabId, rows, cols)}
              onDisconnect={() => onDisconnectTab(tab.tabId)}
              onClearNotices={() => onClearNotices(tab.tabId)}
              // 활성 탭만 추적하면 뒤에서 cd 한 탭으로 돌아왔을 때 옛 경로가 남는다.
              // 탭마다 자기 경로를 계속 기록하고, SFTP는 활성 탭 것만 읽어 간다.
              onTitleChange={(title) => rememberCwd(tab.tabId, parseCwdFromTitle(title))}
              onCwdDetected={(path) => rememberCwd(tab.tabId, path)}
              onAgentDone={(event) => handleAgentDone(tab, event)}
              headerExtra={headerExtra}
            />
          ))
        )}

        {sidePanel && (
          <>
            <div
              onMouseDown={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              className={`w-1 flex-shrink-0 cursor-col-resize ${
                dragging ? 'bg-blue-500' : 'bg-gray-200 hover:bg-blue-400'
              }`}
            />
            <div style={{ width: panelWidth }} className="flex-shrink-0 min-w-0">
              {/*
                SFTP 연결은 서버 단위다. 탭마다 새로 연결하면 탭을 바꿀 때마다
                SSH 핸드셰이크를 다시 하느라 패널이 몇 초씩 비어 보인다.
                탭 전환은 followPath만 바꿔서 이동으로 처리한다.
              */}
              {sidePanel === 'sftp' ? (
                <SftpPanel
                  key={activeTab?.server.id ?? 'none'}
                  ec2Server={activeTab?.server ?? defaultServer}
                  followPath={activeTabId ? termCwds[activeTabId] ?? null : null}
                  onClose={() => setSidePanel(null)}
                />
              ) : (
                <TunnelPanel
                  server={activeTab?.server ?? defaultServer}
                  onClose={() => setSidePanel(null)}
                />
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function PanelToggle({
  active,
  onClick,
  title,
  children,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`px-3 py-2 rounded text-sm ${
        active
          ? 'bg-blue-100 text-blue-700 hover:bg-blue-200'
          : 'bg-gray-200 hover:bg-gray-300 text-gray-900'
      }`}
    >
      {children}
    </button>
  );
}
