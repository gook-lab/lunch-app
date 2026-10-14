// @vitest-environment jsdom
/** 데모 저장소 — 빈 상태로 시작하고(예시는 골라서 깔고), 결정·예측이 브라우저에 남고, 처음 상태로 되돌린다. */
import { beforeEach, describe, expect, it } from 'vitest';
import { todayKST } from '../lib/date';
import { loadDemoSample, resetDemo } from './demoStore';
import { decideToday, fetchOffice, fetchPlaces, fetchRecentVisits, subscribeToday } from './lunch.demo';
import { castVote, subscribeVotes } from './predictions.demo';

beforeEach(() => {
  localStorage.clear();
  resetDemo();
});

describe('데모 저장소', () => {
  it('빈 상태로 시작한다 — 가게·기록·회사 위치 없이', async () => {
    expect(await fetchPlaces()).toEqual([]);
    expect(await fetchRecentVisits(todayKST())).toEqual([]);
    expect(await fetchOffice()).toBeNull();
  });

  it('예시로 둘러보면 지어낸 가게와 최근 방문 기록이 깔린다', async () => {
    loadDemoSample();
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
    loadDemoSample();
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
  const saved = localStorage.getItem('lunch-app:demo-v4');
  resetDemo();
  if (saved) localStorage.setItem('lunch-app:demo-v4', saved);
}
