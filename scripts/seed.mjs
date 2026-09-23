/**
 * 시드 투입 — seed/places.json 을 Firestore 에 넣는다.
 *
 *   node scripts/seed.mjs            # 무엇이 들어갈지 보여주기만 한다
 *   node scripts/seed.mjs --write    # 실제로 쓴다
 *
 * 규칙을 우회하지 않는다. 앱과 똑같이 익명 로그인으로 붙어서 쓰므로,
 * 이 스크립트가 통과하면 규칙이 실제로 동작한다는 뜻이기도 하다.
 *
 * walkMin 은 여기서 좌표로 계산해 넣는다 — 손으로 적으면 좌표와 어긋난다.
 * 스톱워치를 같이 눌러라. "12곳을 5분 이내" 가 설계의 첫 성공 기준이고,
 * 그 숫자는 지어내면 안 된다.
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously } from 'firebase/auth';
import { getFirestore, collection, doc, getDocs, setDoc, query, where } from 'firebase/firestore';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const write = process.argv.includes('--write');

/** .env.local 을 읽는다. dotenv 를 의존성에 추가하지 않으려고 직접 판다. */
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

/** 설정이나 입력이 잘못됐을 때 스택 대신 한 줄로 끝낸다. */
function die(message, hint) {
  console.error(`\n${message}`);
  if (hint) console.error(hint);
  process.exit(1);
}

const env = loadEnv();
const need = (key) => {
  const v = env[key];
  if (!v) die(`${key} 가 .env.local 에 없습니다.`, '.env.example 을 복사해서 채워 주세요.');
  return v;
};

const OFFICE = { lat: Number(need('VITE_OFFICE_LAT')), lng: Number(need('VITE_OFFICE_LNG')) };

const DETOUR_FACTOR = 1.3;
const METERS_PER_MINUTE = 67;
const EARTH_RADIUS_M = 6_371_000;
const toRad = (d) => (d * Math.PI) / 180;

function walkMinutes(lat, lng) {
  const dLat = toRad(lat - OFFICE.lat);
  const dLng = toRad(lng - OFFICE.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(OFFICE.lat)) * Math.cos(toRad(lat)) * Math.sin(dLng / 2) ** 2;
  const meters = 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
  return Math.max(1, Math.round((meters * DETOUR_FACTOR) / METERS_PER_MINUTE));
}

const places = JSON.parse(readFileSync(resolve(root, 'seed/places.json'), 'utf8'));

if (!Array.isArray(places) || places.length === 0) {
  console.error('seed/places.json 이 비어 있습니다. 관찰한 가게를 먼저 채워 주세요.');
  console.error('지어낸 가게를 넣으면 설계의 전제 2·3 이 검증되지 않습니다.');
  process.exit(1);
}

const prepared = places.map((p) => {
  for (const key of ['name', 'category', 'lat', 'lng', 'kakaoPlaceId']) {
    if (p[key] === undefined || p[key] === '') {
      die(`${p.name ?? '(이름 없음)'}: ${key} 가 비었습니다.`);
    }
  }
  const walkMin = walkMinutes(p.lat, p.lng);
  if (walkMin > 60) {
    die(`${p.name}: 도보 ${walkMin}분입니다 — 좌표나 사무실 좌표를 확인해 주세요.`);
  }
  return {
    name: String(p.name),
    category: String(p.category),
    lat: Number(p.lat),
    lng: Number(p.lng),
    walkMin,
    kakaoPlaceId: String(p.kakaoPlaceId),
    active: p.active !== false,
  };
});

console.log(`시드 ${prepared.length}곳 (사무실 기준 도보시간 계산 완료)\n`);
for (const p of prepared) {
  console.log(`  ${p.name.padEnd(14)} ${p.category.padEnd(5)} 도보 ${String(p.walkMin).padStart(2)}분`);
}

const dupes = prepared
  .map((p) => p.kakaoPlaceId)
  .filter((id, i, all) => all.indexOf(id) !== i);
if (dupes.length > 0) {
  console.error(`\n같은 kakaoPlaceId 가 파일 안에 중복입니다: ${[...new Set(dupes)].join(', ')}`);
  process.exit(1);
}

if (!write) {
  console.log('\n--write 를 붙이면 실제로 씁니다.');
  process.exit(0);
}

const app = initializeApp({
  apiKey: need('VITE_FIREBASE_API_KEY'),
  authDomain: need('VITE_FIREBASE_AUTH_DOMAIN'),
  projectId: need('VITE_FIREBASE_PROJECT_ID'),
  appId: need('VITE_FIREBASE_APP_ID'),
});

const db = getFirestore(app);
const user = await signInAnonymously(getAuth(app));
console.log(`\n익명 로그인 완료 (uid ${user.user.uid.slice(0, 8)}…)`);

let added = 0;
let skipped = 0;
for (const p of prepared) {
  const existing = await getDocs(
    query(collection(db, 'places'), where('kakaoPlaceId', '==', p.kakaoPlaceId)),
  );
  if (!existing.empty) {
    console.log(`  건너뜀 ${p.name} — 이미 있습니다`);
    skipped += 1;
    continue;
  }
  await setDoc(doc(collection(db, 'places')), { ...p, createdBy: user.user.uid });
  added += 1;
}

console.log(`\n추가 ${added}곳 · 건너뜀 ${skipped}곳`);
process.exit(0);
