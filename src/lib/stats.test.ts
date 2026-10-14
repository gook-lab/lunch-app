import { describe, it, expect } from 'vitest';
import { calculateStats } from './stats';
import type { Place, Visit } from './candidates';

/**
 * 테스트용 더미 Place.
 */
function place(id: string, name: string, category: string): Place {
  return {
    id,
    name,
    category,
    lat: 37.4979,
    lng: 127.0276,
    walkMin: 10,
    kakaoPlaceId: `kakao_${id}`,
    active: true,
    createdBy: 'test_user',
  };
}

/**
 * 테스트용 더미 Visit.
 */
function visit(dayId: string, placeId: string): Visit {
  return { id: dayId as any, placeId };
}

describe('calculateStats', () => {
  describe('자주 쓴 게임', () => {
    it('이번 달 게임이 남은 방문만 많은 순으로 세고, 게임이 없는 예전 기록은 뺀다', () => {
      const p1 = place('p1', '가게1', '밥');
      const visits: Visit[] = [
        { id: '20260930' as any, placeId: 'p1', mode: 'wheel' }, // 지난 달
        { id: '20261001' as any, placeId: 'p1', mode: 'pinball' },
        { id: '20261002' as any, placeId: 'p1', mode: 'wheel' },
        { id: '20261005' as any, placeId: 'p1', mode: 'pinball' },
        visit('20261006', 'p1'), // 게임 기록 전
      ];
      expect(calculateStats(visits, [p1], '20261013').topGames).toEqual([
        { mode: 'pinball', count: 2 },
        { mode: 'wheel', count: 1 },
      ]);
    });
  });

  describe('empty visits', () => {
    it('빈 기록이면 모든 통계가 0', () => {
      const stats = calculateStats([], [], '20261013');
      expect(stats.totalCount).toBe(0);
      expect(stats.topPlaces).toEqual([]);
      expect(stats.categoryCount).toEqual({});
      expect(stats.distinctPlaceCount).toBe(0);
      expect(stats.badges.every((b) => !b.earned)).toBe(true);
    });
  });

  describe('monthly filtering', () => {
    it('이번 달(10월)만 계산하고 지난 달은 제외', () => {
      const p1 = place('p1', '가게1', '한식');
      const visits = [
        visit('20260930', 'p1'), // 9월
        visit('20261001', 'p1'), // 10월
        visit('20261005', 'p1'), // 10월
        visit('20261110', 'p1'), // 11월
      ];
      const stats = calculateStats(visits, [p1], '20261013');
      expect(stats.totalCount).toBe(2);
    });
  });

  describe('top places', () => {
    it('상위 3개를 횟수 많은 순으로, 동률은 최근 방문 우선', () => {
      const places = [
        place('p1', '가게1', '한식'),
        place('p2', '가게2', '면'),
        place('p3', '가게3', '고기'),
        place('p4', '가게4', '분식'),
      ];
      const visits = [
        visit('20261001', 'p1'),
        visit('20261002', 'p1'),
        visit('20261003', 'p1'), // p1: 3회
        visit('20261004', 'p2'),
        visit('20261005', 'p2'), // p2: 2회
        visit('20261006', 'p3'),
        visit('20261007', 'p3'), // p3: 2회 (최근)
        visit('20261008', 'p4'),
      ];
      const stats = calculateStats(visits, places, '20261013');
      expect(stats.topPlaces).toHaveLength(3);
      expect(stats.topPlaces[0]).toEqual({ place: places[0], count: 3 });
      expect(stats.topPlaces[1]).toEqual({ place: places[2], count: 2 }); // p3가 p2보다 최근
      expect(stats.topPlaces[2]).toEqual({ place: places[1], count: 2 });
    });

    it('상위 3개를 초과하면 자른다', () => {
      const places = [
        place('p1', '가게1', '한식'),
        place('p2', '가게2', '면'),
        place('p3', '가게3', '고기'),
        place('p4', '가게4', '분식'),
      ];
      const visits = [
        visit('20261001', 'p1'),
        visit('20261002', 'p2'),
        visit('20261003', 'p3'),
        visit('20261004', 'p4'),
      ];
      const stats = calculateStats(visits, places, '20261013');
      expect(stats.topPlaces).toHaveLength(3);
    });
  });

  describe('category count', () => {
    it('카테고리별 방문 횟수를 센다', () => {
      const places = [
        place('p1', '가게1', '한식'),
        place('p2', '가게2', '한식'),
        place('p3', '가게3', '면'),
      ];
      const visits = [
        visit('20261001', 'p1'),
        visit('20261002', 'p1'),
        visit('20261003', 'p2'),
        visit('20261004', 'p3'),
        visit('20261005', 'p3'),
        visit('20261006', 'p3'),
      ];
      const stats = calculateStats(visits, places, '20261013');
      expect(stats.categoryCount).toEqual({ '한식': 3, '면': 3 });
    });
  });

  describe('이번 달 서로 다른 가게', () => {
    it('이번 달 기록만, 같은 가게는 한 번만 센다', () => {
      const p1 = place('p1', '가게1', '한식');
      const p2 = place('p2', '가게2', '면');
      const p3 = place('p3', '가게3', '고기');
      const visits = [
        visit('20260913', 'p3'), // 지난달 — 세지 않는다
        visit('20261001', 'p1'),
        visit('20261005', 'p2'),
        visit('20261010', 'p1'), // 같은 가게 다시
      ];
      expect(calculateStats(visits, [p1, p2, p3], '20261013').distinctPlaceCount).toBe(2);
    });

    it('월말이라도 지난달에 간 가게를 "새로" 셈하지 않는다 — 이번 달에 간 곳 수 그대로', () => {
      // 예전 개척자는 31일 창 첫 등장만 봐서, 10/31 엔 9/30 이전 기록이 창 밖으로 나가
      // 늘 가던 단골까지 모두 새 가게가 됐다.
      const p1 = place('p1', '가게1', '한식');
      const visits = [visit('20260915', 'p1'), visit('20261031', 'p1')];
      const stats = calculateStats(visits, [p1], '20261031');
      expect(stats.distinctPlaceCount).toBe(1);
      expect(stats.badges.find((b) => b.id === 'variety')!.current).toBe(1);
    });
  });

  describe('badges', () => {
    it('모든 뱃지가 존재하고 earned/current/target을 가진다', () => {
      const stats = calculateStats([], [], '20261013');
      expect(stats.badges).toHaveLength(5);
      for (const badge of stats.badges) {
        expect(badge.id).toBeDefined();
        expect(badge.icon).toBeDefined();
        expect(badge.label).toBeDefined();
        expect(typeof badge.earned).toBe('boolean');
        expect(typeof badge.current).toBe('number');
        expect(typeof badge.target).toBe('number');
      }
    });

    it('🧭 이곳저곳: 이번 달 서로 다른 가게 5곳 이상', () => {
      const places = ['p1', 'p2', 'p3', 'p4', 'p5'].map((id) => place(id, id, '한식'));
      const visits = places.map((p, i) => visit(`2026100${i + 1}`, p.id));
      const stats = calculateStats(visits, places, '20261013');
      const variety = stats.badges.find((b) => b.id === 'variety')!;
      expect(variety.label).toBe('이곳저곳');
      expect(variety.hint).toBe('이번 달 서로 다른 가게');
      expect(variety.earned).toBe(true);
      expect(variety.current).toBe(5);
    });

    it('🌈 골고루: 카테고리 4종 이상', () => {
      const places = [
        place('p1', '가게1', '한식'),
        place('p2', '가게2', '면'),
        place('p3', '가게3', '고기'),
        place('p4', '가게4', '분식'),
      ];
      const visits = [
        visit('20261001', 'p1'),
        visit('20261002', 'p2'),
        visit('20261003', 'p3'),
        visit('20261004', 'p4'),
      ];
      const stats = calculateStats(visits, places, '20261013');
      const balanced = stats.badges.find((b) => b.id === 'balanced')!;
      expect(balanced.earned).toBe(true);
      expect(balanced.current).toBe(4);
    });

    it('💛 단골: 같은 곳 3번 이상', () => {
      const p1 = place('p1', '가게1', '한식');
      const visits = [
        visit('20261001', 'p1'),
        visit('20261002', 'p1'),
        visit('20261003', 'p1'),
      ];
      const stats = calculateStats(visits, [p1], '20261013');
      const regular = stats.badges.find((b) => b.id === 'regular')!;
      expect(regular.earned).toBe(true);
      expect(regular.current).toBe(3);
    });

    it('🔥 꾸준함: 평일 연속 5일', () => {
      const p1 = place('p1', '가게1', '한식');
      // 2026년 10월
      // 10월 5일(월) ~ 10월 9일(금): 연속 5 평일
      // (10월 10~11일은 토일, 건너뜀)
      const visits = [
        visit('20261005', 'p1'), // 월
        visit('20261006', 'p1'), // 화
        visit('20261007', 'p1'), // 수
        visit('20261008', 'p1'), // 목
        visit('20261009', 'p1'), // 금
      ];
      const stats = calculateStats(visits, [p1], '20261013');
      const consecutive = stats.badges.find((b) => b.id === 'consecutive')!;
      expect(consecutive.earned).toBe(true);
      expect(consecutive.current).toBe(5);
    });

    it('🔥 꾸준함: 금요일과 다음 주 월요일은 이어진다', () => {
      const p1 = place('p1', '가게1', '한식');
      const visits = [
        visit('20261007', 'p1'), // 수
        visit('20261008', 'p1'), // 목
        visit('20261009', 'p1'), // 금
        // 토일은 기록이 없어도 끊기지 않는다
        visit('20261012', 'p1'), // 월
        visit('20261013', 'p1'), // 화
      ];
      const stats = calculateStats(visits, [p1], '20261013');
      const consecutive = stats.badges.find((b) => b.id === 'consecutive')!;
      expect(consecutive.current).toBe(5);
      expect(consecutive.earned).toBe(true);
    });

    it('🔥 꾸준함: 평일을 하루 거르면 끊긴다', () => {
      const p1 = place('p1', '가게1', '한식');
      const visits = [
        visit('20261005', 'p1'), // 월
        visit('20261006', 'p1'), // 화
        // 수 거름
        visit('20261008', 'p1'), // 목
        visit('20261009', 'p1'), // 금
        visit('20261012', 'p1'), // 월
      ];
      const stats = calculateStats(visits, [p1], '20261013');
      expect(stats.badges.find((b) => b.id === 'consecutive')!.current).toBe(3);
    });

    it('🎲 점심 열 번: 이번 달 10번 이상', () => {
      const p1 = place('p1', '가게1', '한식');
      const visits = Array.from({ length: 10 }, (_, i) => visit(`202610${String(i + 1).padStart(2, '0')}`, 'p1'));
      const stats = calculateStats(visits, [p1], '20261013');
      const prolific = stats.badges.find((b) => b.id === 'prolific')!;
      expect(prolific.earned).toBe(true);
      expect(prolific.current).toBe(10);
    });
  });

  describe('month boundary', () => {
    it('9월 30일 기록은 10월 통계에 포함되지 않음', () => {
      const p1 = place('p1', '가게1', '한식');
      const visits = [
        visit('20260930', 'p1'), // 9월
        visit('20261001', 'p1'), // 10월
      ];
      const stats = calculateStats(visits, [p1], '20261001');
      expect(stats.totalCount).toBe(1);
    });
  });

  describe('progress tracking', () => {
    it('뱃지 미달 시 current/target이 진행도를 보여준다', () => {
      const places = [place('p1', '가게1', '한식'), place('p2', '가게2', '면')];
      const visits = [visit('20261001', 'p1'), visit('20261002', 'p2')];
      const stats = calculateStats(visits, places, '20261013');

      const variety = stats.badges.find((b) => b.id === 'variety')!;
      expect(variety.earned).toBe(false);
      expect(variety.current).toBe(2);
      expect(variety.target).toBe(5);
    });
  });
});
