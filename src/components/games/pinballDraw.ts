/**
 * 핀볼 판 그리기 — 테마별 색과 장식. 물리와 무관한 모양만 여기 있다.
 *
 * 색은 MODUL 토큰이 아니라 캔버스 전용 팔레트다(구슬 색처럼 구분용). 캔버스는
 * CSS 변수를 못 읽고, 판은 라이트·다크와 상관없이 늘 어두운 기계 판이다.
 * 빛은 왼쪽 위에서 온다고 보고 그림자를 오른쪽 아래로 떨어뜨린다.
 */
import {
  BOARD_H,
  COURSE_W,
  FINISH_Y,
  orbiterPegs,
  type Course,
  type Orbiter,
  type PinballTheme,
  type Portal,
  type Wall,
  type Well,
  type Zone,
} from '../../lib/pinball';
import { seededRandom } from '../../lib/random';

export const SHADOW_DX = 2;
export const SHADOW_DY = 3;
/** 깔때기가 시작되는 높이. 여기서부터 바닥을 붉게 물들인다. 모든 테마가 같다. */
export const FUNNEL_Y = 1638;
const MARBLE_R = 7;

export interface Palette {
  table: [number, string][];
  label: string;
  /** 숫자 구간 이름은 크게, 글자 이름은 작게. */
  labelFont: string;
  border: string;
  rail: string;
  railHi: string;
  post: string;
  sling: string;
  spinner: string;
  hub: string;
  bumper: string;
  bumperGlow: string;
  capHi: string;
  capLo: string;
  peg: string;
  zone: string;
  panel: string;
  minimap: string;
}

export const PALETTES: Record<PinballTheme, Palette> = {
  classic: {
    table: [[0, 'oklch(0.2 0.06 285)'], [0.45, 'oklch(0.3 0.09 285)'], [0.75, 'oklch(0.26 0.09 300)'], [1, 'oklch(0.24 0.1 20)']],
    label: 'oklch(0.85 0.03 285 / 0.18)',
    labelFont: '700 22px ui-monospace, monospace',
    border: 'oklch(0.7 0.02 260)',
    rail: 'oklch(0.72 0.02 260)',
    railHi: 'oklch(0.95 0.01 260)',
    post: 'oklch(0.82 0.13 195)',
    sling: 'oklch(0.72 0.2 25)',
    spinner: 'oklch(0.85 0.17 90)',
    hub: 'oklch(0.3 0.05 90)',
    bumper: 'oklch(0.62 0.24 350)',
    bumperGlow: 'oklch(0.7 0.25 350)',
    capHi: 'oklch(0.97 0.03 90)',
    capLo: 'oklch(0.75 0.15 80)',
    peg: 'oklch(0.82 0.13 195)',
    zone: 'oklch(0.8 0.15 195 / 0.16)',
    panel: 'oklch(0.13 0.02 280)',
    minimap: 'oklch(0.22 0.05 285)',
  },
  space: {
    table: [[0, 'oklch(0.13 0.04 270)'], [0.4, 'oklch(0.17 0.07 295)'], [0.75, 'oklch(0.14 0.06 250)'], [1, 'oklch(0.18 0.08 20)']],
    label: 'oklch(0.85 0.08 300 / 0.32)',
    labelFont: '800 11px system-ui, sans-serif',
    border: 'oklch(0.6 0.05 270)',
    rail: 'oklch(0.7 0.04 250)',
    railHi: 'oklch(0.95 0.03 250)',
    post: 'oklch(0.85 0.12 230)',
    sling: 'oklch(0.75 0.2 330)',
    spinner: 'oklch(0.9 0.1 200)',
    hub: 'oklch(0.3 0.05 230)',
    bumper: 'oklch(0.68 0.17 50)',
    bumperGlow: 'oklch(0.75 0.18 50)',
    capHi: 'oklch(0.95 0.05 80)',
    capLo: 'oklch(0.6 0.15 35)',
    peg: 'oklch(0.85 0.06 260)',
    zone: 'oklch(0.75 0.15 300 / 0.15)',
    panel: 'oklch(0.11 0.03 270)',
    minimap: 'oklch(0.18 0.06 285)',
  },
  jungle: {
    table: [[0, 'oklch(0.3 0.07 150)'], [0.45, 'oklch(0.36 0.09 140)'], [0.75, 'oklch(0.29 0.07 165)'], [1, 'oklch(0.27 0.08 60)']],
    label: 'oklch(0.95 0.08 120 / 0.35)',
    labelFont: '800 11px system-ui, sans-serif',
    border: 'oklch(0.5 0.08 60)',
    rail: 'oklch(0.55 0.09 60)',
    railHi: 'oklch(0.75 0.08 70)',
    post: 'oklch(0.82 0.17 130)',
    sling: 'oklch(0.75 0.18 40)',
    spinner: 'oklch(0.72 0.16 140)',
    hub: 'oklch(0.35 0.06 60)',
    bumper: 'oklch(0.78 0.16 90)',
    bumperGlow: 'oklch(0.85 0.17 95)',
    capHi: 'oklch(0.97 0.06 100)',
    capLo: 'oklch(0.65 0.14 70)',
    peg: 'oklch(0.6 0.08 60)',
    zone: 'oklch(0.8 0.1 230 / 0.32)',
    panel: 'oklch(0.18 0.04 150)',
    minimap: 'oklch(0.28 0.07 150)',
  },
  casino: {
    table: [[0, 'oklch(0.21 0.05 20)'], [0.45, 'oklch(0.27 0.09 25)'], [0.75, 'oklch(0.22 0.06 350)'], [1, 'oklch(0.2 0.07 20)']],
    label: 'oklch(0.88 0.12 85 / 0.38)',
    labelFont: '800 11px system-ui, sans-serif',
    border: 'oklch(0.8 0.13 85)',
    rail: 'oklch(0.78 0.13 85)',
    railHi: 'oklch(0.96 0.06 90)',
    post: 'oklch(0.86 0.15 85)',
    sling: 'oklch(0.7 0.2 150)',
    spinner: 'oklch(0.86 0.15 85)',
    hub: 'oklch(0.3 0.05 85)',
    bumper: 'oklch(0.58 0.22 25)',
    bumperGlow: 'oklch(0.66 0.23 25)',
    capHi: 'oklch(0.99 0 0)',
    capLo: 'oklch(0.85 0.03 25)',
    peg: 'oklch(0.86 0.15 85)',
    zone: 'oklch(0.86 0.15 85 / 0.14)',
    panel: 'oklch(0.14 0.03 20)',
    minimap: 'oklch(0.24 0.06 20)',
  },
};

/** 판 장식에 쓰는 고정 무늬(별·잎). 판마다 같다. */
const SPECKS = (() => {
  const r = seededRandom(20261012);
  return Array.from({ length: 140 }, () => ({ x: r() * COURSE_W, y: r() * FUNNEL_Y, s: r(), a: r() * Math.PI * 2 }));
})();

export function drawTable(ctx: CanvasRenderingContext2D, theme: PinballTheme, course: Course, now: number, still: boolean) {
  const pal = PALETTES[theme];
  const g = ctx.createLinearGradient(0, 0, 0, BOARD_H);
  for (const [at, c] of pal.table) g.addColorStop(at, c);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, COURSE_W, BOARD_H);

  ctx.save();
  if (theme === 'space') {
    // 별. 반짝인다.
    for (const p of SPECKS) {
      const tw = still ? 0.6 : 0.45 + 0.4 * Math.sin(now / 400 + p.a * 3);
      ctx.fillStyle = `oklch(0.95 0.03 ${200 + p.s * 120} / ${tw * (0.4 + p.s * 0.6)})`;
      ctx.fillRect(p.x, p.y, 1 + p.s * 1.4, 1 + p.s * 1.4);
    }
  } else if (theme === 'jungle') {
    // 잎. 판 가장자리에 많다.
    for (const p of SPECKS) {
      const edge = p.x < 30 || p.x > COURSE_W - 30;
      if (!edge && p.s < 0.6) continue;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.a);
      ctx.fillStyle = `oklch(${0.42 + p.s * 0.15} 0.12 ${130 + p.s * 30} / 0.55)`;
      ctx.beginPath();
      ctx.ellipse(0, 0, 7 + p.s * 5, 3 + p.s * 2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  } else if (theme === 'casino') {
    // 다이아 무늬 카펫
    ctx.strokeStyle = 'oklch(0.85 0.12 85 / 0.07)';
    ctx.lineWidth = 1;
    for (let y = -COURSE_W; y < FUNNEL_Y; y += 26) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(COURSE_W, y + COURSE_W);
      ctx.moveTo(COURSE_W, y);
      ctx.lineTo(0, y + COURSE_W);
      ctx.stroke();
    }
  }
  ctx.restore();

  for (const z of course.zones) drawZone(ctx, z, theme, now, still);
  for (const w of course.wells) drawWell(ctx, w, now, still);
  for (const o of course.orbiters) drawOrbitTrack(ctx, o, theme);

  // 깔때기 — 아래를 가리키는 경고 화살표
  ctx.save();
  ctx.fillStyle = 'oklch(0.65 0.2 30 / 0.22)';
  for (const y of [1646, 1678]) {
    ctx.beginPath();
    ctx.moveTo(COURSE_W / 2 - 22, y);
    ctx.lineTo(COURSE_W / 2, y + 14);
    ctx.lineTo(COURSE_W / 2 + 22, y);
    ctx.lineTo(COURSE_W / 2 + 22, y + 6);
    ctx.lineTo(COURSE_W / 2, y + 20);
    ctx.lineTo(COURSE_W / 2 - 22, y + 6);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();

  // 구간 이름 — 판이 길어도 어디쯤인지 읽히게
  ctx.save();
  ctx.fillStyle = pal.label;
  ctx.font = pal.labelFont;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const l of course.labels) ctx.fillText(l.text, COURSE_W / 2, l.y);
  ctx.restore();

  // 바깥 테두리 레일. 카지노는 레일에 전구가 깜빡인다.
  ctx.save();
  ctx.strokeStyle = pal.border;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(1.5, 0);
  ctx.lineTo(1.5, FUNNEL_Y);
  ctx.moveTo(COURSE_W - 1.5, 0);
  ctx.lineTo(COURSE_W - 1.5, FUNNEL_Y);
  ctx.stroke();
  if (theme === 'casino') {
    for (let y = 12, k = 0; y < FUNNEL_Y; y += 22, k += 1) {
      const on = still ? k % 2 === 0 : (k + Math.floor(now / 260)) % 2 === 0;
      ctx.fillStyle = on ? 'oklch(0.95 0.12 90)' : 'oklch(0.5 0.08 85)';
      ctx.shadowColor = 'oklch(0.95 0.15 90)';
      ctx.shadowBlur = on ? 8 : 0;
      for (const x of [2, COURSE_W - 2]) {
        ctx.beginPath();
        ctx.arc(x, y, 2.2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  ctx.restore();

  // 배수구 — 결승선 아래
  ctx.save();
  ctx.fillStyle = 'oklch(0.12 0.02 280)';
  ctx.fillRect(0, FINISH_Y, COURSE_W, BOARD_H - FINISH_Y);
  ctx.strokeStyle = 'oklch(0.75 0.17 145)';
  ctx.setLineDash([5, 4]);
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(0, FINISH_Y);
  ctx.lineTo(COURSE_W, FINISH_Y);
  ctx.stroke();
  ctx.restore();
}

/** 가속 구간. 정글은 물줄기, 나머지는 아래 화살표 띠. 흐름이 아래로 움직인다. */
function drawZone(ctx: CanvasRenderingContext2D, z: Zone, theme: PinballTheme, now: number, still: boolean) {
  const pal = PALETTES[theme];
  const w = z.x2 - z.x1;
  const h = z.y2 - z.y1;
  ctx.save();
  ctx.beginPath();
  ctx.rect(z.x1, z.y1, w, h);
  ctx.clip();
  ctx.fillStyle = pal.zone;
  ctx.fillRect(z.x1, z.y1, w, h);
  const shift = still ? 0 : (now / 18) % 24;
  if (theme === 'jungle') {
    ctx.strokeStyle = 'oklch(0.95 0.05 220 / 0.55)';
    ctx.lineWidth = 1.5;
    for (let x = z.x1 + 4; x < z.x2; x += 7) {
      for (let y = z.y1 - 24 + ((shift + x * 3) % 24); y < z.y2; y += 24) {
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x, y + 10);
        ctx.stroke();
      }
    }
  } else {
    ctx.strokeStyle = pal.zone.replace(/\/ [0-9.]+\)/, '/ 0.6)');
    ctx.lineWidth = 2;
    const cx = (z.x1 + z.x2) / 2;
    for (let y = z.y1 - 24 + shift; y < z.y2; y += 24) {
      ctx.beginPath();
      ctx.moveTo(cx - 8, y);
      ctx.lineTo(cx, y + 7);
      ctx.lineTo(cx + 8, y);
      ctx.stroke();
    }
  }
  ctx.restore();
}

/** 블랙홀 — 어두운 중심과 도는 강착원반. */
function drawWell(ctx: CanvasRenderingContext2D, w: Well, now: number, still: boolean) {
  ctx.save();
  const g = ctx.createRadialGradient(w.x, w.y, 2, w.x, w.y, w.r);
  g.addColorStop(0, 'oklch(0.05 0.02 300 / 0.95)');
  g.addColorStop(0.25, 'oklch(0.12 0.08 300 / 0.7)');
  g.addColorStop(0.6, 'oklch(0.35 0.15 310 / 0.18)');
  g.addColorStop(1, 'oklch(0.35 0.15 310 / 0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(w.x, w.y, w.r, 0, Math.PI * 2);
  ctx.fill();
  const spin = still ? 0 : now / 600;
  ctx.lineWidth = 2;
  for (let k = 0; k < 3; k += 1) {
    ctx.strokeStyle = `oklch(0.8 0.15 ${40 + k * 30} / ${0.5 - k * 0.12})`;
    ctx.beginPath();
    ctx.ellipse(w.x, w.y, w.r * (0.28 + k * 0.14), w.r * (0.1 + k * 0.05), spin + k * 0.6, 0, Math.PI * 1.4);
    ctx.stroke();
  }
  ctx.restore();
}

/** 회전 고리가 도는 길. 카지노는 룰렛 원판(빨강·검정 칸). */
function drawOrbitTrack(ctx: CanvasRenderingContext2D, o: Orbiter, theme: PinballTheme) {
  ctx.save();
  if (theme === 'casino') {
    const n = 16;
    for (let k = 0; k < n; k += 1) {
      ctx.fillStyle = k % 2 === 0 ? 'oklch(0.45 0.18 25 / 0.55)' : 'oklch(0.12 0.01 20 / 0.6)';
      ctx.beginPath();
      ctx.moveTo(o.x, o.y);
      ctx.arc(o.x, o.y, o.R + 9, (k / n) * Math.PI * 2, ((k + 1) / n) * Math.PI * 2);
      ctx.closePath();
      ctx.fill();
    }
    ctx.strokeStyle = PALETTES.casino.rail;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(o.x, o.y, o.R + 9, 0, Math.PI * 2);
    ctx.stroke();
  } else {
    ctx.strokeStyle = theme === 'space' ? 'oklch(0.8 0.08 230 / 0.3)' : 'oklch(0.85 0.05 260 / 0.22)';
    ctx.setLineDash([3, 5]);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(o.x, o.y, o.R, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

/** 회전 고리의 핀. 우주는 작은 위성, 카지노는 금색 칩. */
export function drawOrbiter(ctx: CanvasRenderingContext2D, o: Orbiter, step: number, theme: PinballTheme, touching: (x: number, y: number, r: number) => boolean) {
  const pal = PALETTES[theme];
  for (const p of orbiterPegs(o, step)) {
    const hit = touching(p.x, p.y, o.r);
    ctx.save();
    ctx.fillStyle = 'oklch(0.08 0.02 280 / 0.5)';
    ctx.beginPath();
    ctx.arc(p.x + SHADOW_DX * 0.7, p.y + SHADOW_DY * 0.7, o.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowColor = hit ? '#ffffff' : pal.spinner;
    ctx.shadowBlur = hit ? 16 : 7;
    ctx.fillStyle = hit ? '#ffffff' : pal.spinner;
    ctx.beginPath();
    ctx.arc(p.x, p.y, o.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

/** 웜홀 — 입구는 보라 소용돌이, 출구는 하늘색 고리. 짝끼리 같은 무늬 번호. */
export function drawPortal(ctx: CanvasRenderingContext2D, p: Portal, k: number, now: number, still: boolean) {
  const spin = still ? 0 : now / 300;
  ctx.save();
  const g = ctx.createRadialGradient(p.from.x, p.from.y, 1, p.from.x, p.from.y, p.r + 4);
  g.addColorStop(0, 'oklch(0.1 0.05 300)');
  g.addColorStop(0.6, 'oklch(0.45 0.2 300 / 0.8)');
  g.addColorStop(1, 'oklch(0.7 0.2 300 / 0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(p.from.x, p.from.y, p.r + 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'oklch(0.8 0.18 300)';
  ctx.lineWidth = 2;
  for (let a = 0; a < 3; a += 1) {
    ctx.beginPath();
    ctx.arc(p.from.x, p.from.y, p.r - 2, spin + (a * Math.PI * 2) / 3, spin + (a * Math.PI * 2) / 3 + 1.2);
    ctx.stroke();
  }
  // 출구
  ctx.strokeStyle = 'oklch(0.85 0.13 200 / 0.85)';
  ctx.shadowColor = 'oklch(0.85 0.13 200)';
  ctx.shadowBlur = 8;
  ctx.lineWidth = 2;
  ctx.setLineDash([3, 3]);
  ctx.beginPath();
  ctx.arc(p.to.x, p.to.y, 9, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.shadowBlur = 0;
  // 짝 표시 — 입구와 출구에 같은 숫자
  ctx.fillStyle = 'oklch(0.95 0.05 300)';
  ctx.font = '800 8px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(k + 1), p.from.x, p.from.y);
  ctx.fillText(String(k + 1), p.to.x, p.to.y);
  ctx.restore();
}

export function drawWall(ctx: CanvasRenderingContext2D, w: Wall, frame: { x: number; y: number }[] | null, theme: PinballTheme) {
  const pal = PALETTES[theme];
  ctx.save();
  ctx.lineCap = 'round';
  if (w.kind === 'sling') {
    const dx = w.x2 - w.x1;
    const dy = w.y2 - w.y1;
    const len = Math.hypot(dx, dy) || 1;
    const hit =
      frame?.some((m) => {
        const t = Math.min(1, Math.max(0, ((m.x - w.x1) * dx + (m.y - w.y1) * dy) / (len * len)));
        return Math.hypot(m.x - (w.x1 + t * dx), m.y - (w.y1 + t * dy)) <= MARBLE_R + 5;
      }) ?? false;
    ctx.strokeStyle = hit ? '#ffffff' : pal.sling;
    ctx.shadowColor = hit ? '#ffffff' : pal.sling;
    ctx.shadowBlur = hit ? 16 : 6;
    ctx.lineWidth = 5;
  } else if (w.kind === 'post') {
    ctx.strokeStyle = pal.post;
    ctx.shadowColor = pal.post;
    ctx.shadowBlur = 6;
    ctx.lineWidth = 4;
  } else {
    // 레일 — 그림자, 몸통, 하이라이트. 정글은 통나무라 굵다.
    const thick = theme === 'jungle' ? 7 : 5;
    ctx.strokeStyle = 'oklch(0.1 0.02 280 / 0.6)';
    ctx.lineWidth = thick + 1;
    ctx.beginPath();
    ctx.moveTo(w.x1 + SHADOW_DX, w.y1 + SHADOW_DY);
    ctx.lineTo(w.x2 + SHADOW_DX, w.y2 + SHADOW_DY);
    ctx.stroke();
    ctx.strokeStyle = pal.rail;
    ctx.lineWidth = thick;
    ctx.beginPath();
    ctx.moveTo(w.x1, w.y1);
    ctx.lineTo(w.x2, w.y2);
    ctx.stroke();
    ctx.strokeStyle = pal.railHi;
    ctx.lineWidth = 1.5;
  }
  ctx.beginPath();
  ctx.moveTo(w.x1, w.y1);
  ctx.lineTo(w.x2, w.y2);
  ctx.stroke();
  ctx.restore();
}

export function drawSpinner(ctx: CanvasRenderingContext2D, seg: { x1: number; y1: number; x2: number; y2: number }, cx: number, cy: number, theme: PinballTheme) {
  const pal = PALETTES[theme];
  ctx.save();
  ctx.lineCap = 'round';
  ctx.strokeStyle = 'oklch(0.1 0.02 280 / 0.55)';
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.moveTo(seg.x1 + SHADOW_DX, seg.y1 + SHADOW_DY);
  ctx.lineTo(seg.x2 + SHADOW_DX, seg.y2 + SHADOW_DY);
  ctx.stroke();
  ctx.strokeStyle = pal.spinner;
  ctx.shadowColor = pal.spinner;
  ctx.shadowBlur = 10;
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(seg.x1, seg.y1);
  ctx.lineTo(seg.x2, seg.y2);
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.fillStyle = pal.hub;
  ctx.beginPath();
  ctx.arc(cx, cy, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export function drawBumper(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, hit: boolean, theme: PinballTheme) {
  const pal = PALETTES[theme];
  ctx.save();
  ctx.fillStyle = 'oklch(0.08 0.02 280 / 0.55)';
  ctx.beginPath();
  ctx.arc(x + SHADOW_DX, y + SHADOW_DY, r + 1, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowColor = hit ? '#ffffff' : pal.bumperGlow;
  ctx.shadowBlur = hit ? 22 : 8;
  ctx.fillStyle = hit ? '#ffffff' : pal.bumper;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  if (theme === 'space') {
    // 행성 고리
    ctx.strokeStyle = 'oklch(0.9 0.06 80 / 0.7)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(x, y, r * 1.5, r * 0.45, -0.35, 0, Math.PI * 2);
    ctx.stroke();
  }
  if (theme === 'casino') {
    // 칩 테두리 눈금
    ctx.strokeStyle = 'oklch(0.99 0 0 / 0.9)';
    ctx.lineWidth = 2;
    for (let k = 0; k < 6; k += 1) {
      const a = (k / 6) * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(x, y, r - 1.5, a, a + 0.35);
      ctx.stroke();
    }
  }
  const cap = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, 1, x, y, r * 0.75);
  cap.addColorStop(0, hit ? '#ffffff' : pal.capHi);
  cap.addColorStop(1, hit ? 'oklch(0.9 0.1 90)' : pal.capLo);
  ctx.fillStyle = cap;
  ctx.beginPath();
  ctx.arc(x, y, r * 0.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export function drawPost(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, hit: boolean, theme: PinballTheme) {
  const pal = PALETTES[theme];
  ctx.save();
  ctx.fillStyle = 'oklch(0.08 0.02 280 / 0.5)';
  ctx.beginPath();
  ctx.arc(x + SHADOW_DX * 0.7, y + SHADOW_DY * 0.7, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowColor = hit ? '#ffffff' : pal.peg;
  ctx.shadowBlur = hit ? 16 : 5;
  ctx.fillStyle = hit ? '#ffffff' : pal.peg;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}
