import { listen } from '@tauri-apps/api/event';

/**
 * Pty output bus.
 *
 * The Rust reader thread starts emitting `ssh:data` **before** `ssh_start` returns over
 * IPC, while the frontend only learns its own session id after that invoke resolves and
 * React re-renders. Dropping the bytes in between loses the ssh banner and the first
 * prompt, which looks like a connected session stuck on an empty screen.
 *
 * So the subscription is installed once at module load, and output for a session with
 * no owner yet is buffered and replayed in order the moment `attachSink` arrives.
 */

type Sink = (bytes: Uint8Array) => void;

const sinks = new Map<string, Sink>();
const pending = new Map<string, Uint8Array[]>();

/** Cap so an unowned session buffer cannot grow without bound. */
const MAX_PENDING_CHUNKS = 2048;

export function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}

/** Pushes an event payload onto the bus. */
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
 * Registers the consumer for a session's output, first replaying in order whatever
 * arrived before it attached, then forwarding the rest.
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

/** Drops the consumer and any buffered output once the session ends. */
export function dropSession(id: string) {
  sinks.delete(id);
  pending.delete(id);
}

/** Reset hook for tests. */
export function resetBusForTest() {
  sinks.clear();
  pending.clear();
}

let started = false;
/** Subscribes once at module load; listening before any session exists is what keeps output. */
export function startSshDataBus() {
  if (started) return;
  started = true;
  void listen<{ id: string; data: string }>('ssh:data', (e) => {
    pushSessionData(e.payload.id, b64ToBytes(e.payload.data));
  });
}
