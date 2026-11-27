/**
 * 배포 주소 계약. vercel.json 이 없을 때 /foo 는 Vercel 기본 404(79바이트 NOT_FOUND)를 받아
 * 앱의 "이런 주소는 없어요" 화면이 한 번도 안 나왔다(10/15, 데모·팀 둘 다).
 * 그 뒤 모르는 경로를 index.html 로 돌려 앱이 NotFound 를 그리게 했지만, 응답이 200 이라 검색에 남을 수 있었다.
 * 앱이 받는 주소는 루트 하나뿐이라(isKnownPath) 11/27 부터는 아무 경로도 돌리지 않는다 —
 * 없는 주소는 Vercel 이 public/404.html(앱 404 와 같은 모양)을 404 상태로 준다.
 * 앱 안 NotFound 는 다른 곳에 올렸을 때를 위한 대비로 남긴다.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { isKnownPath } from '../../components/StatusScreen';

const config = JSON.parse(readFileSync(resolve(process.cwd(), 'vercel.json'), 'utf8')) as {
  rewrites: { source: string; destination: string }[];
};

// Vercel 의 source 는 경로 전체에 맞춘다. 여기 쓴 형태(괄호 하나 + 정규식)는 그대로 RegExp 로 옮겨진다.
const rewritten = (path: string) =>
  config.rewrites.find((r) => new RegExp(`^${r.source}$`).test(path))?.destination ?? null;

describe('vercel.json — 없는 주소는 진짜 404', () => {
  it('앱이 받는 주소는 루트뿐이고, 어떤 경로도 index.html 로 돌리지 않는다', () => {
    expect(isKnownPath('/')).toBe(true);
    expect(isKnownPath('/foo')).toBe(false);
    for (const path of ['/foo', '/a/b', '/api/photo', '/assets/index-abc.js']) {
      expect(rewritten(path), path).toBeNull();
    }
  });

  it('돌리지 않는 경로의 404 는 JS 없는 한 장이고, 검색에 남지 않으며 처음 화면으로 돌아간다', () => {
    const html = readFileSync(resolve(process.cwd(), 'public/404.html'), 'utf8');
    expect(html).toContain('<meta name="robots" content="noindex" />');
    expect(html).toContain('href="/"');
    expect(html).not.toMatch(/<script/i);
  });
});
