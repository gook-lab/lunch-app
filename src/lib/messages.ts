/**
 * 화면 문구 — 후보 산출 결과를 사람 말로 바꾼다.
 *
 * 이 앱의 공정성 연출은 "몰래 풀지 않고 밝히고 푼다" 하나로 서 있다.
 * 그래서 문구에 들어가는 숫자가 틀리면 기능의 명분이 사라진다. 순수 함수로
 * 빼서 테스트로 고정하는 이유가 그것이다.
 *
 * 카피는 "2주", 스펙·구현은 "14일" 로 쓴다 (설계 Success Criteria).
 */
import type { CandidateResult } from './candidates';
import { HEALTHY_POOL_SIZE, MIN_CANDIDATES } from './candidates';

/** 후보가 0곳일 때 원인을 짚는다. 칩을 대신 풀어주지는 않는다. */
export function emptyMessage(result: CandidateResult): string | null {
  const reason = result.emptyReason;
  if (!reason) return null;

  switch (reason.kind) {
    case 'no-places':
      return '아직 등록된 가게가 없습니다. 지도 탭에서 몇 곳 넣어 주세요.';
    case 'all-inactive':
      return `등록된 ${reason.total}곳이 모두 꺼져 있습니다. 목록에서 다시 켜 주세요.`;
    case 'walk':
      return reason.countAtWiderWalk > 0
        ? `도보 ${reason.widerWalkMin}분으로 넓히면 ${reason.countAtWiderWalk}곳입니다.`
        : `도보 ${reason.widerWalkMin}분으로 넓혀도 해당하는 곳이 없습니다.`;
    case 'category':
      return `고른 카테고리에 해당하는 곳이 없습니다. 카테고리를 풀면 ${reason.countWithoutCategory}곳입니다.`;
  }
}

/**
 * 후보가 있을 때 아래에 붙는 한 줄.
 * 숫자는 전부 단계별 카운트에서 나온다 — afterCategoryCount 가 "N곳 중" 이고
 * recentlyVisitedCount 가 "M곳은 최근에 갔습니다" 다. 이 둘을 헷갈리면
 * 화면 숫자가 실제와 어긋난다.
 */
export function noticeMessage(result: CandidateResult): string | null {
  if (result.emptyReason) return null;

  const { afterCategoryCount, recentlyVisitedCount, releasedCount, shortOfMinimum } = result;

  if (shortOfMinimum) {
    return `후보가 ${result.candidates.length}곳뿐입니다. 가게가 ${HEALTHY_POOL_SIZE}곳은 돼야 최근 방문 제외가 제대로 돌아갑니다.`;
  }

  // 제외를 껐으면 최근에 간 곳도 그대로 후보다. "빠졌습니다" 는 거짓이 된다.
  if (!result.excludedRecent) {
    return recentlyVisitedCount > 0
      ? `최근 2주 제외를 꺼서 최근에 간 ${recentlyVisitedCount}곳도 후보에 들어 있습니다.`
      : null;
  }

  if (releasedCount > 0) {
    return `${afterCategoryCount}곳 중 ${recentlyVisitedCount}곳은 최근 2주 안에 갔습니다 — 후보 ${MIN_CANDIDATES}곳을 채우려고 그 중 오래된 ${releasedCount}곳을 다시 넣었습니다.`;
  }

  if (recentlyVisitedCount > 0) {
    return `최근 2주 안에 간 ${recentlyVisitedCount}곳은 빠졌습니다.`;
  }

  return null;
}

/**
 * 목록 탭 머리말의 최근 방문 문구. 로드맵에서 제외를 끈 상태면 "빠집니다" 라고
 * 말하면 안 된다 — 같은 거짓말을 noticeMessage 에서 한 번 고쳤다.
 */
export function recentNote(recentCount: number, excludeRecent: boolean): string {
  if (recentCount === 0) return '최근 2주에 간 곳 없음';
  if (!excludeRecent) return `최근 2주 제외를 꺼 둬서 최근에 간 ${recentCount}곳도 오늘 후보입니다`;
  return `최근 2주에 간 ${recentCount}곳은 오늘 후보에서 빠집니다`;
}
