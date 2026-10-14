/** 주소창이 숫자 IP 인가 — 사내망으로 띄운 개발 서버. 팀 주소 안내(DevHostNote)를 띄우는 기준이다. */
export function isDevHost(hostname: string) {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname);
}
