/**
 * 오늘 정한 곳을 동료에게 보내는 글.
 *
 * 결정은 한 사람이 화면 앞에서 하고, 나머지는 말로 전해 들었다. 슬랙에 붙일 한
 * 줄이 있으면 "어디로 가기로 했지?" 가 없어지고 같이 가는 사람이 는다 — 방문
 * 기록(이 도구의 생사 기준)이 쌓이는 쪽이다.
 */
import type { Place } from './candidates';

export function shareText(place: Pick<Place, 'name' | 'category' | 'walkMin'>, url: string): string {
  return `🍱 오늘 점심은 ${place.name} (${place.category} · 도보 ${place.walkMin}분)\n${url}`;
}

export type ShareResult = 'shared' | 'copied' | 'failed';

/** 휴대폰은 공유 시트, 아니면 클립보드. 사용자가 시트를 닫아도 실패로 보지 않는다. */
export async function sharePlace(text: string): Promise<ShareResult> {
  try {
    if (typeof navigator.share === 'function' && matchMedia?.('(pointer: coarse)').matches) {
      await navigator.share({ text });
      return 'shared';
    }
  } catch (error) {
    if ((error as Error)?.name === 'AbortError') return 'shared';
  }
  try {
    await navigator.clipboard.writeText(text);
    return 'copied';
  } catch {
    // http 로 사내망 주소에 들어오면 clipboard API 자체가 없다. 옛 방식으로 한 번 더.
    return legacyCopy(text) ? 'copied' : 'failed';
  }
}

function legacyCopy(text: string): boolean {
  try {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.append(area);
    area.select();
    const ok = document.execCommand?.('copy') ?? false;
    area.remove();
    return ok;
  } catch {
    return false;
  }
}
