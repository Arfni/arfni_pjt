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
