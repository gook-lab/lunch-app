/**
 * 게임 화면에서 가게 이름을 짧게 보인다.
 *
 * "샘플 고기집 1" 같은 긴 이름은 코스 위나 좁은 사다리 열에서 겹친다.
 * 픽스처 접두("샘플 ")를 떼고 max 글자를 넘으면 줄임표로 자른다.
 * 결정 카드·목록에는 쓰지 않는다 — 거기선 전체 이름이 보여야 한다.
 */
export function shortName(name: string, max = 6): string {
  const trimmed = name.replace(/^샘플\s+/, '').trim();
  return trimmed.length > max ? `${trimmed.slice(0, max - 1)}…` : trimmed;
}
