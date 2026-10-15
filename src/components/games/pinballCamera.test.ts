/**
 * 핀볼 끝 장면 카메라 — 1등이 들어온 뒤(HOLD)에도 당첨 구슬이 들어간 출구를 비춘다.
 * 예전엔 아직 안 들어온 구슬만 선두로 쳐서, 후보 2곳이면 끝 장면에 2등 구슬만 보였다(리뷰 재현).
 */
import { describe, expect, it } from 'vitest';
import { BOARD_H, FINISH_Y, raceForWinner } from '../../lib/pinball';
import { timingFor } from '../../lib/pinballTiming';
import { cameraY } from './Pinball';

describe('핀볼 끝 장면 카메라', () => {
  it('마지막 프레임에 당첨 구슬(출구)이 화면 안에 있다', () => {
    for (const viewH of [440, 340]) {
      for (const n of [2, 3, 7]) {
        for (let seed = 1; seed <= 20; seed += 1) {
          const race = raceForWinner(n, n - 1, seed)!;
          // 재생은 1등 뒤 HOLD 까지만 한다 — 그 마지막 프레임이 끝 장면이다.
          const last = timingFor(race.frames.length, race.winnerFrame).at.length - 1;
          const cam = cameraY(race, last, viewH);
          const y = race.frames[last][race.winner].y;
          expect(y).toBeGreaterThanOrEqual(FINISH_Y);
          expect(y).toBeLessThanOrEqual(cam + viewH);
          // 출구에 고정 — 판 바닥까지 내려가 있다.
          expect(cam).toBe(BOARD_H - viewH);
        }
      }
    }
  }, 30_000); // 핀볼 물리를 끝까지 돌린다. 혼자면 통과하지만 게임 18종 테스트와 같이 돌면 기본 5초를 넘겼다(10/15).
});
