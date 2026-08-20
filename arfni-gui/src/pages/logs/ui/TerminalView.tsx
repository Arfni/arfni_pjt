import React, { useRef, useEffect, useCallback, useState } from 'react';
import { Search as SearchIcon, X } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { attachSink, startSshDataBus } from '../model/sshDataBus';
import { findCwdOnScreen } from '../model/terminalTitle';
import { sanitizePasteText } from '../model/pasteText';
import {
  createAgentActivityDetector,
  AgentActivityDetector,
  AgentDoneEvent,
} from '../model/agentActivity';
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
  /** Notices and errors from the app, printed straight into the terminal buffer */
  notices: string[];
  /** Opens the session with the terminal's real size */
  onConnect: (rows: number, cols: number) => void;
  onDisconnect: () => void;
  onClearNotices: () => void;
  /** Hidden instead of unmounted; the xterm scrollback has to survive a tab switch */
  hidden?: boolean;
  /** Connect once automatically as soon as the terminal is ready */
  autoConnect?: boolean;
  /** Window title set by the remote shell (OSC 0/2); only from servers that update it */
  onTitleChange?: (title: string) => void;
  /**
   * Remote working directory read off the screen. tmux never forwards the window title
   * outwards, so parsing the prompt is the only clue in a persistent session.
   */
  onCwdDetected?: (path: string) => void;
  /** Extra controls for the right side of the header, e.g. the SFTP panel toggle */
  headerExtra?: React.ReactNode;
  /**
   * Fired when a coding agent (claude, codex, ...) in this terminal finishes.
   * See `agentActivity` for how that is decided.
   */
  onAgentDone?: (event: AgentDoneEvent) => void;
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

/**
 * Keys that stand in for the wheel inside a tmux-wrapped session.
 *
 * tmux mouse mode stays off: enabling it hands drag selection and right-click copy and
 * paste to tmux entirely. So xterm.js keeps the mouse and only the wheel is intercepted
 * here and translated into tmux scroll keys. On the remote side Alt with up and down is
 * bound to `copy-mode -e` scrolling (see ssh_rt.rs).
 */
const TMUX_SCROLL_UP = '\x1b[1;3A';
const TMUX_SCROLL_DOWN = '\x1b[1;3B';

// Listening before any session exists is what keeps the first output.
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
  onCwdDetected,
  headerExtra,
  onAgentDone,
}: TerminalViewProps) {
  const { t } = useTranslation('logs');
  const hostRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const searchRef = useRef<SearchAddon | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const writtenNoticesRef = useRef(0);
  /** Whether this is a second or later session in the same tab, for screen mode cleanup */
  const reconnectedRef = useRef(false);
  /** Whether the session is tmux-wrapped; the wheel handler reads the latest value */
  const persistentRef = useRef(false);
  useEffect(() => {
    persistentRef.current = server?.persistent_session === true;
  }, [server]);
  /** Callbacks are new functions per render, so refs keep the terminal from rebuilding */
  const onTitleChangeRef = useRef(onTitleChange);
  useEffect(() => {
    onTitleChangeRef.current = onTitleChange;
  }, [onTitleChange]);
  const onCwdDetectedRef = useRef(onCwdDetected);
  useEffect(() => {
    onCwdDetectedRef.current = onCwdDetected;
  }, [onCwdDetected]);
  const onAgentDoneRef = useRef(onAgentDone);
  useEffect(() => {
    onAgentDoneRef.current = onAgentDone;
  }, [onAgentDone]);
  /** Completion detector, sharing its lifetime with the terminal instance. */
  const agentRef = useRef<AgentActivityDetector | null>(null);

  const [searchOpen, setSearchOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);
  /** Whether an agent is detected as working. Drives the header indicator only. */
  const [agentBusy, setAgentBusy] = useState(false);


  // sessionId mirrored into a ref: onData is registered once on mount and reads it there.
  useEffect(() => {
    sessionIdRef.current = sessionId;
  }, [sessionId]);

  /** While display:none the size is zero, which makes any fit result garbage. */
  const isVisible = useCallback(() => {
    const el = hostRef.current;
    return !!el && el.clientWidth > 0 && el.clientHeight > 0;
  }, []);

  // --- terminal instance, once per mount ---
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

    // WebGL context creation fails in some webviews; the canvas renderer still works.
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

    // Key input forwarded to the pty verbatim, Ctrl+C, arrows and tab completion included
    const dataSub = term.onData((data) => {
      const id = sessionIdRef.current;
      if (!id) return;
      // Keystrokes end the current run: typing echo must not read as output flow,
      // and this is also where "the user was just here" comes from.
      agentRef.current?.noteUserInput();
      void invoke('ssh_write', { id, data }).catch(() => {});
    });

    // In a tmux session the scrollback lives inside the remote tmux, so an untouched
    // wheel only scrapes xterm.js's empty scrollback and nothing happens.
    term.attachCustomWheelEventHandler((e) => {
      if (!persistentRef.current) return true;
      const id = sessionIdRef.current;
      if (!id) return true;
      // Shift and Ctrl combinations are font zoom and page scroll by convention, left alone.
      if (e.shiftKey || e.ctrlKey || e.altKey || e.metaKey) return true;
      if (e.deltaY === 0) return true;
      const data = e.deltaY < 0 ? TMUX_SCROLL_UP : TMUX_SCROLL_DOWN;
      void invoke('ssh_write', { id, data }).catch(() => {});
      return false; // xterm.js 기본 스크롤을 막는다
    });

    // Reads the remote working directory out of the window title (OSC 0/2). The default
    // PS1 on Ubuntu keeps that title as "user@host: /path", so the SFTP panel can follow
    // along without injecting anything into the shell.
    const titleSub = term.onTitleChange((title) => {
      onTitleChangeRef.current?.(title);
    });

    // --- coding agent completion detection ---
    const agent = createAgentActivityDetector({
      onDone: (event) => onAgentDoneRef.current?.(event),
      // Header indicator: the only way to tell a failed detection from a deliberate
      // silence when no notification arrives.
      onBusyChange: setAgentBusy,
    });
    agentRef.current = agent;

    // BEL from claude`s terminal_bell notification channel.
    const bellSub = term.onBell(() => agent.signal('bell'));

    // OSC 9 (iTerm2 family) and OSC 777 (notify;title;body). A codex `notify` hook or
    // any remote script emitting these turns straight into a notification.
    const osc9 = term.parser.registerOscHandler(9, (data) => {
      // ConEmu progress (`9;4;...`) is not a notification, leave it to other handlers.
      if (data.startsWith('4;')) return false;
      agent.signal('osc', data.trim() || undefined);
      return true;
    });
    const osc777 = term.parser.registerOscHandler(777, (data) => {
      const parts = data.split(';');
      if (parts[0] !== 'notify') return false;
      agent.signal('osc', parts.slice(1).filter(Boolean).join(' - ') || undefined);
      return true;
    });

    // Paste always goes through term.paste():
    // - pushing the raw text with ssh_write drops bracketed paste (\e[200~), which runs a
    //   multi-line paste line by line
    // - letting the browser's own paste run as well types everything twice, hence
    //   preventDefault
    // - the trailing newline is stripped so a paste cannot execute on arrival
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

      // Ctrl+C copies when there is a selection and otherwise passes through as SIGINT,
      // the same rule as Windows Terminal and MobaXterm.
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
      // Terminal convention: Ctrl+Insert copies, Shift+Insert pastes
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

    // Container resize, then fit, then pty resize which sends SIGWINCH remotely
    const ro = new ResizeObserver(() => {
      // A hidden view (display:none) measures zero, and fitting then resizes to zero rows
      // and columns, which wrecks the remote tui layout.
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
      bellSub.dispose();
      osc9.dispose();
      osc777.dispose();
      agent.dispose();
      agentRef.current = null;
      term.dispose();
      termRef.current = null;
      fitRef.current = null;
      searchRef.current = null;
      writtenNoticesRef.current = 0;
    };
  }, [isVisible]);

  // --- pty output ---
  //
  // Routed through the bus so bytes that arrive before the session id is known are not
  // lost: the Rust reader thread emits before ssh_start returns over IPC, so filtering on
  // sessionId here would drop the banner and the first prompt.
  useEffect(() => {
    if (!sessionId) return;

    const term = termRef.current;
    if (!term) return;

    // Clears screen modes left by the previous session (alt screen, bracketed paste,
    // SGR); otherwise a reconnect starts broken because of the vim that was cut off.
    if (reconnectedRef.current) {
      term.write('\x1b[?1049l\x1b[?2004l\x1b[0m\r\n');
    }
    reconnectedRef.current = true;

    // The cwd is read from the prompt after the output lands on screen. tmux never
    // forwards the window title outwards, so this is the only clue in a persistent session.
    // Detection needs the spinner frames as text, and UTF-8 can split on a chunk
    // boundary, so one streaming decoder per session feeds it continuously.
    const decoder = new TextDecoder('utf-8');

    // Detection state must not cross a session boundary in either direction: entering
    // clears whatever the previous session left, and the cleanup below runs when the
    // session drops, which cancels a busy window the remote has already killed.
    agentRef.current?.resetForNewSession();

    const detach = attachSink(sessionId, (bytes) => {
      agentRef.current?.feed(decoder.decode(bytes, { stream: true }));
      term.write(bytes, () => {
        const cwd = findCwdOnScreen(term.buffer.active);
        if (cwd) onCwdDetectedRef.current?.(cwd);
      });
    });

    return () => {
      detach();
      agentRef.current?.resetForNewSession();
    };
  }, [sessionId]);

  // --- app notices printed into the terminal buffer ---
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
    // Connect cannot be pressed while hidden, but this makes a 0x0 session impossible.
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

  // A new tab connects once after the terminal is ready: only after xterm reports real
  // rows and cols does the pty size start out correct.
  //
  // hidden is a dependency because a session that starts on the container view is hidden
  // at first (size zero), so the connect has to wait and be retried once it is visible.
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

  // Right click copies when there is a selection and pastes otherwise, the PuTTY and
  // MobaXterm convention. Always pasting would type a command on an accidental click.
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
          {/* Detection indicator. Never lighting up means detection failed; lighting
              and going out with no notification points at the notify policy or OS
              permission instead. */}
          {agentBusy && (
            <span
              className="flex items-center gap-1.5 px-2 py-1 rounded bg-amber-50 text-amber-700 text-xs font-medium flex-shrink-0"
              title={t('terminal.agentBusyHint')}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
              {t('terminal.agentBusy')}
            </span>
          )}
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
