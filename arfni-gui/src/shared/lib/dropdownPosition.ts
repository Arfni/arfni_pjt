export interface Rect {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

export interface Viewport {
  width: number;
  height: number;
}

export interface DropdownPosition {
  top: number;
  left: number;
  maxHeight: number;
  /** 아래 공간이 부족해 위로 뒤집었는지 */
  flipped: boolean;
}

const MARGIN = 8;

/**
 * 앵커 버튼 기준으로 고정 위치 드롭다운의 좌표를 계산한다.
 *
 * 앱 셸이 `html, body, #root { overflow: hidden }` 이고 레이아웃 곳곳이 `overflow-hidden`이라
 * absolute 드롭다운은 어느 조상에선가 반드시 잘린다. 그래서 body로 포털한 뒤
 * `position: fixed`로 띄우고, 좌표는 여기서 뷰포트에 맞춰 접어 넣는다.
 */
export function computeDropdownPosition(
  anchor: Rect,
  viewport: Viewport,
  menu: { width: number; maxHeight: number }
): DropdownPosition {
  const spaceBelow = viewport.height - anchor.bottom - MARGIN;
  const spaceAbove = anchor.top - MARGIN;

  // 아래가 좁고 위가 더 넓을 때만 뒤집는다.
  const flipped = spaceBelow < Math.min(menu.maxHeight, 160) && spaceAbove > spaceBelow;

  const available = Math.max(0, flipped ? spaceAbove : spaceBelow);
  const maxHeight = Math.max(0, Math.min(menu.maxHeight, available));

  const top = flipped ? Math.max(MARGIN, anchor.top - maxHeight) : anchor.bottom;

  // 왼쪽 정렬하되 오른쪽으로 넘치면 당겨온다.
  const left = Math.max(
    MARGIN,
    Math.min(anchor.left, viewport.width - menu.width - MARGIN)
  );

  return { top, left, maxHeight, flipped };
}
