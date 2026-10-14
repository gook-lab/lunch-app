/**
 * 화면 문구 — 후보 산출 결과를 사람 말로 바꾼다.
 *
 * 이 앱의 공정성 연출은 "몰래 풀지 않고 밝히고 푼다" 하나로 서 있다.
 * 그래서 문구에 들어가는 숫자가 틀리면 기능의 명분이 사라진다. 순수 함수로
 * 빼서 테스트로 고정하는 이유가 그것이다.
 *
 * 카피는 "1주", 스펙·구현은 "7일" 로 쓴다 (설계 Success Criteria).
 */
import type { CandidateResult, Filters } from './candidates';
import { HEALTHY_POOL_SIZE, MIN_GAME_CANDIDATES, WALK_STEPS } from './candidates';

/** 후보가 0곳일 때 원인을 짚는다. 칩을 대신 풀어주지는 않는다. */
export function emptyMessage(result: CandidateResult): string | null {
  const reason = result.emptyReason;
  if (!reason) return null;

  switch (reason.kind) {
    case 'no-places':
      return '아직 가게가 없어요. 지도에서 자주 가는 곳을 넣어 볼까요?';
    case 'all-inactive':
      return `가게 ${reason.total}곳이 모두 꺼져 있어요. 목록에서 켜면 바로 고를 수 있어요.`;
    case 'walk':
      return reason.countAtWiderWalk > 0
        ? `도보 ${reason.widerWalkMin}분까지 넓히면 ${reason.countAtWiderWalk}곳이 있어요.`
        : `걸어서 ${reason.widerWalkMin}분 안에는 아직 가게가 없어요. 회사 근처 가게를 넣어 볼까요?`;
    case 'category':
      return `고른 메뉴에는 아직 가게가 없어요. 메뉴를 전체로 보면 ${reason.countWithoutCategory}곳이 있어요.`;
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
    // 모자란 까닭이 사용자가 좁힌 도보·카테고리면 그걸 짚는다. 이때 "가게가
    // 20곳은 돼야" 는 엉뚱한 처방이다 — 양식 1곳만 골라도 그 문구가 떴다(10/8).
    if (afterCategoryCount < result.activeCount) {
      return `지금 조건에서는 ${result.candidates.length}곳 중에 골라요. 도보 시간이나 메뉴를 넓히면 더 다양해져요.`;
    }
    // "최근 방문 제외가 제대로 돌아가요" 는 처음 온 사람에게 고장 안내처럼 읽혔다(10/9).
    // 숫자(20곳)는 실측 근거가 있어 남기고, 할 일(가게 더 넣기)과 이득으로 바꿔 말한다.
    return `${result.candidates.length}곳 중에 골라요. 가게를 ${HEALTHY_POOL_SIZE}곳쯤 넣어 두면 같은 곳이 덜 나와요.`;
  }

  // 제외를 껐으면 최근에 간 곳도 그대로 후보다. "빠졌습니다" 는 거짓이 된다.
  if (!result.excludedRecent) {
    return recentlyVisitedCount > 0
      ? `최근 1주 제외를 꺼 둬서, 최근에 간 ${recentlyVisitedCount}곳도 같이 골라요.`
      : null;
  }

  if (releasedCount > 0) {
    return `${afterCategoryCount}곳 중 ${recentlyVisitedCount}곳은 최근 1주 안에 다녀왔어요. 고를 곳이 너무 줄지 않게 오래전에 간 ${releasedCount}곳은 다시 넣었어요.`;
  }

  if (recentlyVisitedCount > 0) {
    return `최근 1주 안에 간 ${recentlyVisitedCount}곳은 빼고 골라요.`;
  }

  return null;
}

/**
 * 목록 탭 머리말의 최근 방문 문구. 로드맵에서 제외를 끈 상태면 "빠집니다" 라고
 * 말하면 안 된다 — 같은 거짓말을 noticeMessage 에서 한 번 고쳤다.
 */
export function recentNote(recentCount: number, excludeRecent: boolean): string {
  if (recentCount === 0) return '최근 1주에 간 곳이 없어요';
  if (!excludeRecent) return `최근 1주 제외를 꺼 둬서 최근에 간 ${recentCount}곳도 오늘 후보예요`;
  return `최근 1주에 간 ${recentCount}곳은 오늘 후보에서 빠져요`;
}

/** 게임을 못 돌릴 때 무대에 띄우는 안내와, 바로 풀 수 있는 한 가지 방법. */
export interface GameGate {
  title: string;
  lines: string[];
  fix: { kind: 'add' } | { kind: 'list' } | { kind: 'walk'; walkMin: number } | { kind: 'category' };
}

/**
 * 후보가 2곳보다 적으면 게임판 대신 이유와 할 일을 보여 준다. 예전엔 빈 판 아래
 * 비활성 버튼과 작은 글씨 한 줄뿐이라 고장 난 화면처럼 보였다(10/14 사용자).
 */
export function gameGate(
  result: CandidateResult,
  filters: Pick<Filters, 'maxWalkMin' | 'categories'>,
): GameGate | null {
  const count = result.candidates.length;
  if (count >= MIN_GAME_CANDIDATES) return null;
  const rule = `게임은 ${MIN_GAME_CANDIDATES}곳부터 할 수 있어요.`;
  const wider = WALK_STEPS.find((step) => step > filters.maxWalkMin);

  if (count === 0) {
    const reason = result.emptyReason;
    const why = emptyMessage(result);
    const lines = why ? [rule, why] : [rule];
    if (reason?.kind === 'all-inactive') return { title: '아직 고를 가게가 없어요', lines, fix: { kind: 'list' } };
    if (reason?.kind === 'walk' && reason.countAtWiderWalk > 0) {
      return { title: '아직 고를 가게가 없어요', lines, fix: { kind: 'walk', walkMin: reason.widerWalkMin } };
    }
    if (reason?.kind === 'category') return { title: '아직 고를 가게가 없어요', lines, fix: { kind: 'category' } };
    return { title: '아직 고를 가게가 없어요', lines, fix: { kind: 'add' } };
  }

  // 1곳. 사용자가 좁힌 범위 탓이면 넓히기를, 아니면 가게 더 넣기를 권한다.
  const title = '고를 곳이 한 곳뿐이에요';
  if (result.afterCategoryCount < result.activeCount && filters.categories.length > 0) {
    return { title, lines: [rule, '메뉴를 전체로 보면 더 많아져요.'], fix: { kind: 'category' } };
  }
  if (result.activeCount > count && wider) {
    return { title, lines: [rule, `도보 ${wider}분까지 넓혀 볼까요?`], fix: { kind: 'walk', walkMin: wider } };
  }
  return { title, lines: [rule, '한 곳만 더 넣으면 바로 할 수 있어요.'], fix: { kind: 'add' } };
}
