import { useState } from 'react';
import { Button, Popover } from '@gook-lab/ui';
import './PartyHelp.css';

/**
 * 점심 팟 사용법 — 제목 옆 (?) 를 누르면 여섯 단계를 한 장씩 넘겨 본다.
 * 그림(public/help/party/<n>.webp)은 팟 흐름 점검(10/16) 때 에뮬레이터에서 실제로 찍은 화면이다 — 이름은 오늘의 동물 아바타라 실제 사람이 아니다.
 */
const STEPS: { title: string; body: string; alt: string }[] = [
  {
    title: '팟 모으기',
    body: '메뉴·출발 시각·인원·메모를 골라 팟을 열어요. 한 사람당 하루에 팟 하나예요.',
    alt: '팟 모으기 창 — 메뉴 면, 출발 11시 50분, 4명, 메모를 고른 모습',
  },
  {
    title: '참여하기',
    body: '열린 팟은 동료 화면에 바로 떠요. 참여하면 내 동물 아바타가 붙고, 방장에겐 "들어왔어요" 알림이 가요.',
    alt: '팟 카드에 참여한 사람 아바타가 붙은 모습',
  },
  {
    title: '꽉 차면 · 마감',
    body: '인원이 다 차면 "꽉 찼어요"로 잠겨요. 방장은 마감하기와 다시 모으기로 열고 닫을 수 있어요.',
    alt: '4명이 모여 꽉 찬 팟 카드',
  },
  {
    title: '출발 10분 전 알림',
    body: '내가 든 팟이 곧 출발하면 알려 드려요. 출발 시각이 지나면 더는 참여할 수 없어요.',
    alt: '면 팟이 곧 출발한다는 알림',
  },
  {
    title: '게임으로 가게 정하기',
    body: '방장이 게임을 골라 팟 메뉴 가게 중에서 한 번 뽑아요. 결과는 한 번만 남고 다시 뽑을 수 없어요.',
    alt: '활쏘기로 우동 한 판이 뽑힌 결과',
  },
  {
    title: '결과 다시 보기',
    body: '참여자는 "결과 보기"로 방장이 본 판을 처음부터 똑같이 다시 봐요. 팟 없애기는 방장만 할 수 있어요.',
    alt: '참여자 화면에서 같은 판을 다시 보는 모습',
  },
];

export function PartyHelp() {
  const [k, setK] = useState(0);
  const step = STEPS[k];
  return (
    <Popover
      className="gamehelp partyhelp"
      aria-label="점심 팟 사용법"
      collisionPadding={12}
      trigger={
        <button type="button" className="gametitle__help" aria-label="점심 팟 사용법 보기" onClick={() => setK(0)}>
          ?
        </button>
      }
    >
      <Popover.Title>🙋 점심 팟 사용법</Popover.Title>
      <div className="partyhelp__shot">
        <img
          key={k}
          src={`${import.meta.env.BASE_URL}help/party/${k + 1}.webp`}
          alt={step.alt}
          loading="lazy"
          onError={(e) => {
            e.currentTarget.style.visibility = 'hidden';
          }}
        />
      </div>
      <p className="partyhelp__step" aria-live="polite">
        <span className="partyhelp__no">
          {k + 1}/{STEPS.length}
        </span>{' '}
        <strong>{step.title}</strong>
      </p>
      <p className="partyhelp__body">{step.body}</p>
      <div className="partyhelp__nav">
        <span className="partyhelp__dots" aria-hidden="true">
          {STEPS.map((_, i) => (
            <span key={i} className={i === k ? 'partyhelp__dot partyhelp__dot--on' : 'partyhelp__dot'} />
          ))}
        </span>
        <Button size="sm" variant="secondary" disabled={k === 0} onClick={() => setK(k - 1)}>
          이전
        </Button>
        <Button size="sm" variant="primary" disabled={k === STEPS.length - 1} onClick={() => setK(k + 1)}>
          다음
        </Button>
      </div>
    </Popover>
  );
}
