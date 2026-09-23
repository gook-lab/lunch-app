# lunch-app — 사내 점심 결정 도구

돌림판으로 점심을 정하고, 최근 2주에 간 곳을 빼 주는 사내용 웹앱. 로그인 없이 링크 하나로 쓴다.

설계와 구조 결정은 `~/.gstack/projects/toy/kyb-ontact-unknown-design-20260916-141116.md` 에 있다. 이 README 는 돌리는 법만 적는다.

## 스택 — 선택과 이유

| 선택 | 이유 |
|---|---|
| Vite + React + TS | 정적 SPA 하나로 끝난다. 서버가 없다 |
| Firebase Firestore | 공유 저장소가 필요한데 서버를 세울 이유가 없다 |
| Firebase 익명 로그인 | 화면에 로그인이 없으면서 규칙이 `request.auth` 를 쓸 수 있다 |
| MODUL `@gook-lab/ui` | 버튼·시트·태그를 새로 만들지 않는다. 새로 만든 UI 는 돌림판 하나뿐 |
| 카카오맵 JS SDK | 좌표·키워드 검색. REST 키는 쓰지 않는다 |

## 처음 돌릴 때

```bash
pnpm install          # npm 은 안 된다 — MODUL peer 의 workspace:* 를 pnpm 만 푼다
cp .env.example .env.local
# .env.local 을 채운다 (아래)
pnpm dev
```

### 환경변수

| 키 | 어디서 | 없으면 |
|---|---|---|
| `VITE_KAKAO_JS_KEY` | 카카오 개발자 콘솔 > 앱 > 플랫폼 키 > JavaScript | 지도 탭이 안 뜬다 |
| `VITE_FIREBASE_*` | Firebase 콘솔 > 프로젝트 설정 > 웹 앱 | 앱이 아예 안 뜬다 |
| `VITE_OFFICE_LAT` / `VITE_OFFICE_LNG` | 사무실 실제 좌표 | 도보시간 계산이 던진다 |

사무실 좌표는 코드에 지어내 박지 않았다. 실제 값을 넣어야 한다.

### 카카오 도메인 등록

플랫폼 웹 도메인에 **프로덕션 도메인 1개 + `http://localhost:5173`** 만 등록한다.
와일드카드 서브도메인은 비즈 앱에서만 되고 도메인은 최대 9개라, Vercel PR 프리뷰 URL은 사전 등록이 불가능하다. 그래서 **PR 프리뷰 배포를 쓰지 않는다.**

## 명령

| 명령 | 하는 일 |
|---|---|
| `pnpm dev` | 개발 서버 |
| `pnpm test` | 단위 테스트 (Firebase 없이 돈다) |
| `pnpm test:rules` | Firestore 규칙 테스트 (에뮬레이터를 직접 띄운다) |
| `pnpm build` | 프로덕션 빌드 |
| `pnpm seed` | `seed/places.json` 으로 무엇이 들어갈지 보여준다 |
| `pnpm seed:write` | 실제로 넣는다 |

## 구조에서 알아둘 것

### 날짜는 KST 고정이고, 구현이 둘이다

`visits` 문서 id 가 `YYYYMMDD` 다. 기기 시계를 따라가면 노트북을 UTC 로 둔 사람이 오전 9시에 "어제" 문서를 열고, 같은 날 문서가 두 개 생긴다.

클라이언트는 `src/lib/date.ts` 의 `todayKST()`, 규칙은 `firestore.rules` 의 `isTodayKST()` 다. **규칙은 이 JS 를 쓸 수 없다** — 규칙 언어에 타임존 변환도 zero-pad 포맷도 없고 `request.time.year()` 는 항상 UTC다. 구현은 둘, 계약은 하나이고, 그 계약을 지키는 것은 `pnpm test:rules` 다.

### 후보를 정하는 것은 화면이 아니다

`src/lib/candidates.ts` 의 `selectCandidates()` 가 순수 함수로 정한다. 돌림판은 넘겨받은 당첨 index 로 회전만 한다. 반환은 **단계별 카운트**다 — `afterCategoryCount` 가 "N곳 중", `recentlyVisitedCount` 가 "M곳은 최근에 갔습니다". 이 둘을 헷갈리면 화면 숫자가 실제와 어긋나는데, 그 문구가 이 앱의 유일한 공정성 장치다.

### 구독은 로그인 뒤에 건다

`onSnapshot` 의 `permission-denied` 는 재시도 없이 리스너를 영구 종료시킨다. 익명 로그인이 붙기 전에 구독하면 **신규 기기에서만** 조용히 실패하고, 캐시된 uid 가 있는 기존 기기에서는 재현되지 않는다. `src/services/lunch.ts` 의 `subscribeToday()` 가 `authReady` 를 기다리는 이유다.

탭을 켜둔 채 자정을 넘기는 경우도 같은 급의 문제라, `useTodayKST()` 가 `visibilitychange`·`focus`·1분 타이머로 날짜를 다시 잰다.

### 규칙이 못 하는 것

**문서 수 상한은 구현하지 않았다.** Firestore 규칙에는 집계·카운트가 없다. 막았다고 적어두면 아무도 다시 보지 않으므로, 못 한다고 적어 둔다. 8명 사내 링크에서는 목록이 이상하게 불어나면 사람이 바로 보고, 삭제 금지가 복구를 보장한다.

`auth != null` 은 "링크를 아는 누구나" 와 동치다. 접근 통제가 아니라 기기당 신원을 만들어 필드 검사를 가능하게 하는 장치다.

### 가게는 지우지 않고 고친다

`visits` 가 `placeId` 를 참조하므로 삭제는 막혀 있다. 대신 `name`·`lat`·`lng`·`walkMin`·`category` 수정을 연다. 잠가 두면 좌표를 잘못 고른 가게가 `walkMin` 탓에 영원히 후보에서 빠지고, 고칠 길이 없어 풀 크기가 오염된다.

좌표를 고치면 `walkMin` 을 같이 재계산해서 쓴다. 따로 두면 둘이 어긋난다.

## 도보시간은 추정이다

직선거리 × 1.3 ÷ 67m/분. 교체 트리거는 **시드 12곳 중 2곳 이상에서 실제 도보시간과 2분 넘게 차이** 이고, 판단은 직접 걸어보고 한다. 그때 카카오 길찾기로 바꾼다.

## 판정

가동 2주차 끝에 누적 `visits` 가 8건 이상이면 계속, 3~7건이면 보류(3주차 단독 3건으로 재판정), 2건 이하면 중단한다. 풀은 2주 안에 20곳을 넘겨야 최근 방문 제외가 자동 완화 없이 돌아간다.
