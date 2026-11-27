/**
 * 배포 주소 계약. vercel.json 이 없을 때 /foo 는 Vercel 기본 404(79바이트 NOT_FOUND)를 받아
 * 앱의 "이런 주소는 없어요" 화면이 한 번도 안 나왔다(10/15, 데모·팀 둘 다).
 * 모르는 경로는 index.html 로 돌려 SPA 가 NotFound 를 그리게 하고,
 * 서버 함수(/api)와 빌드 산출물(/assets)은 돌리지 않는다 — 빠진 청크에 HTML 이 200 으로 오면 원인이 가려진다.
 * 돌리지 않는 경로가 없으면 Vercel 이 public/404.html 을 404 상태로 준다(기본 NOT_FOUND 글자 대신, 11/27).
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

describe('vercel.json — 모르는 주소를 앱으로', () => {
  it('없는 경로는 index.html 로 가고, 앱은 그 경로를 NotFound 로 그린다', () => {
    expect(rewritten('/foo')).toBe('/index.html');
    expect(rewritten('/a/b')).toBe('/index.html');
    expect(isKnownPath('/foo')).toBe(false);
  });

  it('서버 함수와 빌드 산출물은 돌리지 않는다', () => {
    expect(rewritten('/api/photo')).toBeNull();
    expect(rewritten('/assets/index-abc.js')).toBeNull();
  });

  it('돌리지 않는 경로의 404 는 JS 없는 한 장이고, 검색에 남지 않으며 처음 화면으로 돌아간다', () => {
    const html = readFileSync(resolve(process.cwd(), 'public/404.html'), 'utf8');
    expect(html).toContain('<meta name="robots" content="noindex" />');
    expect(html).toContain('href="/"');
    expect(html).not.toMatch(/<script/i);
  });
});
