/**
 * 로컬 확인용 가짜 데이터. **에뮬레이터에서만 돈다.**
 *
 * 실제 시드는 scripts/seed.mjs + seed/places.json 이고, 그건 관찰 결과로 채운다.
 * 이 파일의 가게는 전부 이름에 "샘플" 이 붙어 있다 — 실제 목록과 섞이면
 * 2주차 판정 숫자가 오염되므로 한눈에 구분되게 둔다.
 *
 * 과거 날짜 visits 는 규칙이 막는다(의도된 동작: 지난 날짜는 불변). 그래서
 * 에뮬레이터 REST 에 owner 토큰으로 직접 넣는다. 프로덕션에서는 불가능한 경로다.
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const host = process.env.FIRESTORE_EMULATOR_HOST;
if (!host) {
  console.error('\nFIRESTORE_EMULATOR_HOST 가 없습니다. 이 스크립트는 에뮬레이터에서만 씁니다.');
  console.error('pnpm dev:emu 로 실행하세요.');
  process.exit(1);
}

function loadEnv() {
  const env = {};
  for (const file of ['.env.local', '.env']) {
    let raw;
    try {
      raw = readFileSync(resolve(root, file), 'utf8');
    } catch {
      continue;
    }
    for (const line of raw.split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !(m[1] in env)) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
  return env;
}

const env = loadEnv();
const projectId = env.VITE_FIREBASE_PROJECT_ID;
const office = { lat: Number(env.VITE_OFFICE_LAT), lng: Number(env.VITE_OFFICE_LNG) };

if (!projectId) {
  console.error('\nVITE_FIREBASE_PROJECT_ID 가 .env.local 에 없습니다.');
  process.exit(1);
}
if (!Number.isFinite(office.lat) || !Number.isFinite(office.lng)) {
  console.error('\nVITE_OFFICE_LAT / VITE_OFFICE_LNG 가 .env.local 에 없습니다.');
  console.error('로컬 확인용이라면 아무 좌표나 넣어도 되지만, 실제 배포 전에는 사무실 실제 좌표로 바꿔야 합니다.');
  process.exit(1);
}

const base = `http://${host}/v1/projects/${projectId}/databases/(default)/documents`;
const OWNER = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' };

const DETOUR_FACTOR = 1.3;
const METERS_PER_MINUTE = 67;
const EARTH_RADIUS_M = 6_371_000;
const toRad = (d) => (d * Math.PI) / 180;

function walkMinutes(lat, lng) {
  const dLat = toRad(lat - office.lat);
  const dLng = toRad(lng - office.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(office.lat)) * Math.cos(toRad(lat)) * Math.sin(dLng / 2) ** 2;
  const meters = 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
  return Math.max(1, Math.round((meters * DETOUR_FACTOR) / METERS_PER_MINUTE));
}

/** 사무실에서 북쪽으로 meters 만큼. 도보시간 분포를 만들려고 거리만 벌린다. */
function northOf(meters) {
  return { lat: office.lat + meters / 111_320, lng: office.lng };
}

const KST = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Seoul',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});
const todayKST = () => KST.format(new Date()).replaceAll('-', '');
const dayIdBefore = (dayId, days) => {
  const y = Number(dayId.slice(0, 4));
  const m = Number(dayId.slice(4, 6));
  const d = Number(dayId.slice(6, 8));
  const t = new Date(Date.UTC(y, m - 1, d) - days * 86_400_000);
  return `${t.getUTCFullYear()}${String(t.getUTCMonth() + 1).padStart(2, '0')}${String(t.getUTCDate()).padStart(2, '0')}`;
};

// 도보 3~18분에 걸쳐 12곳. 카테고리와 거리를 섞어 칩 조합을 눌러볼 수 있게 한다.
const FIXTURE = [
  ['샘플 한식집 1', '한식', 200],
  ['샘플 한식집 2', '한식', 320],
  ['샘플 한식집 3', '한식', 450],
  ['샘플 면집 1', '면', 260],
  ['샘플 면집 2', '면', 380],
  ['샘플 면집 3', '면', 700],
  ['샘플 고기집 1', '고기', 300],
  ['샘플 고기집 2', '고기', 540],
  ['샘플 분식집 1', '분식', 180],
  ['샘플 분식집 2', '분식', 480],
  ['샘플 양식집 1', '양식', 620],
  ['샘플 중식집 1', '중식', 900],
];

function docFields(place) {
  return {
    fields: {
      name: { stringValue: place.name },
      category: { stringValue: place.category },
      lat: { doubleValue: place.lat },
      lng: { doubleValue: place.lng },
      walkMin: { integerValue: String(place.walkMin) },
      kakaoPlaceId: { stringValue: place.kakaoPlaceId },
      active: { booleanValue: place.active },
      createdBy: { stringValue: 'fixture' },
    },
  };
}

async function post(path, body) {
  const res = await fetch(`${base}/${path}`, {
    method: 'POST',
    headers: OWNER,
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${path}: ${res.status} ${await res.text()}`);
  return res.json();
}

async function listIds(collectionName) {
  const res = await fetch(`${base}/${collectionName}?pageSize=300`, { headers: OWNER });
  if (!res.ok) return [];
  const body = await res.json();
  return (body.documents ?? []).map((d) => d.name.split('/').pop());
}

const existing = await listIds('places');
if (existing.length > 0) {
  console.log(`\n픽스처 건너뜀 — places 에 이미 ${existing.length}건 있습니다.`);
  process.exit(0);
}

const prepared = FIXTURE.map(([name, category, meters], i) => {
  const { lat, lng } = northOf(meters);
  return {
    name,
    category,
    lat,
    lng,
    walkMin: walkMinutes(lat, lng),
    kakaoPlaceId: `fixture-${i + 1}`,
    active: i !== FIXTURE.length - 1, // 마지막 한 곳은 꺼진 상태 — 목록 탭 확인용
  };
});

const created = [];
for (const place of prepared) {
  const doc = await post('places', docFields(place));
  created.push({ id: doc.name.split('/').pop(), ...place });
}

console.log(`\n샘플 가게 ${created.length}곳 (마지막 1곳은 꺼진 상태)`);
for (const p of created) {
  console.log(`  ${p.name.padEnd(14)} ${p.category.padEnd(3)} 도보 ${String(p.walkMin).padStart(2)}분${p.active ? '' : '  (꺼짐)'}`);
}

// 최근 방문 기록. 보정 문구를 눌러볼 수 있게 활성 11곳 중 7곳을 최근에 간 것으로 둔다.
// 1·2·3·4·5일 전 + 11·13일 전 — 보정이 오래된 쪽부터 푸는지 확인할 수 있다.
const today = todayKST();
const recent = [1, 2, 3, 4, 5, 11, 13];
const active = created.filter((p) => p.active);

for (const [i, daysAgo] of recent.entries()) {
  const place = active[i];
  await post(`visits?documentId=${dayIdBefore(today, daysAgo)}`, {
    fields: {
      placeId: { stringValue: place.id },
      decidedAt: { timestampValue: new Date(Date.now() - daysAgo * 86_400_000).toISOString() },
    },
  });
}

console.log(`\n최근 방문 ${recent.length}건 (${recent.map((d) => `${d}일 전`).join(' · ')})`);
console.log('기본 필터(도보 10분)에서는 9곳이 남고 그 중 6곳이 최근 방문 → 보정이 2곳 발동합니다.');
console.log('오늘 문서는 비워 둡니다 — 돌리고 "여기로 결정" 을 눌러 보세요.\n');
