/**
 * 터미널 제목(OSC 0/2)에서 원격 작업 디렉터리를 뽑는다.
 *
 * Ubuntu/Debian 기본 bash PS1은 `\[\e]0;\u@\h: \w\a\]`를 포함해서
 * 창 제목을 `ubuntu@large-instance: /opt/hermes` 형태로 계속 갱신한다.
 * 여기서 경로만 떼어내면 셸에 아무것도 주입하지 않고 SFTP 패널을 따라가게 할 수 있다.
 *
 * 제목 형식을 못 알아보면 null을 돌려주고, 호출부는 그냥 무시하면 된다.
 */
export function parseCwdFromTitle(title: string, home?: string): string | null {
  const trimmed = title.trim();
  if (!trimmed) return null;

  // "user@host: <path>" 에서 경로 부분만. 호스트 이름에 '.'과 '-'가 들어갈 수 있다.
  const match = /^[^@\s]+@[^\s:]+:\s*(\S.*)$/.exec(trimmed);
  const raw = (match ? match[1] : trimmed).trim();

  if (raw.startsWith('/')) return normalize(raw);

  if (raw === '~' || raw.startsWith('~/')) {
    if (!home || !home.startsWith('/')) return null;
    return raw === '~' ? normalize(home) : normalize(`${home}/${raw.slice(2)}`);
  }

  // 절대 경로도 ~ 도 아니면 경로가 아니다 (예: "vim app.py" 같은 실행 중 프로그램 제목)
  return null;
}
/**
 * PTY 화면의 프롬프트 줄에서 현재 작업 디렉터리를 뽑는다.
 *
 * 창 제목(OSC 0/2)을 갱신하지 않는 서버가 많다. 그런 서버에서도
 * `ubuntu@host:/opt/hermes$` 형태의 프롬프트에는 경로가 그대로 찍힌다.
 *
 * `~` 형태는 여기서 펴지 않고 그대로 돌려준다. 홈 경로를 아는 쪽(SFTP 패널)이
 * `resolveRemotePath`로 확장한다. 여기서 홈을 추측하면 엉뚱한 경로로 이동한다.
 */
export function parseCwdFromPromptLine(line: string): string | null {
  const trimmed = line.trim();
  // 프롬프트 기호($ 또는 #)로 끝나는 줄만 본다. 명령 출력 한 줄을 경로로 오인하면 안 된다.
  const match = /^[^@\s]+@[^\s:]+:\s*([~/][^$#]*?)\s*[$#]\s*$/.exec(trimmed);
  if (!match) return null;

  const path = match[1];
  return path.startsWith('/') ? normalize(path) : path;
}

/** xterm 버퍼에서 이 코드가 실제로 쓰는 부분만. 테스트에서 DOM 없이 흉내내기 위함이다. */
export interface TerminalBufferLike {
  /** 뷰포트 맨 윗줄이 버퍼(스크롤백 포함)에서 몇 번째인지 */
  baseY: number;
  /** 커서 위치. 뷰포트 기준이다 */
  cursorY: number;
  getLine(index: number): { translateToString(trimRight?: boolean): string } | undefined;
}

/** 커서 줄에서 위로 몇 줄까지 프롬프트를 찾을지. tmux 상태줄이나 부분 출력에 가려지는 경우 대비. */
const PROMPT_SCAN_LINES = 6;

/**
 * 지금 화면에서 가장 최근 프롬프트를 찾아 작업 디렉터리를 돌려준다.
 *
 * 커서 줄만 보면 놓치는 경우가 많다. tmux 상태줄에 커서가 가 있거나,
 * 프롬프트 뒤에 출력이 한 줄 더 붙거나, 청크가 줄 중간에서 끊기면 전부 실패한다.
 * 커서 줄부터 위로 훑으면 가장 최근 프롬프트가 먼저 잡힌다.
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
