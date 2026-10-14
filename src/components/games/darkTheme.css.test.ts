/**
 * 다크 테마에서 게임판이 깨지지 않게 하는 CSS 계약.
 *
 * jsdom 은 CSS 를 계산하지 않아 화면 대비를 잴 수 없다. 그래서 App.css 규칙 자체를 읽어
 * 10/15 다크 점검에서 고친 네 가지가 되돌아오지 않는지만 본다. 실제 대비 수치는 커밋 메시지에 남겼다.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const css = readFileSync(resolve(process.cwd(), 'src/App.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const tokens = readFileSync(resolve(process.cwd(), 'node_modules/@gook-lab/tokens/styles.css'), 'utf8');

// 가장 안쪽 블록만 잡는다 — @media 안의 규칙도 자기 선택자와 함께 나온다.
const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ sel: m[1].trim(), body: m[2] }));
const rulesFor = (pred: (sel: string) => boolean) => rules.filter((r) => pred(r.sel));
const lightToken = (name: string) => tokens.match(new RegExp(`--color-${name}:\\s*(#[0-9a-f]{6})`, 'i'))?.[1];

describe('다크 테마 게임판 CSS', () => {
  it('카드·짝 맞추기 결과에서 물러난 카드를 투명도로 흐리지 않는다(11px 메타가 3.18:1 이었다)', () => {
    const dimmed = rulesFor(
      (s) => (s.includes('cards__grid--done') && s.includes(':not(.cards__card--win)')) || s.includes('memory__card--out'),
    );
    expect(dimmed.length).toBeGreaterThan(0);
    for (const r of dimmed) expect(r.body, r.sel).not.toMatch(/opacity\s*:\s*0?\.\d/);
  });

  it('다크에선 카드 뒷면을 --color-text(가장 밝은 색)로 칠하지 않는다', () => {
    for (const face of ['.cards__face--back', '.memory__face--back']) {
      const dark = rulesFor((s) => s.includes("[data-theme='dark']") && s.includes(face));
      expect(dark.length, face).toBeGreaterThan(0);
      const bg = dark.map((r) => r.body).join(';').match(/background\s*:([^;]*)/)?.[1] ?? '';
      expect(bg).toContain('var(--color-neutral-200)');
      expect(bg).not.toMatch(/,\s*var\(--color-text\)\s*$/);
    }
  });

  it('뽑기 기계 몸통·손잡이·받침은 다크에서도 밝은 테마의 짙은 빨강을 쓴다', () => {
    const pin = rulesFor((s) => s.includes("[data-theme='dark'] .gacha__base"));
    expect(pin.length).toBe(1);
    const body = pin[0].body;
    expect(pin[0].sel).toContain('.gacha__body');
    expect(pin[0].sel).toContain('.gacha__handle');
    // 다크 토큰은 700→900 이 밝아진다. 고정값은 밝은 테마(:root) 값과 같아야 한다.
    for (const step of ['700', '800', '900']) {
      const light = lightToken(`accent-${step}`);
      expect(light, step).toBeTruthy();
      expect(body).toMatch(new RegExp(`--color-accent-${step}:\\s*${light}`, 'i'));
    }
  });

  it("'게임 중' 단추는 MODUL 비활성 투명도를 풀고 회색 바탕에 본문 글자색을 쓴다", () => {
    const busy = rulesFor((s) => s.includes('.stage--busy .stage__run:disabled'));
    expect(busy.length).toBe(1);
    expect(busy[0].body).toMatch(/opacity\s*:\s*1\b/);
    expect(busy[0].body).toContain('color: var(--color-text)');
  });
});
