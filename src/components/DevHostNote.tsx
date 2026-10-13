/**
 * 사내망 IP 로 띄운 개발 서버 안내 — 주소창이 숫자 IP 일 때만 뜬다.
 * 개발 서버는 에뮬레이터 데이터를 쓰므로, 여기서 정한 점심은 팀 기록에 남지 않는다.
 * 예전에 IP 주소를 받아 둔 동료가 계속 여기서 쓰지 않게 팀 주소로 안내한다.
 */
const TEAM_URL = 'https://lunch-app-team.vercel.app';

export function isDevHost(hostname: string) {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname);
}

export function DevHostNote() {
  return (
    <p className="demo-note">
      <span aria-hidden="true">🛠️ </span>
      여기는 개발용 주소라 기록이 팀과 공유되지 않아요.{' '}
      <a className="linkish" href={TEAM_URL}>
        팀 주소로 가기
      </a>
    </p>
  );
}
