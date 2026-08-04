import { describe, expect, it } from 'vitest';
import {
  findCwdOnScreen,
  parseCwdFromPromptLine,
  parseCwdFromTitle,
  type TerminalBufferLike,
} from './terminalTitle';

const HOME = '/home/ubuntu';

describe('parseCwdFromTitle', () => {
  it('Ubuntu 기본 bash 제목에서 절대 경로를 뽑는다', () => {
    // 기본 PS1이 만드는 형태: \u@\h: \w
    expect(parseCwdFromTitle('ubuntu@large-instance: /opt/hermes', HOME)).toBe('/opt/hermes');
    expect(parseCwdFromTitle('ec2-user@ip-10-0-0-1: /var/log', HOME)).toBe('/var/log');
  });

  it('~ 를 홈으로 편다', () => {
    expect(parseCwdFromTitle('ubuntu@large-instance: ~', HOME)).toBe(HOME);
    expect(parseCwdFromTitle('ubuntu@large-instance: ~/work/app', HOME)).toBe(
      `${HOME}/work/app`
    );
  });

  it('점이 들어간 호스트 이름도 처리한다', () => {
    expect(parseCwdFromTitle('ubuntu@ec2-1-2-3-4.ap-northeast-2.compute.amazonaws.com: /srv', HOME)).toBe(
      '/srv'
    );
  });

  it('user@host 접두어가 없는 순수 경로도 받는다', () => {
    expect(parseCwdFromTitle('/opt/hermes', HOME)).toBe('/opt/hermes');
  });

  it('경로가 아닌 제목은 무시한다', () => {
    // vim/htop 같은 프로그램이 제목을 바꾸면 경로가 아니다. 따라가면 안 된다.
    expect(parseCwdFromTitle('vim app.py', HOME)).toBeNull();
    expect(parseCwdFromTitle('ubuntu@large-instance: vim', HOME)).toBeNull();
    expect(parseCwdFromTitle('', HOME)).toBeNull();
    expect(parseCwdFromTitle('   ', HOME)).toBeNull();
  });

  it('home을 모르면 ~ 는 포기한다', () => {
    // 잘못 추측해서 엉뚱한 디렉터리로 이동시키느니 아무것도 안 하는 게 낫다
    expect(parseCwdFromTitle('ubuntu@host: ~', undefined)).toBeNull();
    expect(parseCwdFromTitle('ubuntu@host: ~/x', '')).toBeNull();
  });

  it('경로를 정규화한다', () => {
    expect(parseCwdFromTitle('ubuntu@host: /opt//hermes/', HOME)).toBe('/opt/hermes');
    expect(parseCwdFromTitle('ubuntu@host: /opt/hermes/../nginx', HOME)).toBe('/opt/nginx');
    expect(parseCwdFromTitle('ubuntu@host: /', HOME)).toBe('/');
  });

  it('공백이 있는 디렉터리 이름도 살린다', () => {
    expect(parseCwdFromTitle('ubuntu@host: /opt/my app', HOME)).toBe('/opt/my app');
  });
});
describe('parseCwdFromPromptLine', () => {
  // 창 제목을 갱신하지 않는 서버에서는 이 프롬프트 파싱이 유일한 경로 단서다.

  it('bash 프롬프트에서 절대 경로를 읽는다', () => {
    expect(parseCwdFromPromptLine('ubuntu@large-instance:/opt/hermes$ ')).toBe('/opt/hermes');
    expect(parseCwdFromPromptLine('ec2-user@ip-10-0-0-1:/var/log$')).toBe('/var/log');
  });

  it('root 프롬프트(#)도 읽는다', () => {
    expect(parseCwdFromPromptLine('root@web-01:/etc/nginx# ')).toBe('/etc/nginx');
  });

  it('~ 는 펴지 않고 그대로 넘긴다', () => {
    // 홈 경로는 SFTP 세션만 안다. 여기서 추측하면 엉뚱한 디렉터리로 이동한다.
    expect(parseCwdFromPromptLine('ubuntu@host:~$ ')).toBe('~');
    expect(parseCwdFromPromptLine('ubuntu@host:~/work/app$ ')).toBe('~/work/app');
  });

  it('경로를 정규화한다', () => {
    expect(parseCwdFromPromptLine('ubuntu@host:/opt//hermes/$ ')).toBe('/opt/hermes');
    expect(parseCwdFromPromptLine('ubuntu@host:/$ ')).toBe('/');
  });

  it('프롬프트가 아닌 줄은 무시한다', () => {
    // codex/vim 같은 TUI 화면이나 명령 출력 한 줄을 경로로 오인하면
    // SFTP가 엉뚱한 곳으로 튀거나 마지막 경로를 잃는다.
    expect(parseCwdFromPromptLine('codex> ')).toBeNull();
    expect(parseCwdFromPromptLine('total 48')).toBeNull();
    expect(parseCwdFromPromptLine('ubuntu@host:/opt/hermes')).toBeNull();
    expect(parseCwdFromPromptLine('')).toBeNull();
  });

  it('명령을 입력하는 중에는 경로로 보지 않는다', () => {
    // 입력 중인 줄까지 경로로 읽으면 타이핑마다 SFTP가 흔들린다.
    expect(parseCwdFromPromptLine('ubuntu@host:/opt/hermes$ ls -al')).toBeNull();
  });
});
describe('findCwdOnScreen', () => {
  // 이번 버그의 진짜 원인이 여기 있었다. cursorY(뷰포트 기준)를 getLine(절대 인덱스)에
  // 그대로 넣으면 스크롤이 생긴 뒤로는 항상 접속 배너를 읽어서 경로가 영원히 안 바뀐다.
  function bufferOf(lines: string[], baseY: number, cursorY: number): TerminalBufferLike {
    return {
      baseY,
      cursorY,
      getLine: (index) =>
        index >= 0 && index < lines.length
          ? { translateToString: () => lines[index] }
          : undefined,
    };
  }

  it('스크롤백이 쌓여도 커서가 있는 프롬프트를 읽는다', () => {
    const screen = [
      'Welcome to Ubuntu 24.04 LTS',
      'Last login: Mon Aug  4 10:00:00 2025',
      'ubuntu@large-instance:/opt/hermes$ ',
    ];
    // 뷰포트가 마지막 한 줄만 보이는 상태 = baseY 2, cursorY 0
    expect(findCwdOnScreen(bufferOf(screen, 2, 0))).toBe('/opt/hermes');
  });

  it('커서가 프롬프트 아래(tmux 상태줄 등)에 있어도 위로 훑어 찾는다', () => {
    const screen = [
      'ubuntu@host:/srv/app$ ',
      '',
      '[arfni-tab-1] 0:bash*',
    ];
    expect(findCwdOnScreen(bufferOf(screen, 0, 2))).toBe('/srv/app');
  });

  it('가장 최근 프롬프트를 고른다', () => {
    const screen = [
      'ubuntu@host:/home/ubuntu$ cd /opt/hermes',
      'ubuntu@host:/opt/hermes$ ',
    ];
    expect(findCwdOnScreen(bufferOf(screen, 0, 1))).toBe('/opt/hermes');
  });

  it('훑는 범위 밖의 프롬프트는 보지 않는다', () => {
    // 화면이 출력으로 가득 차면 옛 경로를 되살리지 않고 마지막 값을 유지해야 한다.
    const screen = ['ubuntu@host:/opt/hermes$ ls -R', ...Array(10).fill('file.txt')];
    expect(findCwdOnScreen(bufferOf(screen, 0, 10))).toBeNull();
  });

  it('프롬프트가 없으면 null이다', () => {
    expect(findCwdOnScreen(bufferOf(['codex is thinking...'], 0, 0))).toBeNull();
    expect(findCwdOnScreen(bufferOf(['a'], 5, 5))).toBeNull();
  });
});
