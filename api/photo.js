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
 *   카카오가 실패하면 { thumb: null, retry: true } — 없음과 달리 10분 뒤 다시 묻게 한다.
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

/**
 * 좁은 곳부터 차례로 찾는다 — 행정동 → 법정동 → 구 → 이름만.
 * 행정동만 넣으면 "불밥 신촌동" 처럼 결과가 0인 경우가 많았다(10/14 팀 가게 19곳 중 12곳).
 * 이름만으로 찾는 건 세 글자 이상일 때만. "유"·"소오" 같은 이름은 엉뚱한 사진이 나온다.
 */
export function photoQueries(name, regions) {
  const near = [regions.h, regions.b, regions.gu].filter(Boolean).map((r) => photoQuery(name, r));
  if ([...name.replace(/\s/g, '')].length >= 3) near.push(name);
  return [...new Set(near)];
}

/** 썸네일이 있는 결과 앞에서부터 최대 넷. 첫 장이 대표 사진이다. 이미지 검색은 정확도 순이다. */
export const MAX_PHOTOS = 4;
export function pickPhoto(documents) {
  const docs = (documents ?? []).filter(
    (d) => typeof d.thumbnail_url === 'string' && d.thumbnail_url.startsWith('https://'),
  );
  if (docs.length === 0) return null;
  const photos = [...new Set(docs.map((d) => d.thumbnail_url))].slice(0, MAX_PHOTOS);
  return { thumb: photos[0], source: docs[0].display_sitename || null, photos };
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
    const areas = region.documents ?? [];
    const regions = {
      h: areas.find((d) => d.region_type === 'H')?.region_3depth_name,
      b: areas.find((d) => d.region_type === 'B')?.region_3depth_name,
      gu: areas[0]?.region_2depth_name,
    };
    // 지역을 붙인 검색끼리는 넷이 찰 때까지 이어 모은다. 이름만 검색은 하나도 못 찾았을 때만.
    const near = photoQueries(name, regions);
    const nameOnly = near.at(-1) === name ? near.pop() : null;
    const docs = [];
    for (const query of near) {
      const found = await kakao(`/v2/search/image?query=${encodeURIComponent(query)}&sort=accuracy&size=8`, key);
      docs.push(...(found.documents ?? []));
      if ((pickPhoto(docs)?.photos.length ?? 0) >= MAX_PHOTOS) break;
    }
    if (!pickPhoto(docs) && nameOnly) {
      const found = await kakao(`/v2/search/image?query=${encodeURIComponent(nameOnly)}&sort=accuracy&size=8`, key);
      docs.push(...(found.documents ?? []));
    }
    const photo = pickPhoto(docs);
    res.setHeader('Cache-Control', `public, s-maxage=${30 * DAY}, stale-while-revalidate=${DAY}`);
    res.status(200).json(photo ?? { thumb: null });
  } catch {
    // 카카오가 잠깐 실패(쿼터·타임아웃)한 것이지 사진이 없는 게 아니다. retry 로 구분해 보내야
    // 브라우저가 '없음' 으로 하루 기억하지 않고 10분 뒤 다시 묻는다. CDN 도 10분만 기억한다.
    res.setHeader('Cache-Control', 'public, s-maxage=600');
    res.status(200).json({ thumb: null, retry: true });
  }
}
