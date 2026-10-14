/**
 * 가게 사진 한 장 — Vercel 서버 함수. GET /api/photo?name=…&lat=…&lng=…
 *
 * 카카오 장소 API 는 사진을 주지 않는다. 그래서 다음 이미지 검색으로 "가게 이름 + 동" 을 찾아
 * 첫 결과의 썸네일을 돌려준다. 이름만 넣으면 체인·흔한 이름에서 엉뚱한 사진이 나와,
 * 좌표를 행정동 이름으로 바꿔 함께 넣는다.
 *
 * - REST 키는 서버에만 둔다(KAKAO_REST_KEY). 브라우저에 넣으면 누구나 꺼내 할당량을 쓴다.
 * - 원본 이미지 대신 카카오 CDN 썸네일을 준다. 블로그 원본은 다른 사이트에서 직접 불러오면 막힌다.
 * - 같은 가게는 CDN 이 30일 동안 기억한다. 사진이 없거나 키가 없으면 { thumb: null }.
 */
const KAKAO = 'https://dapi.kakao.com';
const MAX_NAME = 40;
const DAY = 24 * 60 * 60;

export function inKorea(lat, lng) {
  return Number.isFinite(lat) && Number.isFinite(lng) && lat > 33 && lat < 39 && lng > 124 && lng < 132;
}

export function photoQuery(name, dong) {
  return dong ? `${name} ${dong}` : name;
}

/** 첫 결과 중 썸네일이 있는 것. 이미지 검색은 정확도 순이다. */
export function pickPhoto(documents) {
  const doc = (documents ?? []).find((d) => typeof d.thumbnail_url === 'string' && d.thumbnail_url.startsWith('https://'));
  return doc ? { thumb: doc.thumbnail_url, source: doc.display_sitename || null } : null;
}

async function kakao(path, key) {
  const res = await fetch(`${KAKAO}${path}`, { headers: { Authorization: `KakaoAK ${key}` } });
  if (!res.ok) throw new Error(`kakao ${res.status}`);
  return res.json();
}

export default async function handler(req, res) {
  const url = new URL(req.url, 'http://local');
  const name = (url.searchParams.get('name') ?? '').trim();
  const lat = Number(url.searchParams.get('lat'));
  const lng = Number(url.searchParams.get('lng'));
  if (!name || name.length > MAX_NAME || !inKorea(lat, lng)) {
    res.status(400).json({ thumb: null });
    return;
  }
  const key = process.env.KAKAO_REST_KEY;
  if (!key) {
    // 키가 없으면 사진 없이 동작한다. 하루만 기억해 키를 넣은 뒤 금방 다시 찾게 한다.
    res.setHeader('Cache-Control', `public, s-maxage=${DAY}`);
    res.status(200).json({ thumb: null });
    return;
  }
  try {
    const region = await kakao(`/v2/local/geo/coord2regioncode.json?x=${lng}&y=${lat}`, key);
    const dong = region.documents?.find((d) => d.region_type === 'H')?.region_3depth_name || '';
    const q = encodeURIComponent(photoQuery(name, dong));
    const found = await kakao(`/v2/search/image?query=${q}&sort=accuracy&size=5`, key);
    res.setHeader('Cache-Control', `public, s-maxage=${30 * DAY}, stale-while-revalidate=${DAY}`);
    res.status(200).json(pickPhoto(found.documents) ?? { thumb: null });
  } catch {
    res.setHeader('Cache-Control', 'public, s-maxage=600');
    res.status(200).json({ thumb: null });
  }
}
