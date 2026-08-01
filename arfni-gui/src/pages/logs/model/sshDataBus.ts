import { listen } from '@tauri-apps/api/event';

/**
 * PTY 출력 버스.
 *
 * Rust의 reader 스레드는 `ssh_start`가 IPC로 돌아오기 **전에** 이미 `ssh:data`를 쏘기 시작한다.
 * 반면 프론트가 "내 세션 id"를 아는 시점은 invoke가 resolve되고 React가 리렌더된 뒤다.
 * 그 사이에 도착한 바이트를 버리면 SSH 배너와 첫 프롬프트가 통째로 사라져서,
 * 접속은 됐는데 화면이 빈 채 멈춘 것처럼 보인다.
 *
 * 그래서 구독은 모듈 로드 시점에 한 번만 걸어 두고, 아직 주인이 없는 세션의 출력은
 * 버퍼에 쌓아 두었다가 `attachSink`가 붙는 순간 순서대로 흘려준다.
 */

type Sink = (bytes: Uint8Array) => void;

const sinks = new Map<string, Sink>();
const pending = new Map<string, Uint8Array[]>();

/** 주인 없는 세션 버퍼가 무한정 늘어나지 않도록 상한을 둔다. */
const MAX_PENDING_CHUNKS = 2048;

export function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}

/** 이벤트 페이로드를 버스에 넣는다. */
export function pushSessionData(id: string, bytes: Uint8Array) {
  const sink = sinks.get(id);
  if (sink) {
    sink(bytes);
    return;
  }
  const buf = pending.get(id) ?? [];
  if (buf.length < MAX_PENDING_CHUNKS) buf.push(bytes);
  pending.set(id, buf);
}

/**
 * 세션 출력을 받을 소비자를 등록한다.
 * 붙기 전에 도착해 있던 바이트를 먼저 순서대로 재생한 뒤, 이후 것을 이어서 준다.
 */
export function attachSink(id: string, sink: Sink): () => void {
  sinks.set(id, sink);

  const buffered = pending.get(id);
  if (buffered) {
    pending.delete(id);
    for (const chunk of buffered) sink(chunk);
  }

  return () => {
    if (sinks.get(id) === sink) sinks.delete(id);
  };
}

/** 세션이 끝나면 소비자와 남은 버퍼를 모두 버린다. */
export function dropSession(id: string) {
  sinks.delete(id);
  pending.delete(id);
}

/** 테스트용 초기화. */
export function resetBusForTest() {
  sinks.clear();
  pending.clear();
}

let started = false;
/** 모듈 로드 시 한 번만 구독한다. 세션이 생기기 전부터 듣고 있어야 놓치지 않는다. */
export function startSshDataBus() {
  if (started) return;
  started = true;
  void listen<{ id: string; data: string }>('ssh:data', (e) => {
    pushSessionData(e.payload.id, b64ToBytes(e.payload.data));
  });
}
