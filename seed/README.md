# 시드 입력 — 지어내지 않는다

`places.json` 은 **내일 점심 스레드를 관찰한 결과**로 채운다 (설계의 Assignment).
지어낸 가게를 넣으면 전제 2(차별점은 도보권 목록)와 전제 3(시드 5분)이 검증되지 않는다.

한 항목의 모양:

```json
{
  "name": "오목집",
  "category": "한식",
  "lat": 37.5665,
  "lng": 126.9780,
  "kakaoPlaceId": "26338954"
}
```

- `lat` · `lng` · `kakaoPlaceId` 는 카카오맵에서 그 가게를 찾아 그대로 옮긴다.
- `walkMin` 은 적지 않는다. 스크립트가 사무실 좌표 기준으로 계산해서 넣는다.
- `active` 는 생략하면 `true`.

넣는 법:

```bash
node scripts/seed.mjs          # 계산 결과만 확인
node scripts/seed.mjs --write  # 실제로 쓴다
```

스톱워치를 같이 누른다. "12곳을 5분 이내" 가 첫 성공 기준이고, 그 숫자는 실측이어야 한다.
