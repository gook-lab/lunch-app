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
      return `가게 ${reason.total}곳을 모두 잠시 빼 뒀어요. 목록에서 되돌리면 바로 고를 수 있어요.`;
    case 'walk':
      return reason.countAtWiderWalk > 0
        ? `도보 ${reason.widerWalkMin}분까지 넓히면 ${reason.countAtWiderWalk}곳에서 고를 수 있어요.`
        : `걸어서 ${reason.widerWalkMin}분 안에는 아직 가게가 없어요. 회사 근처 가게를 넣어 볼까요?`;
    case 'category':
      return `메뉴를 전체로 보면 ${reason.countWithoutCategory}곳에서 고를 수 있어요.`;
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
    // 후보가 모자라 최근에 간 곳을 다시 넣었으면 그것도 밝힌다. 빼고 고르는 줄 알았다가 어제 간 곳이 나온다.
    const released = releasedCount > 0 ? ` 최근 1주에 간 ${releasedCount}곳도 함께 골라요.` : '';
    // 모자란 까닭이 사용자가 좁힌 도보·카테고리면 그걸 짚는다. 이때 "가게가
    // 20곳은 돼야" 는 엉뚱한 처방이다 — 양식 1곳만 골라도 그 문구가 떴다(10/8).
    if (afterCategoryCount < result.activeCount) {
      return `지금은 ${result.candidates.length}곳에서 골라요. 도보 시간을 늘리거나 다른 메뉴도 보면 더 많아져요.${released}`;
    }
    // "최근 방문 제외가 제대로 돌아가요" 는 처음 온 사람에게 고장 안내처럼 읽혔다(10/9).
    // 숫자(20곳)는 실측 근거가 있어 남기고, 할 일(가게 더 넣기)과 이득으로 바꿔 말한다.
    // 몇 곳 중에 고르는지는 돌리기 단추·조건 머리말이 이미 말한다. 2곳이면 같은 수를 세 번 말했다(10/15).
    return `가게를 ${HEALTHY_POOL_SIZE}곳쯤 넣어 두면 같은 가게가 덜 나와요.${released}`;
  }

  // 제외를 껐으면 최근에 간 곳도 그대로 후보다. "빠졌습니다" 는 거짓이 된다.
  if (!result.excludedRecent) {
    return recentlyVisitedCount > 0
      ? `최근 1주 제외를 꺼 둬서, 최근에 간 ${recentlyVisitedCount}곳도 같이 골라요.`
      : null;
  }

  if (releasedCount > 0) {
    return `${afterCategoryCount}곳 중 ${recentlyVisitedCount}곳은 최근 1주 안에 다녀왔어요. 선택지가 너무 적어지지 않게 오래전에 간 ${releasedCount}곳은 함께 골라요.`;
  }

  if (recentlyVisitedCount > 0) {
    return `최근 1주 안에 간 ${recentlyVisitedCount}곳은 빼고 골라요.`;
  }

  return null;
}

/** 목록 머리말이 쓰는 후보 산출 결과 일부. 돌림판과 같은 selectCandidates 결과여야 숫자가 맞는다. */
export type RecentSummary = Pick<CandidateResult, 'recentlyVisitedCount' | 'releasedCount' | 'excludedRecent'>;

/**
 * 목록 탭 머리말의 최근 방문 문구. 로드맵에서 제외를 끈 상태면 "빠집니다" 라고
 * 말하면 안 된다 — 같은 거짓말을 noticeMessage 에서 한 번 고쳤다.
 *
 * 숫자는 목록이 따로 세지 않고 App 의 selectCandidates 결과를 받는다. 목록에서 세면
 * 도보·메뉴 칩과 5곳 채우려고 다시 넣은 곳을 몰라, 돌림판엔 있는 가게를 "고르지 않아요"
 * 라고 말했다(10/15 리뷰).
 */
export function recentNote({ recentlyVisitedCount: recent, releasedCount: released, excludedRecent }: RecentSummary): string {
  if (recent === 0) return '최근 1주에 간 곳이 없어요';
  if (!excludedRecent) return `최근 1주 제외를 꺼 둬서 최근에 간 ${recent}곳도 오늘 함께 골라요`;
  const skipped = recent - released;
  if (skipped === 0) return `가게가 모자라서 최근 1주에 간 ${recent}곳도 오늘 함께 골라요`;
  if (released > 0) return `최근 1주에 간 ${skipped}곳은 오늘 고르지 않아요 · ${released}곳은 다시 넣었어요`;
  return `최근 1주에 간 ${skipped}곳은 오늘 고르지 않아요`;
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
const COUNT_WORDS = ['', '한', '두', '세', '네', '다섯', '여섯', '일곱', '여덟', '아홉', '열'];
/** 1~10 은 "두 곳" 처럼 말로, 그 밖은 숫자 그대로. */
export function countWord(n: number): string {
  return COUNT_WORDS[n] ?? String(n);
}

export function gameGate(
  result: CandidateResult,
  filters: Pick<Filters, 'maxWalkMin' | 'categories' | 'cuisines'>,
): GameGate | null {
  const count = result.candidates.length;
  if (count >= MIN_GAME_CANDIDATES) return null;
  // "2곳부터" 처럼 숫자+곳은 말로 읽으면 어색했다(10/14). 말할 때처럼 "두 곳" 으로 쓴다.
  const rule = `가게가 ${countWord(MIN_GAME_CANDIDATES)} 곳 이상이면 게임을 시작할 수 있어요.`;
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
  // 안 되는 이유보다 무엇이 모자란지를 먼저 말한다. 규칙 문장은 제목이 대신한다.
  const title = '한 곳만 더 있으면 시작할 수 있어요';
  if (
    result.afterCategoryCount < result.activeCount &&
    (filters.categories.length > 0 || (filters.cuisines?.length ?? 0) > 0)
  ) {
    return { title, lines: ['메뉴를 전체로 바꾸면 가게가 더 나와요.'], fix: { kind: 'category' } };
  }
  if (result.activeCount > count && wider) {
    return { title, lines: [`도보 ${wider}분까지 넓히면 가게가 더 나와요.`], fix: { kind: 'walk', walkMin: wider } };
  }
  return { title, lines: ['지도에서 가게를 하나 더 넣어 주세요.'], fix: { kind: 'add' } };
}
