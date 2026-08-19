/**
 * Extracts the remote working directory from the terminal title (OSC 0/2).
 *
 * The default bash PS1 on Ubuntu and Debian contains `\[\e]0;\u@\h: \w\a\]`, which keeps
 * the window title updated as `ubuntu@large-instance: /opt/hermes`. Pulling the path out
 * of it lets the SFTP panel follow the shell without injecting anything into it.
 *
 * An unrecognised title returns null and the caller can simply ignore it.
 */
export function parseCwdFromTitle(title: string, home?: string): string | null {
  const trimmed = title.trim();
  if (!trimmed) return null;

  // Just the path out of "user@host: <path>"; host names may contain '.' and '-'.
  const match = /^[^@\s]+@[^\s:]+:\s*(\S.*)$/.exec(trimmed);
  const raw = (match ? match[1] : trimmed).trim();

  if (raw.startsWith('/')) return normalize(raw);

  if (raw === '~' || raw.startsWith('~/')) {
    if (!home || !home.startsWith('/')) return null;
    return raw === '~' ? normalize(home) : normalize(`${home}/${raw.slice(2)}`);
  }

  // Neither absolute nor ~ means it is not a path, e.g. a title like "vim app.py".
  return null;
}
/**
 * Extracts the working directory from the prompt line on the pty screen.
 *
 * Plenty of servers never update the window title, yet a prompt shaped like
 * `ubuntu@host:/opt/hermes$` still spells the path out.
 *
 * A `~` form is returned as is: the side that knows the home path (the SFTP panel)
 * expands it through `resolveRemotePath`. Guessing home here would navigate somewhere
 * unrelated.
 */
export function parseCwdFromPromptLine(line: string): string | null {
  const trimmed = line.trim();
  // Only lines ending in a prompt sign ($ or #); a line of output must not pass as a path.
  const match = /^[^@\s]+@[^\s:]+:\s*([~/][^$#]*?)\s*[$#]\s*$/.exec(trimmed);
  if (!match) return null;

  const path = match[1];
  return path.startsWith('/') ? normalize(path) : path;
}

/** Only the part of the xterm buffer this code uses, so tests can fake it without a DOM. */
export interface TerminalBufferLike {
  /** Index of the viewport's top line within the buffer, scrollback included */
  baseY: number;
  /** Cursor position, relative to the viewport */
  cursorY: number;
  getLine(index: number): { translateToString(trimRight?: boolean): string } | undefined;
}

/** How far up from the cursor to look, for prompts hidden by a tmux status line or partial output. */
const PROMPT_SCAN_LINES = 6;

/**
 * Finds the most recent prompt on screen and returns its working directory.
 *
 * The cursor line alone misses too much: the cursor sitting on a tmux status line, one
 * more line of output after the prompt, or a chunk cut mid-line all defeat it. Scanning
 * upwards from the cursor line finds the most recent prompt first.
 */
export function findCwdOnScreen(
  buffer: TerminalBufferLike,
  maxScan = PROMPT_SCAN_LINES
): string | null {
  const cursorLine = buffer.baseY + buffer.cursorY;
  for (let y = cursorLine; y >= 0 && y > cursorLine - maxScan; y -= 1) {
    const text = buffer.getLine(y)?.translateToString(true);
    if (!text) continue;
    const cwd = parseCwdFromPromptLine(text);
    if (cwd) return cwd;
  }
  return null;
}

function normalize(path: string): string {
  const segments: string[] = [];
  for (const seg of path.split('/')) {
    if (!seg || seg === '.') continue;
    if (seg === '..') {
      segments.pop();
      continue;
    }
    segments.push(seg);
  }
  return `/${segments.join('/')}`;
}
