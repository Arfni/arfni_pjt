import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn(() => Promise.resolve(() => {})) }));

import { attachSink, dropSession, pushSessionData, resetBusForTest } from './sshDataBus';

const bytes = (s: string) => new TextEncoder().encode(s);
const text = (chunks: Uint8Array[]) =>
  chunks.map((c) => new TextDecoder().decode(c)).join('');

describe('sshDataBus', () => {
  beforeEach(() => resetBusForTest());

  it('소비자가 붙기 전에 도착한 출력을 순서대로 재생한다', () => {
    // The heart of that bug: the Rust reader thread starts sending the banner before
    // ssh_start returns over IPC, and dropping it looks like a stuck empty screen.
    pushSessionData('s1', bytes('Welcome to Ubuntu'));
    pushSessionData('s1', bytes(' 24.04\r\n'));
    pushSessionData('s1', bytes('ubuntu@host:~$ '));

    const got: Uint8Array[] = [];
    attachSink('s1', (b) => got.push(b));

    expect(text(got)).toBe('Welcome to Ubuntu 24.04\r\nubuntu@host:~$ ');
  });

  it('붙은 뒤에 온 출력은 바로 전달한다', () => {
    const got: Uint8Array[] = [];
    attachSink('s1', (b) => got.push(b));
    pushSessionData('s1', bytes('live'));
    expect(text(got)).toBe('live');
  });

  it('재생은 한 번만 하고 두 번째 소비자에게 중복 전달하지 않는다', () => {
    pushSessionData('s1', bytes('banner'));

    const first: Uint8Array[] = [];
    const detach = attachSink('s1', (b) => first.push(b));
    expect(text(first)).toBe('banner');
    detach();

    const second: Uint8Array[] = [];
    attachSink('s1', (b) => second.push(b));
    expect(text(second)).toBe('');
  });

  it('세션끼리 출력이 섞이지 않는다', () => {
    pushSessionData('s1', bytes('one'));
    pushSessionData('s2', bytes('two'));

    const a: Uint8Array[] = [];
    const b: Uint8Array[] = [];
    attachSink('s1', (x) => a.push(x));
    attachSink('s2', (x) => b.push(x));

    expect(text(a)).toBe('one');
    expect(text(b)).toBe('two');

    pushSessionData('s1', bytes('!'));
    expect(text(a)).toBe('one!');
    expect(text(b)).toBe('two');
  });

  it('detach 후에는 더 이상 전달하지 않는다', () => {
    const got: Uint8Array[] = [];
    const detach = attachSink('s1', (x) => got.push(x));
    pushSessionData('s1', bytes('a'));
    detach();
    pushSessionData('s1', bytes('b'));
    expect(text(got)).toBe('a');
  });

  it('detach가 나중에 붙은 다른 소비자를 떼어내지 않는다', () => {
    // Toggling a tab quickly, an old detach killing the new consumer stalls the screen again
    const older: Uint8Array[] = [];
    const detachOld = attachSink('s1', (x) => older.push(x));

    const newer: Uint8Array[] = [];
    attachSink('s1', (x) => newer.push(x));

    detachOld();
    pushSessionData('s1', bytes('after'));

    expect(text(older)).toBe('');
    expect(text(newer)).toBe('after');
  });

  it('dropSession은 소비자와 버퍼를 모두 비운다', () => {
    pushSessionData('s1', bytes('stale'));
    dropSession('s1');

    const got: Uint8Array[] = [];
    attachSink('s1', (x) => got.push(x));
    expect(text(got)).toBe('');
  });

  it('주인 없는 세션 버퍼는 상한을 넘지 않는다', () => {
    // A session nobody attaches to must not grow memory without bound
    for (let i = 0; i < 5000; i += 1) pushSessionData('ghost', bytes('x'));

    const got: Uint8Array[] = [];
    attachSink('ghost', (x) => got.push(x));
    expect(got.length).toBe(2048);
  });
});
