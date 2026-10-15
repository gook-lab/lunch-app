import { describe, expect, it } from 'vitest';
import { weeklyReport } from './report';
import type { Place, Visit } from './candidates';
import type { DayId } from './date';

const place = (id: string, category: string, name: string): Place => ({
  id,
  category,
  name,
  lat: 37.0,
  lng: 127.0,
  walkMin: 5,
  kakaoPlaceId: 'dummy',
  active: true,
  createdBy: 'test',
});

describe('이번 주 점심 리포트', () => {
  // 2026-10-19 는 월요일, 2026-10-20 는 화요일, ..., 2026-10-23 은 금요일
  const MON = '20261019' as DayId;
  const TUE = '20261020' as DayId;
  const WED = '20261021' as DayId;
  const FRI = '20261023' as DayId;
  const SAT = '20261024' as DayId;
  const SUN = '20261025' as DayId;

  it('빈 기록이면 0건 리포트', () => {
    const report = weeklyReport([], [], FRI);
    expect(report.decisionCount).toBe(0);
    expect(report.topCategory).toBeNull();
    expect(report.topMode).toBeNull();
    expect(report.places).toEqual([]);
  });

  it('이번 주 월~금만 센다', () => {
    const places = [place('p1', '면', '라멘'), place('p2', '한식', '국밥')];
    const visits: Visit[] = [
      { id: SUN, placeId: 'p1' }, // 지난주 일요일
      { id: MON, placeId: 'p1' },
      { id: TUE, placeId: 'p2' },
      { id: SAT, placeId: 'p1' }, // 다음주 토요일
    ];
    const report = weeklyReport(visits, places, FRI);
    expect(report.decisionCount).toBe(2);
    expect(report.places).toHaveLength(2);
  });

  it('가장 자주 고른 카테고리를 찾는다', () => {
    const places = [place('p1', '면', '라멘'), place('p2', '면', '우동'), place('p3', '한식', '국밥')];
    const visits: Visit[] = [
      { id: MON, placeId: 'p1' },
      { id: TUE, placeId: 'p2' },
      { id: WED, placeId: 'p3' },
    ];
    const report = weeklyReport(visits, places, FRI);
    expect(report.topCategory).toBe('면');
  });

  it('게임 모드가 있는 기록만 센다', () => {
    const places = [place('p1', '면', '라멘'), place('p2', '면', '우동')];
    const visits: Visit[] = [
      { id: MON, placeId: 'p1', mode: 'wheel' },
      { id: TUE, placeId: 'p2', mode: 'wheel' },
      { id: WED, placeId: 'p2' }, // mode 없음
    ];
    const report = weeklyReport(visits, places, FRI);
    expect(report.decisionCount).toBe(3);
    expect(report.topMode).toBe('wheel'); // mode 가 있는 것만
  });

  it('한 번씩뿐이거나 동점이면 "자주" 를 말하지 않는다', () => {
    const places = [place('p1', '면', '라멘'), place('p2', '밥', '덮밥')];
    const once = weeklyReport([{ id: MON, placeId: 'p1', mode: 'wheel' }], places, FRI);
    expect(once.topCategory).toBeNull();
    expect(once.topMode).toBeNull();
    const tie = weeklyReport(
      [MON, TUE].map((id) => ({ id, placeId: 'p1' })).concat([WED, FRI].map((id) => ({ id, placeId: 'p2' }))),
      places,
      FRI,
    );
    expect(tie.topCategory).toBeNull();
  });

  it('가장 자주 쓴 게임 모드를 찾는다', () => {
    const places = [place('p1', '면', 'a'), place('p2', '면', 'b'), place('p3', '면', 'c')];
    const visits: Visit[] = [
      { id: MON, placeId: 'p1', mode: 'wheel' },
      { id: TUE, placeId: 'p2', mode: 'wheel' },
      { id: WED, placeId: 'p3', mode: 'slot' },
    ];
    const report = weeklyReport(visits, places, FRI);
    expect(report.topMode).toBe('wheel');
  });

  it('방문 가게를 역순(최근순)으로 나열한다', () => {
    const places = [place('p1', '면', '라멘'), place('p2', '한식', '국밥')];
    const visits: Visit[] = [
      { id: MON, placeId: 'p1' },
      { id: FRI, placeId: 'p2' },
    ];
    const report = weeklyReport(visits, places, FRI);
    expect(report.places).toHaveLength(2);
    // 최근 기록이 먼저
    expect(report.places[0].place.id).toBe('p2');
    expect(report.places[1].place.id).toBe('p1');
  });

  it('각 가게에 요일 라벨을 붙인다', () => {
    const places = [place('p1', '면', '라멘')];
    const visits: Visit[] = [{ id: MON, placeId: 'p1' }];
    const report = weeklyReport(visits, places, FRI);
    expect(report.places[0].dayLabel).toBe('월');
  });

  it('없어진 가게는 무시한다', () => {
    const places = [place('p1', '면', '라멘')];
    const visits: Visit[] = [{ id: MON, placeId: 'p1' }, { id: TUE, placeId: 'p2' }]; // p2 는 없음
    const report = weeklyReport(visits, places, FRI);
    expect(report.decisionCount).toBe(2);
    expect(report.places).toHaveLength(1);
  });

  it('게임 모드가 있으면 함께 저장한다', () => {
    const places = [place('p1', '면', '라멘')];
    const visits: Visit[] = [{ id: MON, placeId: 'p1', mode: 'wheel' }];
    const report = weeklyReport(visits, places, FRI);
    expect(report.places[0].mode).toBe('wheel');
  });

  it('게임 모드가 없으면 저장하지 않는다', () => {
    const places = [place('p1', '면', '라멘')];
    const visits: Visit[] = [{ id: MON, placeId: 'p1' }];
    const report = weeklyReport(visits, places, FRI);
    expect(report.places[0].mode).toBeUndefined();
  });

  it('달이 바뀌는 주도 금요일까지 센다', () => {
    const p = [place('a', '밥', '가집')];
    const r = weeklyReport([{ id: '20260928', placeId: 'a' }, { id: '20261001', placeId: 'a' }], p, '20260930');
    expect(r.decisionCount).toBe(2);
  });
});
