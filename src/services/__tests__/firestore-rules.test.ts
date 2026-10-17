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
import { doc, setDoc, updateDoc, deleteDoc, deleteField, FieldPath, getDoc, getDocs, collection, collectionGroup, query, where, documentId, serverTimestamp } from 'firebase/firestore';
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

    it('R7d — 지우기는 removed 표시(참·거짓만). 문서 삭제는 여전히 거부', async () => {
      await assertSucceeds(updateDoc(doc(db(BOB), 'places/seed'), { removed: true, active: false }));
      await assertFails(updateDoc(doc(db(BOB), 'places/seed'), { removed: 'yes' }));
      await assertFails(deleteDoc(doc(db(BOB), 'places/seed')));
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

    it('어떤 게임으로 뽑았는지(mode)는 남길 수 있고, 문자열 16자까지', async () => {
      await assertSucceeds(setDoc(doc(db(ALICE), `visits/${TODAY}`), { ...decision, mode: 'pinball' }));
      await assertFails(setDoc(doc(db(ALICE), `visits/${TODAY}`), { ...decision, mode: 'x'.repeat(17) }));
      await assertFails(setDoc(doc(db(ALICE), `visits/${TODAY}`), { ...decision, mode: 3 }));
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

  describe('ratings — 사람마다 별점', () => {
    const ref = (uid: string, as = uid) => doc(db(as), 'places', 'p1', 'ratings', uid);

    it('S1 — 자기 uid 문서에 1~5 정수·한줄평·이름·서버 시각이면 허용', async () => {
      await assertSucceeds(setDoc(ref(ALICE), { score: 4, review: '국물이 진해요', name: '앨리스', at: serverTimestamp() }));
      await assertSucceeds(setDoc(ref(ALICE), { score: 5, at: serverTimestamp() }));
    });

    it('S2 — 남의 uid 문서·인증 없음은 거부', async () => {
      await assertFails(setDoc(ref(BOB, ALICE), { score: 4, at: serverTimestamp() }));
      await assertFails(setDoc(doc(anon(), 'places', 'p1', 'ratings', ALICE), { score: 4, at: serverTimestamp() }));
    });

    it('S3 — 점수 범위·정수·한줄평 길이·허용 외 필드·클라이언트 시각은 거부', async () => {
      await assertFails(setDoc(ref(ALICE), { score: 0, at: serverTimestamp() }));
      await assertFails(setDoc(ref(ALICE), { score: 6, at: serverTimestamp() }));
      await assertFails(setDoc(ref(ALICE), { score: 3.5, at: serverTimestamp() }));
      await assertFails(setDoc(ref(ALICE), { score: 3, review: 'ㄱ'.repeat(41), at: serverTimestamp() }));
      await assertFails(setDoc(ref(ALICE), { score: 3, extra: 1, at: serverTimestamp() }));
      await assertFails(setDoc(ref(ALICE), { score: 3, at: new Date() }));
    });

    it('S4 — 자기 표는 지울 수 있고 남의 표는 못 지운다, 모든 가게 별점을 한 번에 읽는다', async () => {
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), 'places', 'p1', 'ratings', BOB), { score: 3, at: new Date() });
      });
      await assertFails(deleteDoc(ref(BOB, ALICE)));
      await assertSucceeds(getDocs(collectionGroup(db(ALICE), 'ratings')));
      await assertFails(getDocs(collectionGroup(anon(), 'ratings')));
      await assertSucceeds(deleteDoc(ref(BOB)));
    });
  });

  describe('parties — 점심 팟', () => {
    const CAROL = 'carol-anon-uid';
    // 출발 시각. 23:59 는 KST 23:59 한 분 동안만 "지났다" 가 된다 — 그 1분엔 참여 테스트가 깨질 수 있다.
    const LATE = '23:59';
    const path = (host: string, day = TODAY) => `parties/${day}/list/${host}`;
    const party = (host: string, over: Record<string, unknown> = {}) => ({
      category: '면',
      time: LATE,
      max: 3,
      memo: '국물 땡기는 날',
      hostUid: host,
      status: 'open',
      members: { [host]: serverTimestamp() },
      createdAt: serverTimestamp(),
      ...over,
    });
    /** 규칙을 우회해 깔아 두는 팟. */
    const seedParty = async (over: Record<string, unknown> = {}) => {
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), path(ALICE)), {
          category: '면',
          time: LATE,
          max: 3,
          memo: '',
          hostUid: ALICE,
          status: 'open',
          members: { [ALICE]: new Date() },
          createdAt: new Date(),
          ...over,
        });
      });
    };
    const join = (uid: string) => updateDoc(doc(db(uid), path(ALICE)), new FieldPath('members', uid), serverTimestamp());
    const leave = (uid: string) => updateDoc(doc(db(uid), path(ALICE)), new FieldPath('members', uid), deleteField());
    const game = (over: Record<string, unknown> = {}) => ({
      mode: 'wheel',
      run: 12345,
      ids: ['p1', 'p2', 'p3'],
      names: ['골목국수', '진한 라멘', '우동 한 판'],
      winnerIndex: 1,
      at: serverTimestamp(),
      ...over,
    });

    it('T1 — 오늘, 자기 uid 문서로 혼자 시작하는 팟을 열 수 있다', async () => {
      await assertSucceeds(setDoc(doc(db(ALICE), path(ALICE)), party(ALICE)));
    });

    it('T2 — 남의 uid 문서·지난 날짜·인증 없음·방장 위장은 거부', async () => {
      await assertFails(setDoc(doc(db(ALICE), path(BOB)), party(BOB)));
      await assertFails(setDoc(doc(db(ALICE), path(BOB)), party(ALICE)));
      await assertFails(setDoc(doc(db(ALICE), path(ALICE, YESTERDAY)), party(ALICE)));
      await assertFails(setDoc(doc(db(ALICE), path(ALICE, TOMORROW)), party(ALICE)));
      await assertFails(setDoc(doc(anon(), path(ALICE)), party(ALICE)));
    });

    it('T3 — 메뉴·시각·인원·메모·필드를 엄격히 본다', async () => {
      const ref = doc(db(ALICE), path(ALICE));
      await assertFails(setDoc(ref, party(ALICE, { category: '한식' })));
      await assertFails(setDoc(ref, party(ALICE, { time: '24:00' })));
      await assertFails(setDoc(ref, party(ALICE, { time: '1150' })));
      await assertFails(setDoc(ref, party(ALICE, { time: '11:5' })));
      await assertFails(setDoc(ref, party(ALICE, { max: 1 })));
      await assertFails(setDoc(ref, party(ALICE, { max: 11 })));
      await assertFails(setDoc(ref, party(ALICE, { max: 3.5 })));
      await assertFails(setDoc(ref, party(ALICE, { memo: 'ㄱ'.repeat(41) })));
      await assertFails(setDoc(ref, party(ALICE, { status: 'closed' })));
      await assertFails(setDoc(ref, party(ALICE, { name: '앨리스' })));
      await assertFails(setDoc(ref, party(ALICE, { email: 'a@example.com' })));
      await assertFails(setDoc(ref, party(ALICE, { createdAt: new Date() })));
      // 처음부터 남을 넣어 두거나, 참여 시각을 지어내면 거부.
      await assertFails(setDoc(ref, party(ALICE, { members: { [ALICE]: serverTimestamp(), [BOB]: serverTimestamp() } })));
      await assertFails(setDoc(ref, party(ALICE, { members: { [ALICE]: new Date() } })));
      await assertFails(setDoc(ref, party(ALICE, { game: game() })));
      await assertSucceeds(setDoc(ref, party(ALICE, { memo: 'ㄱ'.repeat(40), max: 10, category: '빵·양식' })));
    });

    it('T4 — 하루 한 팟: 이미 연 팟을 새 팟으로 덮어쓸 수 없다', async () => {
      await seedParty();
      await assertFails(setDoc(doc(db(ALICE), path(ALICE)), party(ALICE)));
    });

    it('T5 — 자기 자신만 참여·나가기, 읽기는 로그인 필요', async () => {
      await seedParty();
      await assertSucceeds(join(BOB));
      await assertSucceeds(getDoc(doc(db(CAROL), path(ALICE))));
      await assertFails(getDoc(doc(anon(), path(ALICE))));
      // 남을 넣거나 빼기
      await assertFails(updateDoc(doc(db(CAROL), path(ALICE)), new FieldPath('members', 'dave'), serverTimestamp()));
      await assertFails(updateDoc(doc(db(CAROL), path(ALICE)), new FieldPath('members', BOB), deleteField()));
      // 참여 시각을 지어내기
      await assertFails(updateDoc(doc(db(CAROL), path(ALICE)), new FieldPath('members', CAROL), new Date()));
      // 참여하면서 다른 필드 고치기
      await assertFails(
        updateDoc(doc(db(CAROL), path(ALICE)), new FieldPath('members', CAROL), serverTimestamp(), 'max', 10),
      );
      await assertSucceeds(leave(BOB));
    });

    it('T6 — 인원이 차면 더 못 들어온다', async () => {
      await seedParty({ max: 2 });
      await assertSucceeds(join(BOB));
      await assertFails(join(CAROL));
    });

    it('T7 — 마감했거나 출발 시각이 지난 팟에는 못 들어온다(나가기는 된다)', async () => {
      await seedParty({ status: 'closed', members: { [ALICE]: new Date(), [BOB]: new Date() } });
      await assertFails(join(CAROL));
      await assertSucceeds(leave(BOB));
      await seedParty({ time: '00:00' });
      await assertFails(join(CAROL));
    });

    it('T8 — 방장만 마감·다시 모으기, 방장은 나가지 못한다', async () => {
      await seedParty();
      await assertFails(updateDoc(doc(db(BOB), path(ALICE)), { status: 'closed' }));
      await assertSucceeds(updateDoc(doc(db(ALICE), path(ALICE)), { status: 'closed' }));
      await assertSucceeds(updateDoc(doc(db(ALICE), path(ALICE)), { status: 'open' }));
      await assertFails(updateDoc(doc(db(ALICE), path(ALICE)), { status: 'gone' }));
      await assertFails(updateDoc(doc(db(ALICE), path(ALICE)), { max: 10 }));
      await assertFails(leave(ALICE));
    });

    it('T9 — 게임 결과는 방장만, 한 번만, 모양을 지켜야 남는다', async () => {
      await seedParty({ members: { [ALICE]: new Date(), [BOB]: new Date() } });
      const ref = (uid: string) => doc(db(uid), path(ALICE));
      await assertFails(updateDoc(ref(BOB), { game: game() }));
      await assertFails(updateDoc(ref(ALICE), { game: game({ winnerIndex: 3 }) }));
      await assertFails(updateDoc(ref(ALICE), { game: game({ ids: ['p1'], names: ['골목국수'], winnerIndex: 0 }) }));
      await assertFails(updateDoc(ref(ALICE), { game: game({ names: ['골목국수'] }) }));
      await assertFails(updateDoc(ref(ALICE), { game: game({ at: new Date() }) }));
      await assertFails(updateDoc(ref(ALICE), { game: game({ cheat: true }) }));
      await assertFails(updateDoc(ref(ALICE), { game: game(), status: 'closed' }));
      await assertSucceeds(updateDoc(ref(ALICE), { game: game() }));
      // 다시 뽑기 금지
      await assertFails(updateDoc(ref(ALICE), { game: game({ winnerIndex: 0 }) }));
    });

    it('T10 — 취소(삭제)는 방장만, 지난 날 팟은 아무도 못 고친다', async () => {
      await seedParty();
      await assertFails(deleteDoc(doc(db(BOB), path(ALICE))));
      await assertSucceeds(deleteDoc(doc(db(ALICE), path(ALICE))));
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), path(ALICE, YESTERDAY)), {
          category: '면', time: LATE, max: 3, memo: '', hostUid: ALICE, status: 'open',
          members: { [ALICE]: new Date() }, createdAt: new Date(),
        });
      });
      await assertFails(updateDoc(doc(db(BOB), path(ALICE, YESTERDAY)), new FieldPath('members', BOB), serverTimestamp()));
      await assertFails(updateDoc(doc(db(ALICE), path(ALICE, YESTERDAY)), { status: 'closed' }));
      await assertFails(deleteDoc(doc(db(ALICE), path(ALICE, YESTERDAY))));
    });

    describe('팟 예측 — 멤버가 자기 칸만, 게임 전까지', () => {
      const guess = (uid: string, placeId: unknown) =>
        updateDoc(doc(db(uid), path(ALICE)), new FieldPath('guesses', uid), placeId);

      it('P1 — 방장·멤버는 자기 예측을 넣고 바꾸고 지운다', async () => {
        await seedParty({ members: { [ALICE]: new Date(), [BOB]: new Date() } });
        await assertSucceeds(guess(ALICE, 'p1'));
        await assertSucceeds(guess(BOB, 'p2'));
        await assertSucceeds(guess(BOB, 'p3'));
        await assertSucceeds(guess(BOB, deleteField()));
      });

      it('P2 — 멤버가 아니면·남의 칸이면·이상한 값이면 거부', async () => {
        await seedParty({ members: { [ALICE]: new Date(), [BOB]: new Date() }, guesses: { [ALICE]: 'p1' } });
        await assertFails(guess(CAROL, 'p1'));
        await assertFails(updateDoc(doc(db(BOB), path(ALICE)), new FieldPath('guesses', ALICE), 'p2'));
        await assertFails(updateDoc(doc(db(BOB), path(ALICE)), new FieldPath('guesses', ALICE), deleteField()));
        await assertFails(guess(BOB, ''));
        await assertFails(guess(BOB, 7));
        await assertFails(guess(BOB, 'x'.repeat(65)));
        // 예측과 다른 칸을 같이 고치는 것도 안 된다.
        await assertFails(updateDoc(doc(db(BOB), path(ALICE)), { [`guesses.${BOB}`]: 'p1', status: 'closed' }));
      });

      it('P3 — 게임을 돌린 뒤엔 아무도 못 바꾼다', async () => {
        await seedParty({
          members: { [ALICE]: new Date(), [BOB]: new Date() },
          game: { mode: 'wheel', run: 1, ids: ['p1', 'p2'], names: ['가', '나'], winnerIndex: 0, at: new Date() },
        });
        await assertFails(guess(BOB, 'p1'));
        await assertFails(guess(ALICE, 'p1'));
      });
    });
  });

  describe('그 외 컬렉션', () => {
    it('정의하지 않은 경로는 전부 막힌다', async () => {
      await assertFails(setDoc(doc(db(ALICE), 'anything/x'), { a: 1 }));
      await assertFails(getDoc(doc(db(ALICE), 'meta/stats')));
    });
  });
});
