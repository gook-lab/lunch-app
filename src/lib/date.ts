/**
 * 날짜 경계 — KST 고정 (엔지니어링 리뷰 D4).
 *
 * 기기 시계 설정을 따라가면 노트북을 UTC 로 둔 사람 한 명이 오전 9시에 "어제"
 * 문서를 열게 되고, 같은 날 visits 문서가 두 개 생긴다. 점심이라는 개념 자체가
 * KST 고정이므로 앱은 항상 Asia/Seoul 기준으로 판단한다.
 *
 * 같은 판단을 Firestore 규칙에서도 해야 하지만 **규칙은 이 코드를 쓸 수 없다**.
 * 규칙 언어에는 타임존 변환도 zero-pad 포맷도 없고 request.time.year() 는 항상
 * UTC 다. 규칙 쪽 구현은 firestore.rules 의 isTodayKST() 를 본다.
 * 구현은 둘, 계약은 하나 — 그 계약을 지키는 것은 테스트다.
 */

/** 'YYYYMMDD' 형식의 KST 날짜. visits 문서 id 로 쓴다. */
export type DayId = string;

const KST_FORMATTER = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Seoul',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** 주어진 시각(기본값: 지금)의 KST 날짜를 'YYYYMMDD' 로 돌려준다. */
export function todayKST(now: Date = new Date()): DayId {
  // en-CA 는 YYYY-MM-DD 를 zero-pad 해서 준다. 하이픈만 뗀다.
  return KST_FORMATTER.format(now).replaceAll('-', '');
}

/** DayId 를 UTC 자정 기준 Date 로. 날짜 간 일수 계산에만 쓴다. */
function dayIdToUTC(dayId: DayId): number {
  const y = Number(dayId.slice(0, 4));
  const m = Number(dayId.slice(4, 6));
  const d = Number(dayId.slice(6, 8));
  return Date.UTC(y, m - 1, d);
}

const MS_PER_DAY = 86_400_000;

/**
 * from 부터 to 까지 며칠인가. 같은 날이면 0, 어제면 1.
 * 문자열 비교가 아니라 실제 날짜로 세므로 월·해 경계에서도 맞다.
 */
export function daysBetween(from: DayId, to: DayId): number {
  return Math.round((dayIdToUTC(to) - dayIdToUTC(from)) / MS_PER_DAY);
}

/** today 로부터 windowDays 일 전의 DayId. 범위 쿼리 하한으로 쓴다. */
export function dayIdBefore(today: DayId, windowDays: number): DayId {
  const t = new Date(dayIdToUTC(today) - windowDays * MS_PER_DAY);
  const y = t.getUTCFullYear();
  const m = String(t.getUTCMonth() + 1).padStart(2, '0');
  const d = String(t.getUTCDate()).padStart(2, '0');
  return `${y}${m}${d}`;
}
