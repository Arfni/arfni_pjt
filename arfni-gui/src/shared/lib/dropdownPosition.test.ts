import { describe, expect, it } from 'vitest';
import { computeDropdownPosition } from './dropdownPosition';

const viewport = { width: 1280, height: 800 };
const menu = { width: 256, maxHeight: 288 };

const anchor = (over: Partial<Record<'top' | 'bottom' | 'left' | 'right', number>> = {}) => ({
  top: 100,
  bottom: 132,
  left: 300,
  right: 340,
  ...over,
});

describe('computeDropdownPosition', () => {
  it('기본은 앵커 바로 아래, 왼쪽 정렬', () => {
    const p = computeDropdownPosition(anchor(), viewport, menu);
    expect(p.top).toBe(132);
    expect(p.left).toBe(300);
    expect(p.flipped).toBe(false);
  });

  it('아래 공간에 맞춰 높이를 줄인다', () => {
    // 창이 짧으면 잘리는 대신 스크롤 가능한 높이로 접는다
    const p = computeDropdownPosition(anchor({ top: 500, bottom: 532 }), { width: 1280, height: 700 }, menu);
    expect(p.maxHeight).toBe(700 - 532 - 8);
    expect(p.flipped).toBe(false);
  });

  it('아래가 좁고 위가 넓으면 위로 뒤집는다', () => {
    const p = computeDropdownPosition(
      anchor({ top: 600, bottom: 632 }),
      { width: 1280, height: 700 },
      menu
    );
    expect(p.flipped).toBe(true);
    // 뒤집힌 메뉴의 아래끝이 앵커 위에 닿아야 한다
    expect(p.top + p.maxHeight).toBeLessThanOrEqual(600);
  });

  it('위가 더 좁으면 뒤집지 않는다', () => {
    const p = computeDropdownPosition(
      anchor({ top: 30, bottom: 62 }),
      { width: 1280, height: 200 },
      menu
    );
    expect(p.flipped).toBe(false);
  });

  it('오른쪽으로 넘치면 왼쪽으로 당겨온다', () => {
    const p = computeDropdownPosition(anchor({ left: 1200, right: 1240 }), viewport, menu);
    expect(p.left).toBe(1280 - 256 - 8);
    expect(p.left + menu.width).toBeLessThanOrEqual(viewport.width);
  });

  it('창이 메뉴보다 좁아도 화면 밖으로 나가지 않는다', () => {
    const p = computeDropdownPosition(anchor({ left: 10, right: 50 }), { width: 200, height: 800 }, menu);
    expect(p.left).toBeGreaterThanOrEqual(0);
  });

  it('높이는 음수가 되지 않는다', () => {
    const p = computeDropdownPosition(
      anchor({ top: 780, bottom: 800 }),
      { width: 1280, height: 800 },
      menu
    );
    expect(p.maxHeight).toBeGreaterThanOrEqual(0);
    expect(p.top).toBeGreaterThanOrEqual(0);
  });
});
