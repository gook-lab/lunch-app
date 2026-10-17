#!/bin/zsh
# 사용: scripts/deploy.sh demo|team
#
# HEAD 를 깨끗한 사본으로 빌드해 Vercel 프로덕션에 정적 배포한다(작업 트리의 미커밋 변경은 안 들어간다).
# - demo: 예시 데이터(VITE_DEMO=1), 회사 좌표는 서울시청 예시값. 사용 기록 없음.
# - team: .env.local 의 Firebase·카카오 값으로 빌드, 사용 기록(VITE_ANALYTICS=1) 켬.
#   VITE_ANALYTICS 를 빼면 팀 사이트 기록이 조용히 끊긴다 — 그래서 스크립트로 남긴다(10/17).
# 카카오 REST 키는 여기 없다. /api/photo 는 Vercel 프로젝트 환경변수 KAKAO_REST_KEY 를 쓴다.
set -e
KIND=$1
APP=${0:A:h:h}
ORG=team_iOUq0ln5nr1ouh47URJAK3vO
case $KIND in
  demo) PROJECT=prj_mPAKguXN2jZBGG24dOjL2XJlI8Ns; SITE=https://lunch-app-fawn.vercel.app ;;
  team) PROJECT=prj_4D5tPaGvvdUXMjVEyoJyOOTZiSo9; SITE=https://lunch-app-team.vercel.app ;;
  *) echo "사용: $0 demo|team" >&2; exit 1 ;;
esac

D=$(mktemp -d)
trap 'rm -rf "$D"' EXIT
(cd "$APP" && git archive HEAD | tar -x -C "$D")
ln -s "$APP/node_modules" "$D/node_modules"
K=$(grep '^VITE_KAKAO_JS_KEY' "$APP/.env.local" | tail -1 | cut -d= -f2)
cd "$D"
if [ "$KIND" = demo ]; then
  VITE_SITE_URL=$SITE VITE_DEMO=1 VITE_OFFICE_LAT=37.5663 VITE_OFFICE_LNG=126.9779 VITE_KAKAO_JS_KEY=$K npx vite build >/dev/null
else
  grep -E '^VITE_(FIREBASE_(API_KEY|AUTH_DOMAIN|PROJECT_ID|STORAGE_BUCKET|MESSAGING_SENDER_ID|APP_ID)|KAKAO_JS_KEY|OFFICE_LAT|OFFICE_LNG)=' "$APP/.env.local" > .env.production.local
  VITE_ANALYTICS=1 VITE_SITE_URL=$SITE npx vite build >/dev/null
fi
# 가게 사진 서버 함수(/api/photo).
cp -r api dist/api
# 레포 vercel.json(404 화면용 rewrites)에 정적 배포 설정을 얹는다.
python3 -c 'import json,os;c=json.load(open("vercel.json")) if os.path.exists("vercel.json") else {};c.update(framework=None,buildCommand="",installCommand="",outputDirectory=".");json.dump(c,open("dist/vercel.json","w"))'
cd dist
VERCEL_ORG_ID=$ORG VERCEL_PROJECT_ID=$PROJECT npx vercel deploy --prod --yes 2>&1 | grep -oE "Production: \S+|Production URL: \S+|Error.*" | head -3
