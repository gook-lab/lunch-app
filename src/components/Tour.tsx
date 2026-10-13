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

const STEPS: Step[] = [
  {
    icon: '🍱',
    title: '오늘 점심, 게임 한 판으로 정해요',
    body: '링크만 있으면 누구나 써요. 최근 1주에 간 곳은 알아서 후보에서 빠져요.',
  },
  {
    target: '.catbar',
    icon: '🍚',
    title: '먹고 싶은 종류를 골라요',
    body: '"오늘은 한식만"처럼 칩을 누르면 그 가게들만 게임에 올라가요. 여러 개 같이 골라도 돼요.',
  },
  {
    target: '.modebar',
    icon: '🎲',
    title: '게임을 골라요',
    body: '열두 가지 중 아무거나요. 어떤 게임이든 뽑힐 확률은 같아요.',
  },
  {
    target: '.stage__run',
    icon: '✅',
    title: '돌리고, 정해요',
    body: '결과에서 "여기로 결정"을 누르면 오늘 기록이 남아요. 길찾기와 동료에게 알리기도 거기 있어요.',
  },
  {
    target: '.tabs',
    icon: '⭐',
    title: '가게 넣기와 별점은 목록·지도에서',
    body: '지도에서 가게를 넣고, 다녀온 곳엔 별점과 한줄평을 남겨 주세요. 동료들이 같이 봐요.',
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

export function Tour({ onClose }: { onClose: () => void }) {
  // 지금 화면에 있는 요소만 단계로 쓴다.
  const [steps] = useState(() => STEPS.filter((s) => !s.target || document.querySelector(s.target)));
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const nextRef = useRef<HTMLButtonElement>(null);
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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') finish();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [finish]);

  const last = index === steps.length - 1;
  const next = () => (last ? finish() : setIndex((i) => i + 1));

  // 카드는 밝힌 자리 아래(공간이 모자라면 위)에. 밝힐 곳이 없으면 가운데.
  const vh = window.innerHeight;
  const cardStyle: React.CSSProperties = rect
    ? rect.top + rect.height + 220 < vh
      ? { top: rect.top + rect.height + CARD_GAP }
      : { bottom: vh - rect.top + CARD_GAP }
    : { top: '50%' };

  return (
    <div className="tour">
      {rect ? (
        <div
          className="tour__hole"
          style={{ top: rect.top, left: rect.left, width: rect.width, height: rect.height }}
          aria-hidden="true"
        />
      ) : (
        <div className="tour__dim" aria-hidden="true" />
      )}
      {/* 어두운 바깥을 눌러도 아무 일 없게 막는다. 실수로 게임이 돌면 안내가 엉킨다. */}
      <div className="tour__block" aria-hidden="true" />
      <section
        key={index}
        className={rect ? 'tour__card' : 'tour__card tour__card--center'}
        style={cardStyle}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-title"
        aria-describedby="tour-body"
      >
        <div className="tour__head">
          <span className="tour__icon" aria-hidden="true">
            {step.icon}
          </span>
          <div>
            <p className="tour__count">
              {index + 1} / {steps.length}
            </p>
            <h2 id="tour-title" className="tour__title">
              {step.title}
            </h2>
          </div>
        </div>
        <p id="tour-body" className="tour__body">
          {step.body}
        </p>
        <div className="tour__foot">
          <span className="tour__dots" aria-hidden="true">
            {steps.map((s, i) => (
              <span key={s.title} className={i === index ? 'tour__dot tour__dot--on' : 'tour__dot'} />
            ))}
          </span>
          {!last && (
            <button type="button" className="linkish" onClick={finish}>
              건너뛰기
            </button>
          )}
          <button type="button" ref={nextRef} className="tour__next" onClick={next}>
            {last ? '시작하기' : '다음'}
          </button>
        </div>
      </section>
    </div>
  );
}
