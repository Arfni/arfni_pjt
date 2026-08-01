import { describe, expect, it } from 'vitest';
import { parseCwdFromTitle } from './terminalTitle';

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
