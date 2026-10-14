// @vitest-environment jsdom
/** 동료 예측 한 줄 — 오늘 정한 가게는 후보에서 빠져도 그 가게에 건 표는 센다. */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Predictions } from './Predictions';
import type { Place } from '../lib/candidates';

afterEach(cleanup);

const place = (id: string, name: string) => ({ id, name, category: '밥', walkMin: 3 }) as Place;
const a = place('a', '골목국수');
const b = place('b', '제육집');
const votes = [
  { uid: 'u1', placeId: 'a', name: '민지' },
  { uid: 'u2', placeId: 'b', name: '준호' },
];
const noop = async () => {};

describe('Predictions', () => {
  it('정한 가게가 후보에서 빠져도 예측 수가 줄지 않는다', () => {
    render(
      <Predictions
        candidates={[b]}
        decided={a}
        votes={votes}
        myUid={null}
        locked={false}
        onVote={noop}
        onClear={noop}
      />,
    );
    expect(screen.getByText('2명')).toBeTruthy();
    expect(screen.getByText(/골목국수 1/)).toBeTruthy();
  });

  it('정한 가게가 없으면 후보에 없는 가게 표는 세지 않는다', () => {
    render(<Predictions candidates={[b]} votes={votes} myUid={null} locked={false} onVote={noop} onClear={noop} />);
    expect(screen.getByText('1명')).toBeTruthy();
  });
});
