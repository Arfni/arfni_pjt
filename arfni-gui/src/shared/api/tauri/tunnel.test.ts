import { describe, expect, it } from 'vitest';
import { browsableUrl, validateSpec, TunnelInfo, TunnelSpec } from './tunnel';

function info(over: Partial<TunnelInfo> = {}): TunnelInfo {
  return {
    id: 't1',
    kind: 'local',
    bind_address: '127.0.0.1',
    bind_port: 9091,
    target_host: 'localhost',
    target_port: 9090,
    label: null,
    via: 'ubuntu@ec2',
    description: '',
    ...over,
  };
}

function spec(over: Partial<TunnelSpec> = {}): TunnelSpec {
  return { kind: 'local', bind_port: 9091, target_port: 9090, ...over };
}

describe('browsableUrl', () => {
  it('로컬 포워딩은 바인드 주소/포트로 열 수 있다', () => {
    expect(browsableUrl(info())).toBe('http://127.0.0.1:9091');
  });

  it('0.0.0.0 바인드는 루프백으로 바꿔서 연다', () => {
    // 0.0.0.0은 "모든 인터페이스"라는 뜻이지 접속 가능한 주소가 아니다
    expect(browsableUrl(info({ bind_address: '0.0.0.0' }))).toBe('http://127.0.0.1:9091');
  });

  it('443이면 https로 연다', () => {
    expect(browsableUrl(info({ bind_port: 443 }))).toBe('https://127.0.0.1:443');
    expect(browsableUrl(info({ target_port: 443 }))).toBe('https://127.0.0.1:9091');
  });

  it('원격/SOCKS 포워딩은 브라우저로 열 URL이 없다', () => {
    // -R은 원격에서 바인드하고, -D는 SOCKS 프록시라 http URL이 성립하지 않는다
    expect(browsableUrl(info({ kind: 'remote' }))).toBeNull();
    expect(browsableUrl(info({ kind: 'dynamic', target_host: null, target_port: null }))).toBeNull();
  });
});

describe('validateSpec', () => {
  it('정상 입력은 통과한다', () => {
    expect(validateSpec(spec())).toBeNull();
    expect(validateSpec({ kind: 'dynamic', bind_port: 1080 })).toBeNull();
  });

  it('포트 범위를 벗어나면 막는다', () => {
    expect(validateSpec(spec({ bind_port: 0 }))?.key).toBe('tunnel.error.bindPort');
    expect(validateSpec(spec({ bind_port: 65536 }))?.key).toBe('tunnel.error.bindPort');
    expect(validateSpec(spec({ bind_port: 1.5 }))?.key).toBe('tunnel.error.bindPort');
  });

  it('local/remote는 대상 포트가 필수다', () => {
    expect(validateSpec(spec({ target_port: null }))?.key).toBe('tunnel.error.targetPort');
    expect(validateSpec(spec({ target_port: 0 }))?.key).toBe('tunnel.error.targetPort');
    expect(validateSpec(spec({ kind: 'remote', target_port: undefined }))?.key).toBe(
      'tunnel.error.targetPort'
    );
  });

  it('dynamic은 대상 포트를 요구하지 않는다', () => {
    expect(validateSpec({ kind: 'dynamic', bind_port: 1080, target_port: null })).toBeNull();
  });

  it("호스트에 ':'가 있으면 막고 어느 필드인지 알려준다", () => {
    // ssh -L 인자는 콜론으로 필드를 나눈다. 통과시키면 포워딩 대상이 조용히 바뀐다.
    const bind = validateSpec(spec({ bind_address: '::1' }));
    expect(bind?.key).toBe('tunnel.error.colon');
    expect(bind?.params?.field).toBe('tunnel.field.bindAddressLocal');

    const target = validateSpec(spec({ target_host: 'evil:1234' }));
    expect(target?.key).toBe('tunnel.error.colon');
    expect(target?.params?.field).toBe('tunnel.field.targetHost');
  });

  it('사용자에게 보일 문구를 직접 만들지 않는다', () => {
    // 이 모듈은 UI 언어를 몰라야 한다. 키만 돌려주고 번역은 화면에서 한다.
    const err = validateSpec(spec({ bind_port: 0 }));
    expect(err?.key.startsWith('tunnel.')).toBe(true);
  });
});
