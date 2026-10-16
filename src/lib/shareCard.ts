/**
 * 결과 공유 카드 — 슬랙·메신저에 붙일 1200×630 그림. 표시 전용(공정성 무관).
 *
 * 글만 보내면 대화 속에 묻힌다. 가게 이름이 크게 박힌 그림 한 장이면 "어디로 가기로 했지?" 가 줄어든다.
 * 색은 지금 화면의 토큰(var(--*))을 읽어 쓴다 — 밝은·어두운·계절 테마 그대로 나간다.
 */
import type { Place } from './candidates';
import { withJosa } from './josa';

export interface CardText {
  kicker: string;
  name: string;
  meta: string;
  footer: string;
}

type CardPlace = Pick<Place, 'name' | 'category' | 'sub' | 'walkMin'>;

const DOW = ['일', '월', '화', '수', '목', '금', '토'];

/** 카드에 들어갈 글. day 는 YYYYMMDD(KST). game 은 "🏹 활쏘기" 처럼 아이콘과 이름. */
export function cardText(place: CardPlace, day: string, game?: string): CardText {
  const m = Number(day.slice(4, 6));
  const d = Number(day.slice(6, 8));
  const dow = DOW[new Date(Date.UTC(Number(day.slice(0, 4)), m - 1, d)).getUTCDay()];
  return {
    kicker: `${m}월 ${d}일 ${dow}요일 · 오늘 점심은`,
    name: place.name,
    meta: `${place.sub ?? place.category} · 도보 ${place.walkMin}분`,
    footer: game ? `${withJosa(game, '으로/로')} 정했어요` : '점심 뭐 먹지?',
  };
}

/** 폭 안에 들어오는 가장 큰 글자 크기. measure 는 크기별 글 폭을 돌려준다. */
export function fitSize(measure: (size: number) => number, max: number, min: number, width: number): number {
  for (let size = max; size > min; size -= 4) if (measure(size) <= width) return size;
  return min;
}

const W = 1200;
const H = 630;
const PAD = 72;

function token(name: string, fallback: string): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

/** 그림을 그려 PNG 로. 캔버스가 없는 환경(jsdom 등)이면 null. */
export async function drawShareCard(text: CardText): Promise<Blob | null> {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext?.('2d');
  if (!ctx) return null;
  // 토큰이 color-mix·oklch 여도 캔버스가 이해하게 한 번 계산된 색으로 바꾼다.
  const probe = document.createElement('span');
  document.body.append(probe);
  const color = (name: string, fallback: string) => {
    probe.style.color = token(name, fallback);
    return getComputedStyle(probe).color;
  };
  const bg = color('--color-bg', 'white');
  const surface = color('--color-surface', 'white');
  const ink = color('--color-text', 'black');
  const accent = color('--color-accent-700', 'black');
  const muted = color('--color-neutral-700', 'gray');
  probe.remove();
  const font = getComputedStyle(document.body).fontFamily || 'sans-serif';
  await document.fonts?.ready;

  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  // 식권 같은 카드 — 바탕 위에 한 장, 왼쪽 강조 띠.
  ctx.fillStyle = surface;
  ctx.beginPath();
  ctx.roundRect(36, 36, W - 72, H - 72, 28);
  ctx.fill();
  ctx.fillStyle = accent;
  ctx.fillRect(36, 120, 10, H - 240);

  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = muted;
  ctx.font = `600 34px ${font}`;
  ctx.fillText(`🍱 ${text.kicker}`, PAD + 24, 150);

  const room = W - (PAD + 24) * 2;
  const size = fitSize(
    (s) => {
      ctx.font = `900 ${s}px ${font}`;
      return ctx.measureText(text.name).width;
    },
    120,
    56,
    room,
  );
  ctx.font = `900 ${size}px ${font}`;
  ctx.fillStyle = ink;
  ctx.fillText(text.name, PAD + 24, 300 + size / 3, room);

  ctx.font = `600 40px ${font}`;
  ctx.fillStyle = accent;
  ctx.fillText(text.meta, PAD + 24, 440);

  ctx.font = `600 32px ${font}`;
  ctx.fillStyle = muted;
  ctx.fillText(text.footer, PAD + 24, H - 96);

  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/png'));
}
