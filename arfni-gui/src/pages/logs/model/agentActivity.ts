/**
 * Detects when a coding agent (claude, codex, ...) running in the terminal finishes.
 *
 * A pty never reports that a command ended, and the agent stays resident in the shell,
 * so neither process exit nor a fresh prompt is a signal. Only the byte stream is left.
 *
 * 1. OSC 9 / OSC 777 — explicit notification sequence. Most reliable.
 * 2. BEL (0x07) — claude's terminal_bell channel.
 * 3. Progress hint going stale — `esc to interrupt` stops being redrawn.
 * 4. Output falling silent — last resort, independent of any vendor wording.
 *
 * Without 4 everything hangs on the wording in 3: codex clears that hint when it
 * switches to an approval prompt, which killed detection and lost a real question.
 * But 4 false-positives easily, so it only applies once the session is known to be an
 * agent session, and it demands a longer run than 3.
 */

export type AgentDoneReason = 'osc' | 'bell' | 'idle';

export interface AgentDoneEvent {
  reason: AgentDoneReason;
  /** Time since the task started (ms). Zero when only an OSC notification arrived. */
  busyMs: number;
  /** Body carried by OSC 9/777, used verbatim in the notification when present. */
  body?: string;
  /** Whether a vendor progress hint was actually seen. Diagnostic only. */
  sawMarker: boolean;
  /**
   * Time since the user last typed into this terminal (ms), Infinity if never.
   * Someone who just typed is sitting in front of the screen, which decides
   * whether a notification is worth sending.
   */
  sinceUserInputMs: number;
}

export interface AgentActivityOptions {
  onDone: (event: AgentDoneEvent) => void;
  /** Busy state changes. The header indicator renders this so detection is visible. */
  onBusyChange?: (busy: boolean) => void;
  /** Output silent for this long counts as finished */
  idleMs?: number;
  /** Minimum run time when a vendor progress hint was seen */
  minBusyMs?: number;
  /** Minimum run time when judged from output flow alone (more conservative) */
  minStreamMs?: number;
  /** Output arriving within this gap continues the same run */
  gapMs?: number;
  /** Output within this window after a keystroke is echo or redraw, not work */
  echoWindowMs?: number;
  /** Duplicate signals within this window after a notification are dropped */
  cooldownMs?: number;
}

export interface AgentActivityDetector {
  /** Feed a decoded pty output chunk. Embedded ANSI is fine. */
  feed(text: string): void;
  signal(reason: 'bell' | 'osc', body?: string): void;
  noteUserInput(): void;
  dispose(): void;
}

/**
 * Thresholds. None of these is a measured constant, they are tradeoffs, so each one
 * carries its reason. The ordering between them is pinned by tests rather than prose
 * (see AGENT_ACTIVITY_DEFAULTS).
 */
/** Twice the slowest spinner redraw (1s). Lower reads jitter as completion. */
const DEFAULT_IDLE_MS = 2000;
/** Shorter tasks finish while the user is still watching, so a toast is noise. Judgement. */
const DEFAULT_MIN_BUSY_MS = 4000;
/** Used without a vendor hint. Deliberately twice MIN_BUSY as the evidence is weaker. */
const DEFAULT_MIN_STREAM_MS = 8000;
/** Token streaming gaps (tens to hundreds of ms) plus ssh round trip and jitter. */
const DEFAULT_GAP_MS = 1500;
/** Long enough for one tui redraw of a keystroke to land. */
const DEFAULT_ECHO_WINDOW_MS = 700;
/** Above IDLE so a BEL and an idle verdict for the same task collapse into one. */
const DEFAULT_COOLDOWN_MS = 3000;

/** Exposed so tests can assert the ordering constraints directly. */
export const AGENT_ACTIVITY_DEFAULTS = {
  idleMs: DEFAULT_IDLE_MS,
  minBusyMs: DEFAULT_MIN_BUSY_MS,
  minStreamMs: DEFAULT_MIN_STREAM_MS,
  gapMs: DEFAULT_GAP_MS,
  cooldownMs: DEFAULT_COOLDOWN_MS,
  echoWindowMs: DEFAULT_ECHO_WINDOW_MS,
} as const;

/** A marker can straddle a chunk boundary, so the previous tail is prepended. */
const TAIL_KEEP = 80;

/**
 * One textual signature.
 *
 * `gates` are literals for the cheap first pass: a chunk without any of them is only
 * scanned, never copied through the ANSI-stripping replaces.
 *
 * They sit next to their pattern on purpose. Maintained separately, a new signature
 * whose literal was forgotten would never match while tests still pass.
 */
interface Signature {
  gates: string[];
  re: RegExp;
}

/** Builds the gate from the signatures so the literals are never kept in two places. */
function buildGate(signatures: Signature[]): RegExp {
  const literals = [...new Set(signatures.flatMap((s) => s.gates))];
  return new RegExp(literals.map(escapeLiteral).join('|'), 'i');
}

function escapeLiteral(literal: string): string {
  return literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function matchSignatures(text: string, signatures: Signature[], gate: RegExp): boolean {
  if (!gate.test(text)) return false;
  const clean = stripAnsi(text);
  return signatures.some((s) => s.re.test(clean));
}

/**
 * "Running" signatures, redrawn next to each CLI's spinner.
 * - claude:  `(esc to interrupt)`
 * - codex:   `Esc to interrupt`
 * - gemini:  `(esc to cancel`
 */
const BUSY_SIGNATURES: Signature[] = [
  { gates: ['interrupt'], re: /esc(?:ape)?\s+to\s+interrupt/i },
  { gates: ['cancel'], re: /esc(?:ape)?\s+to\s+cancel/i },
  {
    gates: ['stop', 'interrupt', 'cancel'],
    re: /ctrl\+c\s+to\s+(?:stop|interrupt|cancel)/i,
  },
];

/**
 * Evidence that a coding agent is running in this session.
 *
 * A name merely mentioned in output (`starting codex-service worker`) must not count:
 * that would arm the output-silence path and fire on every quiet log stream. So the
 * name is only accepted in an execution position, after a prompt or a launcher.
 */
const AGENT_SIGNATURES: Signature[] = [
  {
    gates: ['claude', 'codex', 'gemini', 'aider', 'opencode', 'crush'],
    // Right after a prompt (`$ claude`) or as a launcher target
    // (`npx @anthropic-ai/claude-code`). `\S*?` crosses a scoped package path but not
    // a space, so it cannot swallow the arguments of some unrelated command.
    re: /(?:[$#>%❯➜›]\s*|\b(?:sudo|npx|bunx|uvx|env|nohup|time)\s+\S*?)(?:claude|codex|gemini|aider|opencode|crush)\b/i,
  },
  { gates: ['token'], re: /tokens?\s+used/i },
  { gates: ['interrupt', 'cancel'], re: /esc(?:ape)?\s+to\s+(?:interrupt|cancel)/i },
  { gates: ['⏎'], re: /⏎\s*send/ },
];

const BUSY_GATE = buildGate(BUSY_SIGNATURES);
const AGENT_GATE = buildGate(AGENT_SIGNATURES);
/** Both sets in one gate so the data path scans a chunk once, not twice. */
const ANY_GATE = buildGate([...BUSY_SIGNATURES, ...AGENT_SIGNATURES]);

/**
 * Strips ANSI escapes, OSC sequences and control characters. Spinners are saturated
 * with cursor moves and SGR, which would otherwise hide the markers.
 */
export function stripAnsi(text: string): string {
  return text
    // OSC: ESC ] ... BEL or ESC \
    .replace(/\x1b\][\s\S]*?(?:\x07|\x1b\\)/g, '')
    // CSI: ESC [ parameters intermediates final
    .replace(/\x1b\[[0-9;:?<>!]*[ -/]*[@-~]/g, '')
    // charset selection and single character escapes
    .replace(/\x1b[()#*+][0-9A-Za-z]/g, '')
    .replace(/\x1b[=><78MNOcDEHZ]/g, '')
    // remaining control characters, newlines and tabs kept
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '');
}

/** Whether this chunk carries a running signature */
export function hasBusyMarker(text: string): boolean {
  return matchSignatures(text, BUSY_SIGNATURES, BUSY_GATE);
}

/** Whether this chunk carries evidence of an agent session */
export function hasAgentHint(text: string): boolean {
  return matchSignatures(text, AGENT_SIGNATURES, AGENT_GATE);
}

/**
 * Decides whether to raise a notification.
 *
 * Split out as a pure function because getting this wrong is what lost codex's
 * approval prompt; inside a React callback the same mistake cannot be tested.
 *
 * Staying silent requires all three pieces of evidence that the user is at this
 * terminal. A window being on screen does not mean anyone is looking at it.
 */
export interface NotifyDecision {
  tabActive: boolean;
  /** Whether the workspace itself is hidden, i.e. another view is open */
  workspaceHidden: boolean;
  windowFocused: boolean;
  /** Time since the user last typed into that terminal (ms) */
  sinceUserInputMs: number;
  /** Typing within this window counts as being present */
  recentInputMs: number;
}

export function shouldNotifyAgentDone(d: NotifyDecision): boolean {
  const present =
    d.tabActive &&
    !d.workspaceHidden &&
    d.windowFocused &&
    d.sinceUserInputMs < d.recentInputMs;
  return !present;
}

export function createAgentActivityDetector(
  opts: AgentActivityOptions
): AgentActivityDetector {
  const idleMs = opts.idleMs ?? DEFAULT_IDLE_MS;
  const minBusyMs = opts.minBusyMs ?? DEFAULT_MIN_BUSY_MS;
  const minStreamMs = opts.minStreamMs ?? DEFAULT_MIN_STREAM_MS;
  const gapMs = opts.gapMs ?? DEFAULT_GAP_MS;
  const echoWindowMs = opts.echoWindowMs ?? DEFAULT_ECHO_WINDOW_MS;
  const cooldownMs = opts.cooldownMs ?? DEFAULT_COOLDOWN_MS;

  let tail = '';
  /** Whether this is an agent session; once true it stays true */
  let agentSeen = false;
  let busySince: number | null = null;
  /** Whether a vendor progress hint was seen during the current run */
  let sawMarker = false;
  let lastOutputAt = 0;
  let lastDoneAt = 0;
  let lastUserInputAt = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let disposed = false;

  const clearTimer = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };

  const endBusy = () => {
    const startedAt = busySince;
    busySince = null;
    clearTimer();
    if (startedAt !== null) opts.onBusyChange?.(false);
    return startedAt;
  };

  const emit = (reason: AgentDoneReason, body?: string) => {
    const marker = sawMarker;
    const startedAt = endBusy();
    sawMarker = false;

    const now = Date.now();
    if (reason === 'idle') {
      if (startedAt === null) return;
      // Judged from output flow alone, so it must have run longer.
      const floor = marker ? minBusyMs : minStreamMs;
      if (now - startedAt < floor) return;
    }
    // Shells also ring BEL on failed tab completion, so accept it only while working.
    if (reason === 'bell' && startedAt === null) return;
    if (now - lastDoneAt < cooldownMs) return;

    lastDoneAt = now;
    opts.onDone({
      reason,
      busyMs: startedAt === null ? 0 : now - startedAt,
      body,
      sawMarker: marker,
      sinceUserInputMs: lastUserInputAt === 0 ? Infinity : now - lastUserInputAt,
    });
  };

  const markBusy = (now: number) => {
    if (busySince === null) {
      busySince = now;
      opts.onBusyChange?.(true);
    }
    clearTimer();
    timer = setTimeout(() => emit('idle'), idleMs);
  };

  return {
    feed(chunk: string) {
      if (disposed || chunk.length === 0) return;

      // Joining the whole chunk to the tail would copy 8KB per chunk. Only a marker on
      // the boundary needs rescuing, so just the leading TAIL_KEEP is joined.
      const bridge = tail + chunk.slice(0, TAIL_KEEP);
      tail =
        chunk.length >= TAIL_KEEP
          ? chunk.slice(-TAIL_KEEP)
          : (tail + chunk).slice(-TAIL_KEEP);

      const now = Date.now();
      const previousOutputAt = lastOutputAt;
      lastOutputAt = now;

      // Scan the gate once. After the session is known the name literals are dead
      // weight, and the literal count is the cost: 7.8us per 8KB for eleven literals
      // against 3.0us for three.
      const gate = agentSeen ? BUSY_GATE : ANY_GATE;
      const interesting = gate.test(chunk) || gate.test(bridge);

      if (interesting && !agentSeen && (hasAgentHint(chunk) || hasAgentHint(bridge))) {
        agentSeen = true;
      }

      if (interesting && (hasBusyMarker(chunk) || hasBusyMarker(bridge))) {
        sawMarker = true;
        markBusy(now);
        return;
      }

      // Without a vendor hint, output flowing continuously in an agent session still
      // means work, but output caused by the user's own keystroke does not: a tui
      // redraws its input box in several chunks per key, and those gaps look exactly
      // like streaming, which lit the indicator while merely typing.
      const isEcho = now - lastUserInputAt <= echoWindowMs;
      if (agentSeen && !isEcho && previousOutputAt !== 0 && now - previousOutputAt <= gapMs) {
        markBusy(now);
      }
    },
    signal(reason, body) {
      if (disposed) return;
      emit(reason, body);
    },
    noteUserInput() {
      if (disposed) return;
      lastUserInputAt = Date.now();
      // The user just typed, so any previous result has been seen. Ending the run here
      // keeps "input, short echo, silence" from leaking out as a completion.
      endBusy();
      sawMarker = false;
      lastOutputAt = 0;
    },
    dispose() {
      disposed = true;
      endBusy();
      tail = '';
      sawMarker = false;
    },
  };
}
