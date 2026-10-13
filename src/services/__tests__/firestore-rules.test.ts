/**
 * Firestore 보안규칙 에뮬레이터 테스트.
 *
 * 실행: pnpm test:rules
 * (firebase emulators:exec 가 FIRESTORE_EMULATOR_HOST 를 설정해 준다 —
 *  에뮬레이터 없이 vitest 전체를 돌리면 자동 스킵한다.)
 *
 * 이 파일이 지키는 것은 규칙 자체가 아니라 **계약**이다. 규칙의 isTodayKST() 와
 * src/lib/date.ts 의 todayKST() 는 서로 다른 코드이고, 둘이 어긋나면 한국 시간
 * 자정 전후에만 쓰기가 거부되는 버그가 난다.
 *
 * 기대 문서 id 를 toISOString() 으로 만들면 00:00~09:00 KST 구간에만 깨지는
 * 9시간짜리 flaky 테스트가 된다. 기대값도 반드시 todayKST() 로 만든다.
 */
import { describe, it, beforeAll, afterAll, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, setDoc, updateDoc, deleteDoc, getDoc, getDocs, collection, query, where, documentId, serverTimestamp } from 'firebase/firestore';
import { todayKST, dayIdBefore } from '../../lib/date';

const hasEmulator = !!process.env.FIRESTORE_EMULATOR_HOST;
const d = hasEmulator ? describe : describe.skip;

const ALICE = 'alice-anon-uid';
const BOB = 'bob-anon-uid';

let testEnv: RulesTestEnvironment;

const db = (uid: string) => testEnv.authenticatedContext(uid).firestore();
const anon = () => testEnv.unauthenticatedContext().firestore();

const TODAY = todayKST();
const YESTERDAY = dayIdBefore(TODAY, 1);
const TOMORROW = dayIdBefore(TODAY, -1);

const validPlace = (over: Record<string, unknown> = {}) => ({
  name: '오목집',
  category: '한식',
  lat: 37.5665,
  lng: 126.978,
  walkMin: 6,
  kakaoPlaceId: 'kakao-1',
  active: true,
  createdBy: ALICE,
  ...over,
});

d('firestore.rules', () => {
  beforeAll(async () => {
    testEnv = await initializeTestEnvironment({
      projectId: 'lunch-rules-test',
      firestore: { rules: readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../../../firestore.rules'), 'utf8') },
    });
  });

  afterAll(async () => {
    await testEnv?.cleanup();
  });

  beforeEach(async () => {
    await testEnv.clearFirestore();
    // 수정·조회 테스트가 쓸 씨앗을 규칙을 우회해 넣는다.
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'places/seed'), validPlace());
      await setDoc(doc(ctx.firestore(), `visits/${YESTERDAY}`), {
        placeId: 'seed',
        decidedAt: new Date(),
      });
    });
  });

  describe('places', () => {
    it('R1 — 인증 없이 생성은 거부', async () => {
      await assertFails(setDoc(doc(anon(), 'places/p1'), validPlace()));
    });

    it('R2 — 익명 uid 로 허용 필드만 생성은 허용', async () => {
      await assertSucceeds(setDoc(doc(db(ALICE), 'places/p1'), validPlace()));
    });

    it('R2b — createdBy 가 자기 uid 가 아니면 거부', async () => {
      await assertFails(setDoc(doc(db(ALICE), 'places/p1'), validPlace({ createdBy: BOB })));
    });

    it('R3 — 허용 외 필드가 섞이면 거부', async () => {
      await assertFails(
        setDoc(doc(db(ALICE), 'places/p1'), validPlace({ ownerNote: '사장님이 친절함' })),
      );
      await assertFails(
        setDoc(doc(db(ALICE), 'places/p1'), validPlace({ visitCount: 3 })),
      );
    });

    /*
     * 선택 필드(price·rating·review·memo)는 지도에서 꽂은 핀만 채운다.
     * 규칙은 "없으면 통과, 있으면 검사" 여야 한다 — 기존 문서에는 없고,
     * 있는데 아무 값이나 들어오면 화면이 깨진다.
     */
    it('R3b — 선택 필드는 없어도 통과한다', async () => {
      await assertSucceeds(setDoc(doc(db(ALICE), 'places/p1'), validPlace()));
    });

    it('R3c — 선택 필드가 제대로 들어오면 허용', async () => {
      await assertSucceeds(
        setDoc(
          doc(db(ALICE), 'places/p1'),
          validPlace({ price: '1~1.5만', rating: 4, review: '면이 쫄깃함', memo: '12시 전에' }),
        ),
      );
    });

    it('R3d — 가격대는 정해진 세 칸 밖이면 거부', async () => {
      await assertFails(setDoc(doc(db(ALICE), 'places/p1'), validPlace({ price: '2만~' })));
      await assertFails(setDoc(doc(db(ALICE), 'places/p1'), validPlace({ price: 12000 })));
    });

    it('R3e — 별점은 1~5 정수만', async () => {
      await assertFails(setDoc(doc(db(ALICE), 'places/p1'), validPlace({ rating: 0 })));
      await assertFails(setDoc(doc(db(ALICE), 'places/p1'), validPlace({ rating: 6 })));
      await assertFails(setDoc(doc(db(ALICE), 'places/p1'), validPlace({ rating: 3.5 })));
      await assertFails(setDoc(doc(db(ALICE), 'places/p1'), validPlace({ rating: '4' })));
    });

    it('R3f — 한줄평 40자·메모 120자를 넘으면 거부', async () => {
      await assertFails(setDoc(doc(db(ALICE), 'places/p1'), validPlace({ review: 'ㄱ'.repeat(41) })));
      await assertFails(setDoc(doc(db(ALICE), 'places/p1'), validPlace({ memo: 'ㄱ'.repeat(121) })));
      await assertSucceeds(
        setDoc(doc(db(ALICE), 'places/p1'), validPlace({ review: 'ㄱ'.repeat(40) })),
      );
    });

    it('R3g — 선택 필드를 나중에 고칠 수 있다', async () => {
      await assertSucceeds(
        updateDoc(doc(db(BOB), 'places/seed'), { rating: 5, memo: '회식 때 좋음' }),
      );
      await assertFails(updateDoc(doc(db(BOB), 'places/seed'), { rating: 9 }));
    });

    it('R3b — 필드가 빠지면 거부', async () => {
      const { walkMin: _omit, ...missing } = validPlace();
      await assertFails(setDoc(doc(db(ALICE), 'places/p1'), missing));
    });

    it('R4 — name 이 길이 상한을 넘으면 거부', async () => {
      await assertFails(setDoc(doc(db(ALICE), 'places/p1'), validPlace({ name: '가'.repeat(41) })));
      await assertFails(setDoc(doc(db(ALICE), 'places/p1'), validPlace({ name: '' })));
    });

    it('R4b — 좌표가 한국 밖이면 거부', async () => {
      await assertFails(setDoc(doc(db(ALICE), 'places/p1'), validPlace({ lat: 48.85, lng: 2.35 })));
    });

    it('R5 — 삭제는 누구도 못 한다', async () => {
      await assertFails(deleteDoc(doc(db(ALICE), 'places/seed')));
    });

    it('R6 — active 토글은 허용', async () => {
      await assertSucceeds(updateDoc(doc(db(BOB), 'places/seed'), { active: false }));
    });

    it('R7 — name·lat·lng·walkMin·category 수정은 허용 (D8)', async () => {
      await assertSucceeds(
        updateDoc(doc(db(BOB), 'places/seed'), {
          name: '오목집 본점',
          lat: 37.5651,
          lng: 126.9769,
          walkMin: 8,
          category: '면',
        }),
      );
    });

    it('R7b — walkMin 이 범위를 벗어나면 거부', async () => {
      await assertFails(updateDoc(doc(db(BOB), 'places/seed'), { walkMin: 0 }));
      await assertFails(updateDoc(doc(db(BOB), 'places/seed'), { walkMin: 61 }));
    });

    it('R7c — kakaoPlaceId·createdBy 는 수정 불가', async () => {
      await assertFails(updateDoc(doc(db(BOB), 'places/seed'), { kakaoPlaceId: 'kakao-2' }));
      await assertFails(updateDoc(doc(db(BOB), 'places/seed'), { createdBy: BOB }));
    });

    it('읽기는 로그인 필요', async () => {
      await assertSucceeds(getDoc(doc(db(ALICE), 'places/seed')));
      await assertFails(getDoc(doc(anon(), 'places/seed')));
    });
  });

  describe('settings/office — 회사 위치', () => {
    const office = { lat: 37.5, lng: 127.0, updatedAt: serverTimestamp() };

    it('O1 — 로그인한 누구나 회사 위치를 정하고 바꿀 수 있다', async () => {
      await assertSucceeds(setDoc(doc(db(ALICE), 'settings/office'), office));
      await assertSucceeds(setDoc(doc(db(BOB), 'settings/office'), { ...office, lat: 37.51 }));
    });

    it('O2 — 인증 없이는 읽기·쓰기 모두 거부', async () => {
      await assertFails(setDoc(doc(anon(), 'settings/office'), office));
      await assertFails(getDoc(doc(anon(), 'settings/office')));
      await assertSucceeds(getDoc(doc(db(ALICE), 'settings/office')));
    });

    it('O3 — 한국 밖 좌표·허용 외 필드·서버 시각 아닌 updatedAt 은 거부', async () => {
      await assertFails(setDoc(doc(db(ALICE), 'settings/office'), { ...office, lat: 10 }));
      await assertFails(setDoc(doc(db(ALICE), 'settings/office'), { ...office, label: '본사' }));
      await assertFails(setDoc(doc(db(ALICE), 'settings/office'), { ...office, updatedAt: new Date('2020-01-01') }));
    });

    it('O4 — 삭제와 settings 의 다른 문서는 거부', async () => {
      await assertSucceeds(setDoc(doc(db(ALICE), 'settings/office'), office));
      await assertFails(deleteDoc(doc(db(ALICE), 'settings/office')));
      await assertFails(setDoc(doc(db(ALICE), 'settings/other'), office));
    });
  });

  describe('visits', () => {
    const decision = { placeId: 'seed', decidedAt: serverTimestamp() };

    it('R8 — 오늘 문서 생성은 허용', async () => {
      await assertSucceeds(setDoc(doc(db(ALICE), `visits/${TODAY}`), decision));
    });

    it('R9 — 오늘 문서 덮어쓰기(재결정)는 허용', async () => {
      await assertSucceeds(setDoc(doc(db(ALICE), `visits/${TODAY}`), decision));
      await assertSucceeds(
        setDoc(doc(db(BOB), `visits/${TODAY}`), { placeId: 'other', decidedAt: serverTimestamp() }),
      );
    });

    it('R9b — decidedAt 이 서버 시각이 아니면 거부', async () => {
      await assertFails(
        setDoc(doc(db(ALICE), `visits/${TODAY}`), {
          placeId: 'seed',
          decidedAt: new Date('2020-01-01'),
        }),
      );
    });

    it('R10 — 어제 문서 수정은 거부', async () => {
      await assertFails(setDoc(doc(db(ALICE), `visits/${YESTERDAY}`), decision));
      await assertFails(updateDoc(doc(db(ALICE), `visits/${YESTERDAY}`), { placeId: 'x' }));
    });

    it('R11 — 내일 문서 생성은 거부 (기기 시계가 빠른 경우)', async () => {
      await assertFails(setDoc(doc(db(ALICE), `visits/${TOMORROW}`), decision));
    });

    it('R11b — 형식이 아닌 문서 id 는 거부', async () => {
      await assertFails(setDoc(doc(db(ALICE), 'visits/today'), decision));
      await assertFails(setDoc(doc(db(ALICE), 'visits/2026916'), decision));
    });

    it('R12 — 삭제는 거부', async () => {
      await assertFails(deleteDoc(doc(db(ALICE), `visits/${YESTERDAY}`)));
    });

    it('R7c — 최근 14일 범위 쿼리(list)는 허용', async () => {
      const q = query(
        collection(db(ALICE), 'visits'),
        where(documentId(), '>=', dayIdBefore(TODAY, 14)),
        where(documentId(), '<=', TODAY),
      );
      await assertSucceeds(getDocs(q));
      await assertFails(getDocs(query(collection(anon(), 'visits'))));
    });

    it('허용 외 필드는 거부', async () => {
      await assertFails(
        setDoc(doc(db(ALICE), `visits/${TODAY}`), { ...decision, decidedBy: '윤성국' }),
      );
    });
  });

  describe('predictions — 동료 예측', () => {
    const vote = (over: Record<string, unknown> = {}) => ({
      placeId: 'seed',
      name: '민수',
      at: serverTimestamp(),
      ...over,
    });

    it('P1 — 오늘, 자기 uid 문서에 허용 필드만 쓰면 허용', async () => {
      await assertSucceeds(setDoc(doc(db(ALICE), `predictions/${TODAY}/votes/${ALICE}`), vote()));
    });

    it('P2 — 남의 uid 문서·지난 날짜·인증 없음은 거부', async () => {
      await assertFails(setDoc(doc(db(ALICE), `predictions/${TODAY}/votes/${BOB}`), vote()));
      await assertFails(setDoc(doc(db(ALICE), `predictions/${YESTERDAY}/votes/${ALICE}`), vote()));
      await assertFails(setDoc(doc(anon(), `predictions/${TODAY}/votes/${ALICE}`), vote()));
    });

    it('P3 — 이름이 비거나 12자 넘거나 필드가 섞이면 거부', async () => {
      const ref = doc(db(ALICE), `predictions/${TODAY}/votes/${ALICE}`);
      await assertFails(setDoc(ref, vote({ name: '' })));
      await assertFails(setDoc(ref, vote({ name: '열두글자를넘는아주긴이름이에요' })));
      await assertFails(setDoc(ref, vote({ weight: 3 })));
    });

    it('P4 — 자기 표는 지울 수 있고 남의 표는 못 지운다', async () => {
      await assertSucceeds(setDoc(doc(db(ALICE), `predictions/${TODAY}/votes/${ALICE}`), vote()));
      await assertFails(deleteDoc(doc(db(BOB), `predictions/${TODAY}/votes/${ALICE}`)));
      await assertSucceeds(deleteDoc(doc(db(ALICE), `predictions/${TODAY}/votes/${ALICE}`)));
    });
  });

  describe('그 외 컬렉션', () => {
    it('정의하지 않은 경로는 전부 막힌다', async () => {
      await assertFails(setDoc(doc(db(ALICE), 'anything/x'), { a: 1 }));
      await assertFails(getDoc(doc(db(ALICE), 'meta/stats')));
    });
  });
});
