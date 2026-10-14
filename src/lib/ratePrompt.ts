/**
 * 다음 날 별점 묻기 — "어제 ○○ 어땠어요?" 한 줄을 띄울 가게를 고른다.
 *
 * 안내(README·Tour 5단계)는 "다녀온 곳엔 별점을 남겨 주세요" 라고 하는데, 정작 다음 날
 * 앱을 열어도 그걸 짚어 주는 곳이 없었다. 별점은 목록·지도에서 가게를 찾아 들어가야만
 * 남길 수 있었다(10/15). 결정 직후가 아니라 다녀온 뒤에 묻는 게 맞으므로 오늘이 아닌
 * 가장 최근 결정을 본다. 금요일 결정은 월요일에 물을 수 있게 사흘 전까지 본다.
 * 당첨과는 무관하다 — 별점은 후보 산출에 쓰이지 않는다.
 */
import type { Place, Visit } from './candidates';
import { daysBetween, type DayId } from './date';

/** 이보다 오래된 결정은 묻지 않는다. 기억이 흐려진 뒤라 대답이 의미가 없다. */
export const RATE_PROMPT_MAX_DAYS = 3;

export interface RatePromptTarget {
  place: Place;
  dayId: DayId;
  /** "어제" · "그저께" · "3일 전". */
  when: string;
}

export function ratePromptTarget(
  visits: Visit[],
  places: Place[],
  today: DayId,
  /** 내가 이미 별점을 남긴 가게. */
  ratedByMe: (placeId: string) => boolean,
): RatePromptTarget | null {
  const past = visits
    .filter((v) => v.id < today)
    .sort((a, b) => (a.id < b.id ? 1 : -1))[0];
  if (!past) return null;
  const days = daysBetween(past.id, today);
  if (days < 1 || days > RATE_PROMPT_MAX_DAYS) return null;
  const place = places.find((p) => p.id === past.placeId);
  if (!place || ratedByMe(place.id)) return null;
  const when = days === 1 ? '어제' : days === 2 ? '그저께' : `${days}일 전`;
  return { place, dayId: past.id, when };
}

const DISMISS_KEY = 'lunch-app:rate-prompt';

/** 닫았거나 남긴 날. 그날은 다시 띄우지 않는다. 저장소가 막혀 있으면 이번 화면에서만 닫힌다. */
export function promptDismissed(today: DayId): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === today;
  } catch {
    return false;
  }
}

export function dismissPrompt(today: DayId): void {
  try {
    localStorage.setItem(DISMISS_KEY, today);
  } catch {
    // 기억하지 못해도 지금 화면에선 닫힌다.
  }
}
