import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createAgentActivityDetector,
  hasAgentHint,
  hasBusyMarker,
  shouldNotifyAgentDone,
  AGENT_ACTIVITY_DEFAULTS,
  stripAnsi,
  AgentDoneEvent,
} from './agentActivity';

/** What a spinner frame really looks like: cursor moves, SGR and the hint. */
const CODEX_FRAME = '\x1b[2K\x1b[1G\x1b[38;5;245m⠋ Working\x1b[0m  \x1b[2mEsc to interrupt\x1b[0m';
const CLAUDE_FRAME = '\x1b[?25l✻ Thinking… (12s · \x1b[1m↑ 3.1k tokens\x1b[22m · esc to interrupt)';
/** Body output after the progress hint is gone, as on an approval prompt. */
const PLAIN_OUTPUT = '\x1b[2m•\x1b[0m 현재 저장소를 확인했습니다.\r\n';

describe('stripAnsi', () => {
  it('CSI/SGR/OSC를 걷어내고 본문만 남긴다', () => {
    expect(stripAnsi(CODEX_FRAME)).toBe('⠋ Working  Esc to interrupt');
    expect(stripAnsi('\x1b]0;ubuntu@host: /opt\x07$ ls')).toBe('$ ls');
    expect(stripAnsi('a\x1b[200~b\x1b[201~c')).toBe('abc');
  });

  it('개행과 탭은 남긴다', () => {
    expect(stripAnsi('a\r\nb\tc')).toBe('a\r\nb\tc');
  });
});

describe('hasBusyMarker', () => {
  it('각 CLI의 진행 힌트를 잡는다', () => {
    expect(hasBusyMarker(CODEX_FRAME)).toBe(true);
    expect(hasBusyMarker(CLAUDE_FRAME)).toBe(true);
    expect(hasBusyMarker('⠹ Generating (esc to cancel, 4s)')).toBe(true);
  });

  it('평범한 셸 출력은 잡지 않는다', () => {
    expect(hasBusyMarker('ubuntu@host:/opt$ docker ps\n')).toBe(false);
    expect(hasBusyMarker('interrupt handler installed')).toBe(false);
  });
});

describe('hasAgentHint', () => {
  it('사용자가 입력한 명령 에코만으로도 에이전트 세션을 알아본다', () => {
    expect(hasAgentHint('ubuntu@host:/opt/hermes$ claude\r\n')).toBe(true);
    expect(hasAgentHint('ubuntu@host:/opt/hermes$ codex --model gpt-5\r\n')).toBe(true);
    expect(hasAgentHint('  ↑ 12.4k tokens used\r\n')).toBe(true);
    expect(hasAgentHint('$ npx @anthropic-ai/claude-code\r\n')).toBe(true);
    expect(hasAgentHint('❯ codex resume\r\n')).toBe(true);
  });

  it('무관한 출력은 에이전트 세션으로 보지 않는다', () => {
    expect(hasAgentHint('ubuntu@host:/opt$ docker compose up -d\r\n')).toBe(false);
    expect(hasAgentHint(PLAIN_OUTPUT)).toBe(false);
  });

  it('로그 본문에 이름만 스친 경우는 에이전트 세션이 아니다', () => {
    // Accepting this as a session would fire a completion every time a long log
    // stream goes quiet.
    expect(hasAgentHint('INFO  starting codex-service worker pool=4\r\n')).toBe(false);
    expect(hasAgentHint('cloning into /opt/claude-notes ...\r\n')).toBe(false);
    expect(hasAgentHint('auth: bearer token accepted for user 42\r\n')).toBe(false);
  });
});

describe('AGENT_ACTIVITY_DEFAULTS', () => {
  const d = AGENT_ACTIVITY_DEFAULTS;

  it('"이어짐" 기준이 "완료" 기준보다 느슨하다', () => {
    // Reversed, output just accepted as continuous would immediately count as done.
    expect(d.gapMs).toBeLessThan(d.idleMs);
  });

  it('억제 창이 완료 판정 시간보다 길다', () => {
    // Needed to collapse a BEL and an idle verdict for the same task into one.
    expect(d.idleMs).toBeLessThan(d.cooldownMs);
  });

  it('근거가 약한 판정에 더 긴 증거를 요구한다', () => {
    expect(d.minBusyMs).toBeLessThan(d.minStreamMs);
  });

  it('최소 작업 시간이 완료 판정 시간보다 길다', () => {
    // Reversed, the duration floor is meaningless: silence alone would always pass.
    expect(d.idleMs).toBeLessThan(d.minBusyMs);
  });
});

describe('shouldNotifyAgentDone', () => {
  const base = {
    tabActive: true,
    workspaceHidden: false,
    windowFocused: true,
    sinceUserInputMs: 1000,
    recentInputMs: 15000,
  };

  it('그 터미널을 방금 쓰고 있던 사람에게는 알리지 않는다', () => {
    expect(shouldNotifyAgentDone(base)).toBe(false);
  });

  it('창이 뒤에 있으면 알린다', () => {
    expect(shouldNotifyAgentDone({ ...base, windowFocused: false })).toBe(true);
  });

  it('다른 탭을 보고 있으면 알린다', () => {
    expect(shouldNotifyAgentDone({ ...base, tabActive: false })).toBe(true);
  });

  it('터미널이 아닌 뷰를 보고 있으면 알린다', () => {
    expect(shouldNotifyAgentDone({ ...base, workspaceHidden: true })).toBe(true);
  });

  it('화면에 떠 있어도 한동안 입력이 없었으면 알린다', () => {
    // Missing this case is what lost codex`s approval prompt entirely.
    expect(shouldNotifyAgentDone({ ...base, sinceUserInputMs: 60000 })).toBe(true);
    expect(shouldNotifyAgentDone({ ...base, sinceUserInputMs: Infinity })).toBe(true);
  });

  it('경계값: 임계 시간과 같으면 알린다', () => {
    expect(shouldNotifyAgentDone({ ...base, sinceUserInputMs: 15000 })).toBe(true);
    expect(shouldNotifyAgentDone({ ...base, sinceUserInputMs: 14999 })).toBe(false);
  });
});

describe('createAgentActivityDetector', () => {
  let events: AgentDoneEvent[];
  let busy: boolean[];

  beforeEach(() => {
    vi.useFakeTimers();
    events = [];
    busy = [];
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const make = (over: Partial<Parameters<typeof createAgentActivityDetector>[0]> = {}) =>
    createAgentActivityDetector({
      onDone: (e) => events.push(e),
      onBusyChange: (b) => busy.push(b),
      idleMs: 2000,
      minBusyMs: 4000,
      minStreamMs: 8000,
      gapMs: 1500,
      cooldownMs: 3000,
      ...over,
    });

  /** A spinner or stream refreshing every `every` ms for `ms` in total. */
  const stream = (
    d: ReturnType<typeof make>,
    chunk: string,
    ms: number,
    every = 500
  ) => {
    for (let elapsed = 0; elapsed < ms; elapsed += every) {
      d.feed(chunk);
      vi.advanceTimersByTime(every);
    }
  };

  it('스피너가 충분히 돌다 멈추면 완료로 알린다', () => {
    const d = make();
    stream(d, CODEX_FRAME, 6000);
    vi.advanceTimersByTime(2000);

    expect(events).toHaveLength(1);
    expect(events[0].reason).toBe('idle');
    expect(events[0].sawMarker).toBe(true);
    expect(events[0].busyMs).toBeGreaterThanOrEqual(4000);
    expect(busy).toEqual([true, false]);
    d.dispose();
  });

  it('짧게 스친 스피너는 알리지 않는다', () => {
    const d = make();
    stream(d, CLAUDE_FRAME, 2000);
    vi.advanceTimersByTime(2000);
    expect(events).toHaveLength(0);
    expect(busy).toEqual([true, false]); // 표시등은 정확히 켜졌다 꺼진다
    d.dispose();
  });

  it('스피너가 계속 갱신되는 동안에는 알리지 않는다', () => {
    const d = make();
    stream(d, CLAUDE_FRAME, 20000, 1000);
    expect(events).toHaveLength(0);
    expect(busy).toEqual([true]);
    d.dispose();
  });

  it('진행 힌트가 없어도 에이전트 세션의 출력 흐름이 멈추면 알린다', () => {
    // codex clearing the progress hint as it switches to an approval prompt:
    // exactly the case that was missed when relying on vendor wording alone.
    const d = make();
    d.feed('ubuntu@host:/opt/hermes$ codex\r\n'); // 에이전트 세션 확인
    vi.advanceTimersByTime(3000);
    stream(d, PLAIN_OUTPUT, 10000, 400); // 응답 스트리밍
    vi.advanceTimersByTime(2000); // 질문을 띄우고 멈춤

    expect(events).toHaveLength(1);
    expect(events[0].reason).toBe('idle');
    expect(events[0].sawMarker).toBe(false); // 벤더 문구 없이 잡았다
    d.dispose();
  });

  it('타이핑 때문에 생긴 TUI 리드로우는 작업으로 세지 않는다', () => {
    // False positive found in real use: a tui redraws its input box in several
    // chunks per keystroke, and the gaps between them look like output streaming,
    // which lit the header indicator while merely typing.
    const d = make();
    d.feed('$ codex\r\n');
    vi.advanceTimersByTime(3000);

    for (let key = 0; key < 40; key += 1) {
      d.noteUserInput();
      // three redraw chunks from one keystroke, arriving almost together
      d.feed('\x1b[2K\x1b[1G> hello');
      vi.advanceTimersByTime(5);
      d.feed('\x1b[38;5;245m');
      vi.advanceTimersByTime(5);
      d.feed(' world\x1b[0m');
      vi.advanceTimersByTime(290); // 다음 타건까지
    }
    vi.advanceTimersByTime(5000);

    expect(busy).toEqual([]); // 표시등이 켜지지 않는다
    expect(events).toHaveLength(0);
    d.dispose();
  });

  it('에코 창이 지난 뒤의 스트리밍은 정상적으로 잡는다', () => {
    // The agent response that starts after Enter is not echo.
    const d = make();
    d.feed('$ codex\r\n');
    vi.advanceTimersByTime(3000);
    d.noteUserInput(); // 엔터
    vi.advanceTimersByTime(800); // echoWindowMs(700) 경과
    stream(d, PLAIN_OUTPUT, 10000, 400);
    vi.advanceTimersByTime(2000);

    expect(events).toHaveLength(1);
    expect(events[0].sawMarker).toBe(false);
    d.dispose();
  });

  it('에이전트 세션이 아니면 출력 흐름만으로는 알리지 않는다', () => {
    const d = make();
    stream(d, 'INFO  request handled in 12ms\r\n', 30000, 300);
    vi.advanceTimersByTime(5000);
    expect(events).toHaveLength(0);
    d.dispose();
  });

  it('진행 힌트 없는 판정에는 더 긴 지속 시간을 요구한다', () => {
    const d = make();
    d.feed('$ claude\r\n');
    vi.advanceTimersByTime(3000);
    stream(d, PLAIN_OUTPUT, 5000, 400); // 5초 < minStreamMs(8초)
    vi.advanceTimersByTime(2000);
    expect(events).toHaveLength(0);
    d.dispose();
  });

  it('출력 간격이 넓으면 이어진 작업으로 보지 않는다', () => {
    const d = make();
    d.feed('$ codex\r\n');
    vi.advanceTimersByTime(3000);
    for (let i = 0; i < 10; i += 1) {
      d.feed(PLAIN_OUTPUT); // 한 줄씩 뜸하게 (모니터링 출력 같은 모양)
      vi.advanceTimersByTime(3000); // gapMs(1.5초)보다 넓다
    }
    expect(events).toHaveLength(0);
    expect(busy).toEqual([]);
    d.dispose();
  });

  it('사용자 입력은 작업 구간을 끊는다', () => {
    // Fast typing produces back-to-back echo, which is not work.
    const d = make();
    d.feed('$ codex\r\n');
    vi.advanceTimersByTime(3000);
    for (let i = 0; i < 40; i += 1) {
      d.noteUserInput();
      d.feed('x'); // 키 에코
      vi.advanceTimersByTime(300); // 12초간 타이핑
    }
    vi.advanceTimersByTime(5000);
    expect(events).toHaveLength(0);
    d.dispose();
  });

  it('청크가 마커 중간에서 끊겨도 잡는다', () => {
    const d = make();
    d.feed('⠋ Working  Esc to in');
    d.feed('terrupt\x1b[0m');
    vi.advanceTimersByTime(2000);
    expect(events).toHaveLength(0); // 아직 minBusyMs 미달

    stream(d, CODEX_FRAME, 6000);
    vi.advanceTimersByTime(2000);
    expect(events.map((e) => e.reason)).toEqual(['idle']);
    d.dispose();
  });

  it('BEL은 일하고 있었을 때만 완료로 본다', () => {
    const d = make();
    d.signal('bell'); // 탭 완성 실패 등: 무시
    expect(events).toHaveLength(0);

    d.feed(CODEX_FRAME);
    vi.advanceTimersByTime(500);
    d.signal('bell'); // 작업 중 울린 벨 = 완료. minBusyMs와 무관하다.
    expect(events.map((e) => e.reason)).toEqual(['bell']);
    d.dispose();
  });

  it('BEL 뒤 idle 타이머가 중복으로 알리지 않는다', () => {
    const d = make();
    stream(d, CODEX_FRAME, 6000);
    d.signal('bell');
    vi.advanceTimersByTime(10000);
    expect(events).toHaveLength(1);
    d.dispose();
  });

  it('OSC 알림은 일하던 중이 아니어도 그대로 전달한다', () => {
    const d = make();
    d.signal('osc', 'Claude needs your input');
    expect(events).toEqual([
      {
        reason: 'osc',
        busyMs: 0,
        body: 'Claude needs your input',
        sawMarker: false,
        sinceUserInputMs: Infinity, // 입력이 없었다 = 사용자가 앞에 있다는 근거도 없다
      },
    ]);
    d.dispose();
  });

  it('쿨다운 안의 중복 신호는 버린다', () => {
    const d = make();
    d.signal('osc', 'first');
    vi.advanceTimersByTime(1000);
    d.signal('osc', 'second');
    expect(events.map((e) => e.body)).toEqual(['first']);

    vi.advanceTimersByTime(3000);
    d.signal('osc', 'third');
    expect(events.map((e) => e.body)).toEqual(['first', 'third']);
    d.dispose();
  });

  it('연결이 끊기면 대기 중이던 완료 판정을 버린다', () => {
    // The remote sshd SIGHUPs the agent the moment the link drops, so a busy window left
    // open at that point must not become a completion for work that no longer exists.
    const d = make();
    d.feed('$ codex\r\n');
    vi.advanceTimersByTime(3000);
    stream(d, CODEX_FRAME, 6000);

    d.resetForNewSession(); // the session closed
    vi.advanceTimersByTime(10000);

    expect(events).toHaveLength(0);
    expect(busy[busy.length - 1]).toBe(false); // the indicator goes out with the session
    d.dispose();
  });

  it('재접속 뒤에도 완료를 정상적으로 잡는다', () => {
    // Regression: with no reset the phantom completion above set the cooldown, and a
    // reconnect landing inside that window swallowed the notification that mattered.
    const d = make();
    d.feed('$ codex\r\n');
    vi.advanceTimersByTime(3000);
    stream(d, CODEX_FRAME, 6000);
    d.resetForNewSession(); // dropped
    vi.advanceTimersByTime(1000); // reconnected well inside the cooldown

    stream(d, CODEX_FRAME, 6000); // the reattached agent works, then stops
    vi.advanceTimersByTime(2000);

    expect(events.map((e) => e.reason)).toEqual(['idle']);
    d.dispose();
  });

  it('이전 세션의 꼬리가 새 세션 첫 청크와 이어지지 않는다', () => {
    // Otherwise the tail of a dead session could complete a marker in the new one.
    const d = make();
    d.feed('⠋ Working  Esc to in');
    d.resetForNewSession();
    d.feed('terrupt\x1b[0m');
    vi.advanceTimersByTime(5000);

    expect(busy).toEqual([]); // no busy window was ever opened
    d.dispose();
  });

  it('dispose 후에는 아무것도 알리지 않는다', () => {
    const d = make();
    stream(d, CODEX_FRAME, 6000);
    d.dispose();
    vi.advanceTimersByTime(10000);
    d.signal('osc', 'x');
    expect(events).toHaveLength(0);
    expect(busy[busy.length - 1]).toBe(false); // 표시등은 꺼진 상태로 남는다
  });
});
