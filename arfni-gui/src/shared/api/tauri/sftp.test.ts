import { describe, expect, it } from 'vitest';
import { resolveRemotePath, joinRemote, parentRemote, baseName } from './sftp';

const HOME = '/home/ubuntu';

describe('resolveRemotePath', () => {
  it('상대 경로를 현재 위치 기준으로 푼다', () => {
    // 이번 버그: SFTP에는 CWD가 없어 서버가 홈 기준으로 풀어버린다.
    // /opt 에서 'hermes'를 치면 /home/ubuntu/hermes 가 아니라 /opt/hermes 여야 한다.
    expect(resolveRemotePath('/opt', 'hermes', HOME)).toBe('/opt/hermes');
    expect(resolveRemotePath('/opt/hermes', 'logs/app', HOME)).toBe('/opt/hermes/logs/app');
  });

  it('절대 경로는 그대로 쓴다', () => {
    expect(resolveRemotePath('/opt', '/etc/nginx', HOME)).toBe('/etc/nginx');
    expect(resolveRemotePath('/opt/hermes', '/', HOME)).toBe('/');
  });

  it('.. 는 현재 위치에서 올라간다', () => {
    expect(resolveRemotePath('/opt/hermes/logs', '..', HOME)).toBe('/opt/hermes');
    expect(resolveRemotePath('/opt/hermes/logs', '../..', HOME)).toBe('/opt');
    expect(resolveRemotePath('/opt/hermes', '../nginx/conf', HOME)).toBe('/opt/nginx/conf');
  });

  it('루트 위로는 못 올라간다', () => {
    expect(resolveRemotePath('/', '..', HOME)).toBe('/');
    expect(resolveRemotePath('/opt', '../../../..', HOME)).toBe('/');
  });

  it('. 과 중복 슬래시를 정리한다', () => {
    expect(resolveRemotePath('/opt', './hermes', HOME)).toBe('/opt/hermes');
    expect(resolveRemotePath('/opt', 'hermes//logs/', HOME)).toBe('/opt/hermes/logs');
    expect(resolveRemotePath('/opt', '.', HOME)).toBe('/opt');
  });

  it('~ 를 홈으로 바꾼다', () => {
    // sftp-server는 ~ 를 확장해 주지 않으므로 클라이언트가 해야 한다
    expect(resolveRemotePath('/opt', '~', HOME)).toBe(HOME);
    expect(resolveRemotePath('/opt', '~/.ssh', HOME)).toBe(`${HOME}/.ssh`);
  });

  it('빈 입력은 현재 위치를 유지한다', () => {
    expect(resolveRemotePath('/opt/hermes', '', HOME)).toBe('/opt/hermes');
    expect(resolveRemotePath('/opt/hermes', '   ', HOME)).toBe('/opt/hermes');
  });

  it('cwd나 home을 아직 모를 때도 루트로 안전하게 떨어진다', () => {
    expect(resolveRemotePath('', 'opt')).toBe('/opt');
    expect(resolveRemotePath('', '~')).toBe('/');
  });

  it('앞뒤 공백을 무시한다', () => {
    expect(resolveRemotePath('/opt', '  hermes  ', HOME)).toBe('/opt/hermes');
  });
});

describe('joinRemote / parentRemote / baseName', () => {
  it('원격 경로는 항상 POSIX 구분자를 쓴다', () => {
    expect(joinRemote('/', 'opt')).toBe('/opt');
    expect(joinRemote('/opt', 'hermes')).toBe('/opt/hermes');
    expect(joinRemote('/opt/', 'hermes')).toBe('/opt/hermes');
  });

  it('상위 경로를 구한다', () => {
    expect(parentRemote('/opt/hermes/logs')).toBe('/opt/hermes');
    expect(parentRemote('/opt')).toBe('/');
    expect(parentRemote('/')).toBe('/');
  });

  it('로컬 경로에서 파일명만 뽑는다', () => {
    expect(baseName('/opt/hermes/app.log')).toBe('app.log');
    expect(baseName(String.raw`C:\Users\me\app.log`)).toBe('app.log');
  });
});
