/**
 * 첫 방문 안내 — 화면을 어둡게 덮고 설명하는 부분만 밝혀 둔 채 카드로 한 단계씩.
 *
 * pig-ma 의 시작 안내(EmptyCanvasGuide)와 같은 구조다: 처음 한 번만 뜨고, 건너뛰거나 끝내면
 * 기억하고, 머리말 "사용법" 으로 다시 본다. 다른 점은 밝힐 자리를 고정 좌표가 아니라
 * 실제 요소의 위치로 잡는다는 것 — 이 앱은 휴대폰과 데스크톱 배치가 달라 고정 좌표가 맞지 않는다.
 * 그 화면에 없는 요소를 가리키는 단계는 건너뛴다(카테고리가 하나뿐이면 칩 줄이 없다).
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

const SEEN_KEY = 'lunch-app:tour-v1';

interface Step {
  /** 밝힐 요소. 없으면 화면 가운데 카드만. */
  target?: string;
  icon: string;
  title: string;
  body: string;
}

// 공개 데모는 기록이 그 브라우저에만 남는다(DemoNote). 팀용 문구("누구나 쓸 수 있어요", "동료들이 같이 봐요")를
// 그대로 두면 바로 위 데모 안내와 정반대로 읽혔다(10/15). 데모 빌드에서만 1·5단계 설명을 바꾼다.
const DEMO = import.meta.env.VITE_DEMO === '1';

const STEPS: Step[] = [
  {
    icon: '🍱',
    title: '오늘 점심, 게임 한 판으로 정해요',
    body: DEMO
      ? '체험판이라 이 브라우저에서만 보여요. 팀용은 링크 하나로 같이 써요. 최근 1주에 간 곳은 알아서 빼고 골라요.'
      : '링크만 있으면 누구나 쓸 수 있어요. 최근 1주에 간 곳은 알아서 빼고 골라요.',
  },
  {
    target: '.catbar',
    icon: '🍚',
    title: '먹고 싶은 종류를 골라요',
    body: '"오늘은 면만"처럼 메뉴를 누르면 그 가게들 중에서만 골라요. 면을 고르면 라멘·우동처럼 더 좁힐 수도 있어요.',
  },
  {
    target: '.modebar',
    icon: '🎲',
    title: '게임을 골라요',
    body: '마음에 드는 게임을 골라요. 기본 확률은 모두 같고, 핀볼에서만 공 개수로 확률을 바꿀 수 있어요.',
  },
  {
    target: '.stage__run',
    icon: '✅',
    title: '돌리고, 정해요',
    body: '결과가 마음에 들면 "여기로 결정"을 눌러요. 오늘 기록이 남고, 길을 찾거나 동료에게 알릴 수도 있어요.',
  },
  {
    target: '.tabs',
    icon: '⭐',
    title: '가게를 넣고 별점도 남겨요',
    body: DEMO
      ? '지도에서 가게를 넣고, 다녀온 곳엔 별점과 한 줄 평을 남겨 보세요. 체험판에선 이 브라우저에만 남아요.'
      : '지도에서 가게를 넣고, 다녀온 곳엔 별점과 한 줄 평을 남겨 주세요. 동료들이 같이 봐요.',
  },
];

export function tourSeen(): boolean {
  try {
    return localStorage.getItem(SEEN_KEY) === 'done';
  } catch {
    // 저장소가 막힌 창에서는 매번 띄우지 않는다.
    return true;
  }
}

function markSeen() {
  try {
    localStorage.setItem(SEEN_KEY, 'done');
  } catch {
    // 기억하지 못해도 이번엔 닫힌다.
  }
}

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

const PAD = 6;
const CARD_GAP = 12;
/** 카드가 화면 가장자리에서 띄울 거리. */
const EDGE = 12;

/**
 * 안내 카드 자리 — 밝힌 곳 아래 → 위 → 오른쪽 → 왼쪽 중 카드가 통째로 들어가는 첫 자리.
 * 어디에도 안 들어가면 화면 안 아래쪽에 겹쳐 둔다. 예전엔 아래가 모자라면 무조건 위에 둬서,
 * 밝힌 곳이 화면만큼 긴 데스크톱 게임 레일에선 카드가 화면 위로 잘려 나갔다(10/17 사용자).
 */
export function placeCard(
  rect: Rect,
  card: { width: number; height: number },
  view: { width: number; height: number },
): { top: number; left: number } {
  const clampX = (x: number) => Math.min(Math.max(x, EDGE), view.width - card.width - EDGE);
  const clampY = (y: number) => Math.min(Math.max(y, EDGE), view.height - card.height - EDGE);
  const centerX = clampX(rect.left + rect.width / 2 - card.width / 2);
  const bottom = rect.top + rect.height;
  const right = rect.left + rect.width;
  if (bottom + CARD_GAP + card.height <= view.height - EDGE) return { top: bottom + CARD_GAP, left: centerX };
  if (rect.top - CARD_GAP - card.height >= EDGE) return { top: rect.top - CARD_GAP - card.height, left: centerX };
  if (right + CARD_GAP + card.width <= view.width - EDGE) return { top: clampY(rect.top), left: right + CARD_GAP };
  if (rect.left - CARD_GAP - card.width >= EDGE) return { top: clampY(rect.top), left: rect.left - CARD_GAP - card.width };
  return { top: clampY(view.height - card.height - EDGE), left: centerX };
}

export function Tour({ onClose }: { onClose: () => void }) {
  // 지금 화면에 있는 요소만 단계로 쓴다.
  const [steps] = useState(() => STEPS.filter((s) => !s.target || document.querySelector(s.target)));
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const nextRef = useRef<HTMLButtonElement>(null);
  // 카드 실제 크기. 단계마다 글 길이가 달라 높이를 어림하면(예전 220px) 자리를 잘못 골랐다.
  const cardRef = useRef<HTMLElement>(null);
  const [cardSize, setCardSize] = useState({ width: 360, height: 220 });
  useLayoutEffect(() => {
    const r = cardRef.current?.getBoundingClientRect();
    if (!r) return;
    setCardSize((s) =>
      Math.abs(s.width - r.width) > 1 || Math.abs(s.height - r.height) > 1 ? { width: r.width, height: r.height } : s,
    );
  }, [index, rect]);
  const step = steps[index] ?? steps[0];

  const finish = useCallback(() => {
    markSeen();
    onClose();
  }, [onClose]);

  // 밝힐 요소를 화면 안으로 끌어오고 위치를 잰다. 스크롤·창 크기가 바뀌면 다시 잰다.
  useLayoutEffect(() => {
    const el = step.target ? document.querySelector<HTMLElement>(step.target) : null;
    if (!el) {
      setRect(null);
      return;
    }
    // 하단 탭 바처럼 고정된 요소는 스크롤해도 그대로다.
    if (getComputedStyle(el).position !== 'fixed') el.scrollIntoView({ block: 'center' });
    const measure = () => {
      const r = el.getBoundingClientRect();
      setRect({ top: r.top - PAD, left: r.left - PAD, width: r.width + PAD * 2, height: r.height + PAD * 2 });
    };
    measure();
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [step]);

  useEffect(() => {
    nextRef.current?.focus({ preventScroll: true });
  }, [index]);

  // 안내 중에는 뒤 화면을 inert 로 막는다. Tab 이 가려진 단추로 새지 않게. 닫으면 원래 초점으로.
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    const blocked: HTMLElement[] = [];
    for (let node: HTMLElement | null = rootRef.current; node && node.parentElement; node = node.parentElement) {
      for (const sib of node.parentElement.children) {
        if (sib !== node && sib instanceof HTMLElement && !sib.inert) {
          sib.inert = true;
          blocked.push(sib);
        }
      }
      if (node.parentElement === document.body) break;
    }
    return () => {
      for (const el of blocked) el.inert = false;
      if (before && before !== document.body && before.isConnected) before.focus({ preventScroll: true });
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') finish();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [finish]);

  const last = index === steps.length - 1;
  const next = () => (last ? finish() : setIndex((i) => i + 1));

  // 카드는 밝힌 자리 둘레에서 통째로 들어가는 곳에(placeCard). 밝힐 곳이 없으면 가운데.
  const cardStyle: React.CSSProperties = rect
    ? { ...placeCard(rect, cardSize, { width: window.innerWidth, height: window.innerHeight }), translate: 'none' }
    : { top: '50%' };

  return (
    <div className="onboard" ref={rootRef}>
      {rect ? (
        <div
          className="onboard__hole"
          style={{ top: rect.top, left: rect.left, width: rect.width, height: rect.height }}
          aria-hidden="true"
        />
      ) : (
        <div className="onboard__dim" aria-hidden="true" />
      )}
      {/* 어두운 바깥을 눌러도 아무 일 없게 막는다. 실수로 게임이 돌면 안내가 엉킨다. */}
      <div className="onboard__block" aria-hidden="true" />
      <section
        key={index}
        className={rect ? 'onboard__card' : 'onboard__card onboard__card--center'}
        ref={cardRef}
        style={cardStyle}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-title"
        aria-describedby="tour-body"
      >
        <div className="onboard__head">
          <span className="onboard__icon" aria-hidden="true">
            {step.icon}
          </span>
          <div>
            <p className="onboard__count">
              {index + 1} / {steps.length}
            </p>
            <h2 id="tour-title" className="onboard__title">
              {step.title}
            </h2>
          </div>
        </div>
        <p id="tour-body" className="onboard__body">
          {step.body}
        </p>
        <div className="onboard__foot">
          <span className="onboard__dots" aria-hidden="true">
            {steps.map((s, i) => (
              <span key={s.title} className={i === index ? 'onboard__dot onboard__dot--on' : 'onboard__dot'} />
            ))}
          </span>
          {!last && (
            <button type="button" className="linkish" onClick={finish}>
              건너뛰기
            </button>
          )}
          <button type="button" ref={nextRef} className="onboard__next" onClick={next}>
            {last ? '시작하기' : '다음'}
          </button>
        </div>
      </section>
    </div>
  );
}
