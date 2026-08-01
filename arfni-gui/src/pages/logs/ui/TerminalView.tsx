import React, { useRef, useEffect, useCallback, useState } from 'react';
import { Search as SearchIcon, X } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { attachSink, startSshDataBus } from '../model/sshDataBus';
import { sanitizePasteText } from '../model/pasteText';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { SearchAddon } from '@xterm/addon-search';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { WebglAddon } from '@xterm/addon-webgl';
import '@xterm/xterm/css/xterm.css';
import { EC2Server } from '@shared/api/tauri/commands';
import { useTranslation } from 'react-i18next';

interface TerminalViewProps {
  server: EC2Server | null;
  connected: boolean;
  sessionId: string | null;
  /** 앱이 생성한 안내/오류 메시지. 터미널 버퍼에 그대로 찍는다. */
  notices: string[];
  /** 실제 터미널 크기를 넘겨받아 세션을 연다. */
  onConnect: (rows: number, cols: number) => void;
  onDisconnect: () => void;
  onClearNotices: () => void;
  /** 언마운트 대신 숨김. 탭을 바꿔도 xterm 스크롤백이 살아 있어야 한다. */
  hidden?: boolean;
  /** 터미널이 준비되는 대로 한 번 자동 접속 */
  autoConnect?: boolean;
  /** 원격 셸이 설정한 창 제목. SFTP 패널이 현재 디렉터리를 따라가는 데 쓴다. */
  onTitleChange?: (title: string) => void;
  /** 헤더 우측 버튼 영역에 끼워넣을 추가 컨트롤 (예: SFTP 패널 토글) */
  headerExtra?: React.ReactNode;
}

const THEME = {
  background: '#11111b',
  foreground: '#cdd6f4',
  cursor: '#f5e0dc',
  cursorAccent: '#11111b',
  selectionBackground: '#585b70',
  black: '#45475a',
  red: '#f38ba8',
  green: '#a6e3a1',
  yellow: '#f9e2af',
  blue: '#89b4fa',
  magenta: '#f5c2e7',
  cyan: '#94e2d5',
  white: '#bac2de',
  brightBlack: '#585b70',
  brightRed: '#f38ba8',
  brightGreen: '#a6e3a1',
  brightYellow: '#f9e2af',
  brightBlue: '#89b4fa',
  brightMagenta: '#f5c2e7',
  brightCyan: '#94e2d5',
  brightWhite: '#a6adc8',
};

// 세션이 생기기 전부터 듣고 있어야 첫 출력을 놓치지 않는다.
startSshDataBus();

export function TerminalView({
  server,
  connected,
  sessionId,
  notices,
  onConnect,
  onDisconnect,
  onClearNotices,
  hidden,
  autoConnect,
  onTitleChange,
  headerExtra,
}: TerminalViewProps) {
  const { t } = useTranslation('logs');
  const hostRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const searchRef = useRef<SearchAddon | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const writtenNoticesRef = useRef(0);
  /** 같은 탭에서 두 번째 이후로 붙는 세션인지 (재접속 시 화면 모드 정리용) */
  const reconnectedRef = useRef(false);
  /** onTitleChange는 매 렌더 새 함수라 ref로 받는다 (터미널 재생성 방지) */
  const onTitleChangeRef = useRef(onTitleChange);
  useEffect(() => {
    onTitleChangeRef.current = onTitleChange;
  }, [onTitleChange]);

  const [searchOpen, setSearchOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);


  // sessionId를 ref로 미러링 — onData 콜백은 마운트 시 한 번만 등록되므로 최신 값을 ref로 읽는다.
  useEffect(() => {
    sessionIdRef.current = sessionId;
  }, [sessionId]);

  /** 숨겨진(display:none) 상태에서는 크기가 0이라 fit 결과가 쓰레기가 된다. */
  const isVisible = useCallback(() => {
    const el = hostRef.current;
    return !!el && el.clientWidth > 0 && el.clientHeight > 0;
  }, []);

  // --- 터미널 인스턴스 생성 (마운트당 1회) ---
  useEffect(() => {
    if (!hostRef.current) return;

    const term = new Terminal({
      fontFamily:
        '"JetBrainsMono Nerd Font", "MesloLGS NF", "D2Coding", "Cascadia Mono", Consolas, monospace',
      fontSize: 13,
      lineHeight: 1.15,
      cursorBlink: true,
      scrollback: 20000,
      allowProposedApi: true,
      macOptionIsMeta: true,
      theme: THEME,
    });

    const fit = new FitAddon();
    const search = new SearchAddon();
    term.loadAddon(fit);
    term.loadAddon(search);
    term.loadAddon(new WebLinksAddon());

    term.open(hostRef.current);

    // WebGL은 일부 WebView에서 컨텍스트 생성이 실패할 수 있다. 실패해도 canvas 렌더러로 동작한다.
    try {
      const webgl = new WebglAddon();
      webgl.onContextLoss(() => webgl.dispose());
      term.loadAddon(webgl);
    } catch {
      /* fallback renderer */
    }

    if (isVisible()) fit.fit();

    termRef.current = term;
    fitRef.current = fit;
    searchRef.current = search;

    // 키 입력 → PTY로 원본 전달 (Ctrl+C, 방향키, Tab 자동완성 포함)
    const dataSub = term.onData((data) => {
      const id = sessionIdRef.current;
      if (!id) return;
      void invoke('ssh_write', { id, data }).catch(() => {});
    });

    // 창 제목(OSC 0/2)에서 원격 작업 디렉터리를 읽어 올려보낸다.
    // Ubuntu 기본 PS1이 제목을 "user@host: /경로"로 계속 갱신하므로,
    // 셸에 아무것도 주입하지 않고 SFTP 패널을 따라가게 할 수 있다.
    const titleSub = term.onTitleChange((title) => {
      onTitleChangeRef.current?.(title);
    });

    // 붙여넣기는 반드시 term.paste()를 거친다.
    // - ssh_write로 원문을 직접 밀면 bracketed paste(\e[200~)가 빠져서
    //   여러 줄 붙여넣기가 줄마다 즉시 실행된다.
    // - 브라우저 기본 붙여넣기까지 같이 돌면 두 번 입력된다. preventDefault가 필수.
    // - 끝 개행을 떼어내 붙여넣자마자 실행되는 사고를 막는다.
    const paste = (e: KeyboardEvent) => {
      e.preventDefault();
      void navigator.clipboard.readText().then((txt) => {
        const clean = sanitizePasteText(txt);
        if (clean) term.paste(clean);
      });
    };
    const copySelection = () => {
      const sel = term.getSelection();
      if (!sel) return false;
      void navigator.clipboard.writeText(sel);
      term.clearSelection();
      return true;
    };

    term.attachCustomKeyEventHandler((e) => {
      if (e.type !== 'keydown') return true;
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return true;

      // Ctrl+C: 선택 영역이 있으면 복사, 없으면 그대로 흘려보내 SIGINT가 되게 한다.
      // (Windows Terminal / MobaXterm과 같은 규칙)
      if (!e.shiftKey && e.code === 'KeyC') {
        return !copySelection();
      }
      if (!e.shiftKey && e.code === 'KeyV') {
        paste(e);
        return false;
      }
      if (e.shiftKey && e.code === 'KeyC') {
        copySelection();
        return false;
      }
      if (e.shiftKey && e.code === 'KeyV') {
        paste(e);
        return false;
      }
      // 터미널 관례: Ctrl+Insert 복사 / Shift+Insert 붙여넣기
      if (e.code === 'Insert') {
        if (e.ctrlKey) {
          copySelection();
          return false;
        }
        if (e.shiftKey) {
          paste(e);
          return false;
        }
      }
      if (e.shiftKey && e.code === 'KeyF') {
        setSearchOpen(true);
        setTimeout(() => searchInputRef.current?.focus(), 0);
        return false;
      }
      return true;
    });

    // 컨테이너 크기 변화 → fit → PTY resize (원격에 SIGWINCH)
    const ro = new ResizeObserver(() => {
      // 뷰가 숨겨지면(display:none) 크기가 0이 된다.
      // 이때 fit하면 0행/0열로 리사이즈되어 원격 TUI 레이아웃이 망가진다.
      if (!isVisible()) return;
      try {
        fit.fit();
      } catch {
        return;
      }
      const id = sessionIdRef.current;
      if (!id) return;
      void invoke('ssh_resize', { id, rows: term.rows, cols: term.cols }).catch(() => {});
    });
    ro.observe(hostRef.current);

    return () => {
      ro.disconnect();
      dataSub.dispose();
      titleSub.dispose();
      term.dispose();
      termRef.current = null;
      fitRef.current = null;
      searchRef.current = null;
      writtenNoticesRef.current = 0;
    };
  }, [isVisible]);

  // --- PTY 출력 수신 ---
  //
  // 세션 id를 알기 전에 도착한 바이트도 잃지 않기 위해 버스를 거친다.
  // Rust reader 스레드는 ssh_start가 IPC로 돌아오기 전에 이미 emit을 시작하므로,
  // 여기서 sessionId를 직접 필터링하면 배너와 첫 프롬프트가 통째로 사라진다.
  useEffect(() => {
    if (!sessionId) return;

    const term = termRef.current;
    if (!term) return;

    // 이전 세션이 남긴 화면 모드(alt screen, bracketed paste, SGR)를 정리한다.
    // 안 그러면 재접속 후 vim을 쓰다 끊은 흔적 때문에 화면이 깨진 채로 시작한다.
    if (reconnectedRef.current) {
      term.write('\x1b[?1049l\x1b[?2004l\x1b[0m\r\n');
    }
    reconnectedRef.current = true;

    return attachSink(sessionId, (bytes) => term.write(bytes));
  }, [sessionId]);

  // --- 앱 안내 메시지를 터미널 버퍼에 찍기 ---
  useEffect(() => {
    const term = termRef.current;
    if (!term) return;
    if (notices.length < writtenNoticesRef.current) {
      writtenNoticesRef.current = 0;
    }
    for (let i = writtenNoticesRef.current; i < notices.length; i += 1) {
      term.writeln(`\x1b[90m${notices[i]}\x1b[0m`);
    }
    writtenNoticesRef.current = notices.length;
  }, [notices]);

  const handleConnect = useCallback(() => {
    const term = termRef.current;
    const fit = fitRef.current;
    if (!term || !fit) return;
    // 숨겨진 상태에서 연결을 누를 수는 없지만, 0x0으로 세션이 열리는 것만은 확실히 막는다.
    if (isVisible()) {
      try {
        fit.fit();
      } catch {
        /* noop */
      }
    }
    term.focus();
    onConnect(term.rows, term.cols);
  }, [onConnect, isVisible]);

  // 탭이 새로 열리면 터미널이 준비된 뒤 한 번 자동 접속한다.
  // xterm이 실제 행/열을 알려준 뒤여야 PTY 크기가 처음부터 맞는다.
  //
  // hidden을 의존성에 넣는 이유: 컨테이너 탭에서 시작해 터미널을 나중에 여는 경우처럼
  // 처음에는 숨겨져 있어(크기 0) 접속을 미뤄야 하고, 보이게 된 시점에 다시 시도해야 한다.
  useEffect(() => {
    if (!autoConnect || sessionId || !server || hidden) return;
    if (!isVisible()) return;
    handleConnect();
  }, [autoConnect, sessionId, server, hidden, isVisible, handleConnect]);

  const handleClear = useCallback(() => {
    termRef.current?.clear();
    writtenNoticesRef.current = 0;
    onClearNotices();
  }, [onClearNotices]);

  const runSearch = useCallback(
    (dir: 'next' | 'prev', value: string) => {
      const s = searchRef.current;
      if (!s || !value) return;
      if (dir === 'next') s.findNext(value);
      else s.findPrevious(value);
    },
    []
  );

  // 우클릭: 선택 영역이 있으면 복사, 없으면 붙여넣기 (PuTTY/MobaXterm 관례).
  // 무조건 붙여넣으면 실수로 우클릭했을 때 명령이 들어간다.
  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const term = termRef.current;
    if (!term) return;

    const sel = term.getSelection();
    if (sel) {
      void navigator.clipboard.writeText(sel);
      term.clearSelection();
      return;
    }
    void navigator.clipboard.readText().then((txt) => {
      const clean = sanitizePasteText(txt);
      if (clean) term.paste(clean);
    });
  }, []);


  return (
    <div
      className="flex-1 bg-white overflow-hidden flex flex-col min-w-0"
      style={hidden ? { display: 'none' } : undefined}
    >
      {/* Controls */}
      <div className="bg-gray-50 text-gray-900 px-4 py-3 flex items-center justify-between flex-shrink-0 border-b border-gray-200">
        <div className="flex items-center gap-3">
          <span
            className={`w-2 h-2 rounded-full ${connected ? 'bg-green-500' : 'bg-gray-400'}`}
            title={connected ? 'connected' : 'disconnected'}
          />
          <div className="flex flex-col gap-1 min-w-0">
            <span className="font-semibold text-base truncate">{server?.name}</span>
            {server && (
              <span className="font-mono text-sm text-gray-600 truncate">
                {server.user}@{server.host}
              </span>
            )}
          </div>
        </div>

        <div className="flex gap-2">
          {headerExtra}
          <button
            onClick={() => {
              setSearchOpen((v) => !v);
              setTimeout(() => searchInputRef.current?.focus(), 0);
            }}
            className="px-3 py-2 bg-gray-200 hover:bg-gray-300 text-gray-900 rounded text-sm"
            title="Ctrl+Shift+F"
          >
            <SearchIcon className="w-4 h-4" />
          </button>
          {!connected ? (
            <button
              onClick={handleConnect}
              disabled={!server}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {t('terminal.connect')}
            </button>
          ) : (
            <button
              onClick={onDisconnect}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded text-sm"
            >
              {t('terminal.disconnect')}
            </button>
          )}
          <button
            onClick={handleClear}
            className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-900 rounded text-sm"
          >
            {t('terminal.clear')}
          </button>
        </div>
      </div>

      {/* Search bar */}
      {searchOpen && (
        <div className="bg-gray-100 px-4 py-2 flex items-center gap-2 flex-shrink-0 border-b border-gray-200">
          <input
            ref={searchInputRef}
            className="flex-1 bg-white border border-gray-300 rounded px-3 py-1.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder={t('terminal.search')}
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              runSearch('next', e.target.value);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') runSearch(e.shiftKey ? 'prev' : 'next', searchTerm);
              if (e.key === 'Escape') {
                setSearchOpen(false);
                termRef.current?.focus();
              }
            }}
          />
          <button
            onClick={() => runSearch('prev', searchTerm)}
            className="px-2 py-1.5 bg-gray-200 hover:bg-gray-300 rounded text-sm"
          >
            ↑
          </button>
          <button
            onClick={() => runSearch('next', searchTerm)}
            className="px-2 py-1.5 bg-gray-200 hover:bg-gray-300 rounded text-sm"
          >
            ↓
          </button>
          <button
            onClick={() => {
              setSearchOpen(false);
              termRef.current?.focus();
            }}
            className="px-2 py-1.5 bg-gray-200 hover:bg-gray-300 rounded text-sm"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* xterm host */}
      <div
        className="flex-1 min-h-0 overflow-hidden"
        style={{ background: THEME.background, padding: '8px' }}
        onContextMenu={handleContextMenu}
        onClick={() => termRef.current?.focus()}
      >
        <div ref={hostRef} className="w-full h-full" />
      </div>
    </div>
  );
}
