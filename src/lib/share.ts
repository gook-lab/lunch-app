/**
 * 오늘 정한 곳을 동료에게 보내는 글.
 *
 * 결정은 한 사람이 화면 앞에서 하고, 나머지는 말로 전해 들었다. 슬랙에 붙일 한
 * 줄이 있으면 "어디로 가기로 했지?" 가 없어지고 같이 가는 사람이 는다 — 방문
 * 기록(이 도구의 생사 기준)이 쌓이는 쪽이다.
 */
import type { Place } from './candidates';
import { kakaoPlaceUrl } from './directions';

type SharedPlace = Pick<Place, 'name' | 'category' | 'sub' | 'walkMin' | 'lat' | 'lng'> & { kakaoPlaceId?: string };

export interface ShareMessage {
  /** 클립보드에 넣는 글 전체. */
  text: string;
  /** 휴대폰 공유 시트에 넘기는 값. 앱마다 text·url 을 따로 다뤄 나눠 넘긴다. */
  sheet: { title: string; text: string; url: string };
}

/**
 * 받은 사람이 어디로 가는지 바로 열 수 있게 가게 링크(카카오맵 장소, 없으면 그 자리 핀)를 넣는다.
 * 예전엔 앱 주소 한 줄뿐이라, 데모에서 보낸 링크를 열면 받은 사람 브라우저엔 가게가 없어
 * 빈 화면("아직 가게가 없어요")만 보였다(10/15). 데모는 기록이 그 브라우저에만 있으니
 * appUrl 을 null 로 받아 앱 주소를 빼고 가게 링크만 보낸다.
 */
export function shareMessage(place: SharedPlace, appUrl: string | null): ShareMessage {
  const line = `🍱 오늘 점심은 ${place.name} (${place.sub ?? place.category} · 도보 ${place.walkMin}분)`;
  const placeUrl = kakaoPlaceUrl(place);
  const text = appUrl ? `${line}\n가게: ${placeUrl}\n${appUrl}` : `${line}\n${placeUrl}`;
  const sheet = appUrl
    ? { title: '오늘 점심', text: `${line}\n가게: ${placeUrl}`, url: appUrl }
    : { title: '오늘 점심', text: line, url: placeUrl };
  return { text, sheet };
}

export type ShareResult = 'shared' | 'copied' | 'failed';

/**
 * 휴대폰은 공유 시트, 아니면 클립보드. 사용자가 시트를 닫아도 실패로 보지 않는다.
 * card 가 있고 시트가 파일을 받으면 결과 카드 그림도 같이 보낸다(그림이 대화에서 눈에 띈다).
 */
export async function sharePlace(message: ShareMessage, card?: () => Promise<File | null>): Promise<ShareResult> {
  const { text, sheet } = message;
  try {
    if (typeof navigator.share === 'function' && matchMedia?.('(pointer: coarse)').matches) {
      const file = card ? await card().catch(() => null) : null;
      const withFile = file && navigator.canShare?.({ files: [file] }) ? { ...sheet, files: [file] } : sheet;
      await navigator.share(withFile);
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
  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  area.style.position = 'fixed';
  area.style.opacity = '0';
  document.body.append(area);
  try {
    area.select();
    return document.execCommand?.('copy') ?? false;
  } catch {
    return false;
  } finally {
    // 던져도 숨긴 입력칸이 남지 않게.
    area.remove();
  }
}
