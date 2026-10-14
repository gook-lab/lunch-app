import { describe, expect, it } from 'vitest';
import { BOARD_H, buildCourse, type PinballTheme } from '../../lib/pinball';
import { drawTable, inBand } from './pinballDraw';

/** 그리기 호출만 세는 가짜 캔버스. 그림자를 켠 횟수(shadowBlur > 0)와 원 그리기 수를 센다. */
function countingCtx() {
  const n = { arc: 0, ellipse: 0, shadow: 0 };
  const gradient = { addColorStop() {} };
  const target: Record<string, unknown> = {
    arc: () => n.arc++,
    ellipse: () => n.ellipse++,
    createLinearGradient: () => gradient,
    createRadialGradient: () => gradient,
    measureText: () => ({ width: 10 }),
  };
  const ctx = new Proxy(target, {
    get: (t, k: string) => (k in t ? t[k] : () => {}),
    set: (t, k: string, v) => {
      if (k === 'shadowBlur' && v > 0) n.shadow++;
      t[k] = v;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
  return { ctx, n };
}

describe('핀볼 판 — 창 밖은 그리지 않는다', () => {
  it('구간 판단은 양 끝을 포함한다', () => {
    const v = { top: 100, bottom: 200 };
    expect(inBand(v, 50, 100)).toBe(true);
    expect(inBand(v, 200)).toBe(true);
    expect(inBand(v, 201, 260)).toBe(false);
    expect(inBand(v, 0, 99)).toBe(false);
  });

  // 판 전체(1,700px 넘음)를 매 프레임 그리면 휴대폰에서 프레임이 떨어졌다(10/15). 창 440px 만큼만 그린다.
  it.each<PinballTheme>(['casino', 'space', 'jungle'])('%s 테마: 창만 그리면 원·그림자가 판 전체보다 훨씬 적다', (theme) => {
    const course = buildCourse(theme);
    const all = countingCtx();
    drawTable(all.ctx, theme, course, 0, true);
    const part = countingCtx();
    drawTable(part.ctx, theme, course, 0, true, { top: 600 - 40, bottom: 600 + 440 + 40 });
    const total = (n: typeof all.n) => n.arc + n.ellipse + n.shadow;
    expect(total(all.n)).toBeGreaterThan(0);
    expect(total(part.n)).toBeLessThan(total(all.n) * ((440 + 80) / BOARD_H) + 20);
  });
});
