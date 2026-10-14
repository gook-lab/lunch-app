/**
 * 불러오기 실패 화면의 "다시 시도".
 *
 * 대부분은 데이터를 다시 읽으면 된다(익명 로그인도 실패했으면 그때 새로 시도한다).
 * 그런데 코드 조각(lazy chunk) 자체를 못 받은 경우는 브라우저가 실패한 import 를 기억해,
 * 같은 페이지에서 몇 번을 다시 불러도 같은 오류가 난다(팀 사이트에서 firebase 청크를
 * 막았다 풀고 다시 시도 → 8초 뒤에도 같은 화면, 10/15). 그때만 페이지를 새로 연다.
 */
export function isChunkLoadError(error: unknown): boolean {
  const message = String((error as Error)?.message ?? error ?? '');
  return /dynamically imported module|Importing a module script failed|error loading dynamically imported/i.test(message);
}

export function retryLoad(
  error: unknown,
  reload: () => void,
  hardReload: () => void = () => window.location.reload(),
): void {
  if (isChunkLoadError(error)) hardReload();
  else reload();
}
