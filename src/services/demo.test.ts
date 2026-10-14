// @vitest-environment jsdom
/** 데모 저장소 — 씨앗 데이터로 시작하고, 결정·예측이 브라우저에 남고, 처음 상태로 되돌린다. */
import { beforeEach, describe, expect, it } from 'vitest';
import { todayKST } from '../lib/date';
import { resetDemo } from './demoStore';
import { decideToday, fetchPlaces, fetchRecentVisits, subscribeToday } from './lunch.demo';
import { castVote, subscribeVotes } from './predictions.demo';

beforeEach(() => {
  localStorage.clear();
  resetDemo();
});

describe('데모 저장소', () => {
  it('지어낸 가게와 최근 방문 기록으로 시작한다', async () => {
    const places = await fetchPlaces();
    expect(places.length).toBeGreaterThanOrEqual(10);
    expect(places.some((p) => !p.active)).toBe(true);
    expect((await fetchRecentVisits(todayKST())).length).toBeGreaterThan(0);
  });

  it('오늘 결정을 쓰면 구독이 바로 받고, 새로 읽어도 남아 있다', async () => {
    const today = todayKST();
    const seen: (string | null)[] = [];
    const stop = subscribeToday(
      today,
      (d) => seen.push(d?.placeId ?? null),
      () => {},
    );
    await decideToday(today, 'demo-3');
    stop();
    expect(seen).toEqual([null, 'demo-3']);
    resetDemoMemoryOnly();
    expect((await fetchRecentVisits(today)).find((v) => v.id === today)?.placeId).toBe('demo-3');
  });

  it('예측은 동료 두 표에 내 표 하나를 더한다', async () => {
    const today = todayKST();
    let count = 0;
    const stop = subscribeVotes(
      today,
      (v) => (count = v.length),
      () => {},
    );
    expect(count).toBe(2);
    await castVote(today, 'demo-1', '나');
    await castVote(today, 'demo-2', '나');
    expect(count).toBe(3);
    stop();
  });
});

/** 메모리만 비우고 저장소는 둔다 — 새로고침과 같다. */
function resetDemoMemoryOnly() {
  const saved = localStorage.getItem('lunch-app:demo-v3');
  resetDemo();
  if (saved) localStorage.setItem('lunch-app:demo-v3', saved);
}
