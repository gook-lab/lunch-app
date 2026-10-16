// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { readLadderGeometry } from './ladderGeometry';

function element(width: number, height: number, top = 0): HTMLElement {
  const node = document.createElement('div');
  Object.defineProperties(node, {
    offsetWidth: { value: width },
    offsetHeight: { value: height },
    offsetTop: { value: top },
  });
  return node;
}

describe('사다리 카메라 치수', () => {
  it('애니메이션에서 재사용할 치수를 한 번에 읽는다', () => {
    expect(readLadderGeometry(element(320, 280), element(300, 240, 20))).toEqual({
      cameraWidth: 320,
      cameraHeight: 280,
      boardWidth: 300,
      boardHeight: 240,
      boardTop: 20,
    });
  });

  it('아직 보이지 않는 카메라는 측정하지 않는다', () => {
    expect(readLadderGeometry(element(320, 0), element(300, 240))).toBeNull();
  });
});
