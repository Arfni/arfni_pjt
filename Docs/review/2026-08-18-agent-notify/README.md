# 터미널 에이전트 완료 알림 — 설계 기록 및 리뷰

- 대상: `arfni-gui` SSH 터미널에서 claude / codex 등 코딩 에이전트의 작업 완료 알림
- 기준 커밋: `71ebd7c` (브랜치 `develop`)
- 검증: 테스트 125개 통과(감지기 27개), `tsc --noEmit` 통과, 릴리스 번들 빌드 성공
- 같은 디렉터리의 `index.html`은 이 문서의 대화형 버전(문제 10개 포함)이다.

> 이 문서를 저장소에 넣는 이유: 설계 근거가 채팅이나 브라우저 탭에만 있으면 사라진다.
> 임계값 하나를 왜 그 숫자로 뒀는지는 6개월 뒤에 반드시 문제가 되므로 코드와 같은 곳에 둔다.

---

## 1. 문제

PTY(가상 터미널)는 "명령이 끝났다"를 알려주지 않는다. claude/codex는 셸을 떠나지 않는
**하나의 장수 프로세스**라서 프로세스 종료도, 새 셸 프롬프트도 완료 신호가 되지 못한다.
우리가 가진 것은 SSH PTY로 흘러오는 바이트 스트림 하나뿐이다.

## 2. 신호 4종 (신뢰도 순)

| # | 신호 | 정체 | 신뢰도 | 지연 |
|---|------|------|--------|------|
| 1 | OSC 9 / OSC 777 | 에이전트가 명시적으로 쏘는 데스크톱 알림 이스케이프 시퀀스 | 확실 | 즉시 |
| 2 | BEL (0x07) | claude `terminal_bell` 알림 채널 | 높음 (셸 탭완성 실패에도 울림) | 즉시 |
| 3 | 진행 표시 소멸 | `esc to interrupt` 힌트가 재렌더되다 끊김 | 중간 (문구가 바뀌면 죽음) | ~2초 |
| 4 | 출력 정지 | 에이전트 세션에서 출력이 흐르다 조용해짐 (**벤더 문구 무관**) | 중간 (보수적 임계값으로 보정) | ~2초 |

**4번을 추가한 이유**: 최초 구현은 3번 하나에 전부를 걸었다. codex가 승인 질문 화면으로
넘어가며 힌트를 지우자 감지가 통째로 죽어 `"이 설계로 진행해도 될까요?"`를 놓쳤다.
문구는 버전마다 바뀌지만 "출력이 흐르다 멈춘다"는 어떤 에이전트든 예외가 없다.

## 3. 상태 기계

```
                     ┌──────────── noteUserInput() (사용자 키 입력) ────────────┐
                     ↓                                                         │
 ┌────────┐  마커 발견 또는 (에이전트 세션 && 출력 간격 ≤ gapMs)   ┌────────┐    │
 │  IDLE  │ ───────────────────────────────────────────────────→ │  BUSY  │ ───┘
 └────────┘                                                      └────────┘
      ↑                                                               │
      │                                        출력이 idleMs(2s) 동안 끊김
      │                                                               ↓
      │                                                   ┌──────────────────────┐
      │              지속시간 부족 → 조용히 IDLE 복귀        │ floor = 마커 봤나?    │
      └────────────────────────────────────────────────── │  예 → 4s, 아니오 → 8s │
                                                          └──────────────────────┘
                                                                     │ 통과
                                                   쿨다운 3s 내 중복? ─┤
                                                                     ↓ 아니오
                                                              onDone() 발화
                                                                     ↓
                                       shouldNotifyAgentDone(탭·창·입력) 판단
                                          ↓                            ↓
                                  알림 생략 (사람이 앞에 있음)     토스트 + 탭 배지 + 작업표시줄 깜빡임
```

## 4. 데이터 경로

```
Rust reader 스레드 (8KB 버퍼)
 └─ ssh:data 이벤트 (base64)
     └─ sshDataBus → attachSink
         ├─ TextDecoder(stream) → detector.feed(text)   ← 감지 전용, 화면 출력에 영향 없음
         │    ├─ 관문 1회 스캔 (통과 못하면 즉시 종료 = 대부분의 청크)
         │    ├─ 에이전트 세션 확정 여부 갱신
         │    ├─ 진행 마커 검사 → BUSY 갱신 + idle 타이머 재설정
         │    └─ 마커 없으면 출력 간격으로 연속성 판정
         └─ term.write(bytes) → xterm.js 렌더
```

## 5. 임계값과 근거

전부 **측정된 물리량이 아니라 트레이드오프 선택**이다. 근거 등급을 함께 적는다.

| 상수 | 값 | 역할 | 이 값인 이유 | 낮추면 | 올리면 | 근거 등급 |
|------|----|------|--------------|--------|--------|-----------|
| `gapMs` | 1.5s | "출력이 이어진다"의 기준 | 토큰 스트리밍은 수십~수백 ms 간격. SSH 왕복 지연 + 서버 지터 흡수 여유 | 스트리밍이 끊길 때마다 구간이 쪼개져 미탐 | 무관한 출력까지 한 작업으로 이어붙여 오탐 | 관찰 기반 추정 |
| `idleMs` | 2s | 완료로 판정하는 침묵 길이 | 스피너 재렌더 주기(100ms~1s)의 2배 이상이어야 살아있는 작업을 오판하지 않음 | 지터·버퍼링에 오탐 | 알림이 늦음 | 관찰 기반 추정 |
| `minBusyMs` | 4s | 마커를 봤을 때 최소 작업 시간 | 4초 미만은 사용자가 화면 보며 기다리는 체감 범위 → 알리면 소음 | 짧은 질문에도 토스트 → 알림 피로 | 짧은 작업 완료를 놓침 | **순수 판단 (조정 후보)** |
| `minStreamMs` | 8s | 마커 없이 판정할 때 최소 작업 시간 | 벤더 근거가 없으므로 의도적으로 `minBusyMs`의 2배 | 로그 스트림 정지를 완료로 오인 | 실제 완료를 놓침 | **순수 판단 (조정 후보)** |
| `cooldownMs` | 3s | 중복 발화 억제 | BEL과 idle 두 경로를 하나로 묶으려면 `idleMs`보다 커야 함 (2s + 여유 1s) | 한 작업에 알림 2개 | 연속 작업의 두 번째 완료를 삼킴 | 구조적 제약 |
| `RECENT_INPUT_MS` | 15s | "사람이 앞에 있다"고 보는 창 | 입력 직후 15초는 프롬프트를 읽고 반응하는 범위 | 타이핑 직후 토스트가 방해 | **자리 비운 사용자를 "보고 있다"고 오판 → 이번 사고의 원인** | 관찰 기반 추정 |
| `TAIL_KEEP` | 80자 | 청크 경계에 걸린 마커 복원 | 최장 마커 약 30자(+ANSI)의 2배 여유 | 경계에서 잘린 마커를 놓침 | 비용 증가(미미) | 최댓값 계산 |

### 지켜야 하는 불변식

```
gapMs (1.5s)  <  idleMs (2s)  <  cooldownMs (3s)
minBusyMs (4s)  <  minStreamMs (8s)
```

- `gapMs < idleMs` — "이어짐" 기준이 "완료" 기준보다 느슨해야 한다. 뒤집히면 연속으로 인정한 출력이 곧바로 완료로 판정된다.
- `idleMs < cooldownMs` — 완료 판정 시간보다 억제 창이 길어야 같은 작업의 중복 신호를 묶는다.
- `minBusyMs < minStreamMs` — 근거가 약한 판정에 더 긴 증거를 요구한다.

> 이 불변식은 아직 테스트로 고정되지 않았다. 상수를 만지는 사람이 뒤집을 수 있는 구멍이다. (9장 참고)

## 6. 휴리스틱

**휴리스틱** = 정답을 보장하지 못하지만 대부분 충분히 맞는 경험적 규칙. 정확한 답을 구하는 비용이
지나치게 크거나 불가능할 때 쓴다. 핵심은 맞다/틀리다가 아니라 **틀리는 방향과 그 대가를 내가 고르는 것**이다.

| 휴리스틱 | 가정 | 오탐 방향 | 미탐 방향 | 완충 장치 |
|----------|------|-----------|-----------|-----------|
| 진행 힌트 소멸 = 완료 | CLI가 힌트를 계속 재렌더한다 | 렌더 1회 지연 시 오판 | 문구 변경·화면 폭 부족 | `idleMs` 2초 + 4번 신호로 이중화 |
| 출력 정지 = 완료 | 에이전트는 응답을 연달아 뱉는다 | 긴 로그가 조용해질 때 | 1.5초 넘게 벌어지는 초저속 응답 | 세션 확정 요구 + `minStreamMs` 8초 |
| 명령 에코 = 에이전트 세션 | 프롬프트 뒤 `codex`는 실행 의도 | 로그 본문에 이름이 스칠 때(→ 프롬프트 위치 요구로 차단) | tmux 복원 세션처럼 에코를 못 본 경우 | 마커·`tokens used`·`⏎ send`로 우회 확정 |
| BEL = 완료 | 에이전트만 벨을 울린다 | 탭완성 실패, `printf '\a'` | 알림 채널을 끈 사용자 | "작업 중이었을 때만" 인정 |
| 15초 내 입력 = 사람이 앞에 있음 | 방금 타이핑했으면 화면을 본다 | 타이핑 후 즉시 자리를 뜬 경우 | — | 탭 배지는 조건 없이 항상 남김 |

**설계 원칙**: 이 기능에서 미탐(놓침)은 오탐(과잉 알림)보다 훨씬 비싸다. 놓치면 에이전트가 승인 질문
앞에서 몇 시간 멈춰 있고, 과잉이면 토스트 하나가 거슬릴 뿐이다. 그래서 애매하면 알리는 쪽으로 기울이고,
대신 헤더 표시등과 탭 배지로 사용자가 직접 검증할 수 있게 했다.

## 7. 변경 목록

| 파일 | 상태 | 내용 |
|------|------|------|
| `src/pages/logs/model/agentActivity.ts` | 신규 | 감지기 본체(순수 로직), 지문 테이블, 관문 생성, `shouldNotifyAgentDone` |
| `src/pages/logs/model/agentActivity.test.ts` | 신규 | 테스트 27개 (가짜 타이머로 시간 제어) |
| `src/shared/lib/desktopNotify.ts` | 신규 | OS 토스트 + 작업표시줄 깜빡임. 권한은 **허용만** 캐시 |
| `src/pages/logs/ui/TerminalView.tsx` | 수정 +71 | BEL·OSC 핸들러, 스트림 디코더 급여, 키 입력 훅, `● 작업 중` 표시등 |
| `src/pages/logs/ui/TerminalWorkspace.tsx` | 수정 +83 | 알림 정책 호출, 탭 벨 배지, 닫힌 탭 상태 정리 |
| `src/shared/config/i18n/locales/{ko,en}/logs.json` | 수정 | 문구 6종 (하드코딩 문자열 없음) |
| `src-tauri/Cargo.toml`, `src/main.rs` | 수정 | `tauri-plugin-notification` 추가·등록 |
| `src-tauri/capabilities/default.json` | 수정 | `notification:default`, `core:window:allow-request-user-attention` |
| `package.json`, `package-lock.json` | 수정 | `@tauri-apps/plugin-notification@2.3.3` |

### 자체 리뷰에서 잡아 고친 결함 6개

1. **관문 정규식 이중 관리** — 지문 목록과 사전 필터가 따로 있어, 지문을 추가하며 필터를 빠뜨리면 그 지문이 영원히 매칭되지 않는데 테스트는 통과했다. 한 자리에 묶고 관문은 생성하게 바꿈.
2. **벤더 이름만으로 세션 판정** — `INFO starting codex-service` 로그 한 줄로 세션이 확정되면 이후 로그가 멈출 때마다 알림. 프롬프트/런처 위치에서만 인정하도록 좁힘.
3. **관문 이중 스캔** — 8KB를 두 번 훑었다. 세션 확정 여부에 따라 좁은 관문으로 교체(7.8µs → 3.5µs).
4. **알림 판단이 React 콜백에 박혀 검증 불가** — 순수 함수로 추출 + 경계값 테스트 6개.
5. **탭을 닫아도 배지 상태가 남음** — 죽은 `tabId` 정리 추가.
6. **권한 거부를 캐시** — 나중에 OS에서 알림을 켜도 재시작 전까지 영원히 조용. 허용만 캐시.

## 8. 성능 실측

8KB 청크(Rust reader 버퍼와 동일), Intel Ultra 7 155H.

| 경로 | 비용 | 처리량 | 의미 |
|------|------|--------|------|
| 로그 홍수 — 세션 확정 후(정상 상태) | 3.49 µs/8KB | 2,237 MB/s | 10 MB/s 스트림에서 코어의 0.04% |
| 로그 홍수 — 세션 미확정 | 7.31 µs/8KB | 1,069 MB/s | 벤더 이름 리터럴 6개 추가 스캔 |
| 실제 스피너 프레임(65B, 초당 10회) | 1.40 µs/frame | — | 코어의 0.0014% |
| (참고) UTF-8 디코드만 | 0.9 µs/8KB | 8,440 MB/s | 감지기보다 먼저 지불되던 비용 |

상시 점유: 세션당 꼬리 문자 80자 + 타이머 핸들 1개. 폴링·추가 스레드·추가 IPC 없음.
Rust 데이터 경로는 변경되지 않았다.

## 9. 남은 위험

- **임계값 불변식이 테스트로 고정되지 않았다.** 누가 `gapMs`를 3초로 올리면 조용히 오탐 기계가 된다. 불변식 테스트 추가가 다음 작업으로 맞다.
- **UI 배선은 테스트가 없다.** 순수 로직만 27개로 덮었다. OSC 핸들러 등록·표시등은 실기기 확인에 의존한다.
- **실제 codex/claude 출력으로 4번 신호를 검증하지 못했다.** 테스트는 재현한 프레임 문자열이다. 헤더 `● 작업 중` 표시등을 넣은 이유가 이것이다.
- **에이전트 세션에서 `docker logs -f`를 8초 이상 돌리다 멈추면** 완료 알림이 뜰 수 있다. 의도한 트레이드오프.
- **Windows 토스트 권한**은 첫 알림 때 확인된다. 거부 상태면 배지만 남는다.

## 10. 이 리뷰 방식의 정식 명칭

세 가지 관행의 조합이다.

1. **Pre-commit self-review** — 커밋 전에 자기 diff를 처음 보는 리뷰어처럼 읽는다. git에서는 `git add -p`(조각 단위 스테이징)가 이를 강제한다.
2. **Atomic commits** — 커밋 하나 = 작업 하나. 되돌릴 때 다른 변경을 함께 잃지 않고 `git bisect`·체리픽이 의미를 갖는다. 한 기능에 여러 파일이 필요한 것은 정상이고, **무관한 파일이 섞이는 것**이 문제다.
3. **Conventional Commits** — `<type>(<scope>): <description>`. `feat`→MINOR, `fix`→PATCH, `BREAKING CHANGE`→MAJOR로 SemVer/CHANGELOG 자동화. 이 저장소는 이미 이 규약을 쓴다(`feat(cicd): …`, `chore: bump version to 0.4.0`).

각 커밋이 그 자체로 빌드·테스트를 통과하게 순서를 잡으면 **bisectable history**를 얻는다.

## 11. 커밋 계획 (4개, 순서 중요)

의존성 → 순수 로직 → UI 배선 → 문서 순서. 이 순서면 중간 커밋에서도 빌드와 테스트가 통과한다.

> **`git add -A` 금지.** 작업 트리에 진행 중인 다른 작업(`cicd.rs`, `sftp.rs`, `CICDSetupModal.tsx`,
> `SftpPanel.tsx`)과 재빌드된 `.exe`가 섞여 있다. 반드시 경로를 지정해서 담는다.

```bash
# 1) 의존성/권한
git add arfni-gui/src-tauri/Cargo.toml arfni-gui/src-tauri/src/main.rs \
        arfni-gui/src-tauri/capabilities/default.json \
        arfni-gui/package.json arfni-gui/package-lock.json
git commit -m "chore(tauri): add notification plugin and window attention permission"

# 2) 순수 로직 + 테스트
git add arfni-gui/src/pages/logs/model/agentActivity.ts \
        arfni-gui/src/pages/logs/model/agentActivity.test.ts
git commit -m "feat(terminal): detect coding-agent completion from pty output"

# 3) UI 배선
git add arfni-gui/src/shared/lib/desktopNotify.ts \
        arfni-gui/src/pages/logs/ui/TerminalView.tsx \
        arfni-gui/src/pages/logs/ui/TerminalWorkspace.tsx \
        arfni-gui/src/shared/config/i18n/locales/ko/logs.json \
        arfni-gui/src/shared/config/i18n/locales/en/logs.json
git commit -m "feat(terminal): notify when an agent task finishes"

# 4) 설계 기록 (이 문서 + 대화형 리뷰 페이지)
git add Docs/review/2026-08-18-agent-notify
git commit -m "docs(terminal): record agent completion detection design and review"

git log --oneline -4
git push origin develop
```

## 12. 리뷰 페이지 다시 열기

```bash
# Windows
start Docs\review\2026-08-18-agent-notify\index.html
```
