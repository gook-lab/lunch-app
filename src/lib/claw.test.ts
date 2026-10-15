/**
 * 인형뽑기 각본 테스트.
 *
 * 약속을 직접 잰다: 끝에 당첨 인형만 뽑힌 자리(won)에 있다 · 당첨 아닌 인형은 어느 순간에도 출구에 들어가지 않는다
 * · 당첨 인형은 마지막 기회에만 들어간다 · 7.2초 안 · 같은 판은 같은 각본 · 사건이 고루 나온다.
 */
import { describe, expect, it } from 'vitest';
import {
  clawColumns,
  clawLayout,
  clawNameMax,
  clawPlan,
  finalDuration,
  MAX_END_MS,
  preDuration,
  stepAt,
  type AttemptKind,
  type ClawPlan,
} from './claw';
import { seededRandom } from './random';

const planFor = (count: number, winner: number, seed: number): ClawPlan =>
  clawPlan(clawLayout(count, seededRandom(11 + count)), winner, seededRandom(seed))!;

describe('인형뽑기 배치', () => {
  it('인형이 상자 안에 있고, 같은 줄 이름표(칸 폭 0.94)는 겹치지 않는다', () => {
    for (let n = 1; n <= 20; n += 1) {
      const L = clawLayout(n, seededRandom(n));
      expect(L.toys).toHaveLength(n);
      for (const t of L.toys) {
        expect(t.x - L.size / 2).toBeGreaterThanOrEqual(L.chuteW - 0.5);
        expect(t.x + L.size / 2).toBeLessThanOrEqual(100);
        expect(t.y + L.toyH / 2).toBeLessThanOrEqual(L.floor + 1);
        // 위쪽 띠(집게가 인형을 들고 다니는 곳)를 비워 둔다.
        expect(t.y - L.toyH / 2).toBeGreaterThan(L.home.y + L.toyH * 0.95);
      }
      for (let r = 0; r < L.rows; r += 1) {
        const xs = L.toys.filter((t) => t.row === r).map((t) => t.x).sort((a, b) => a - b);
        for (let k = 1; k < xs.length; k += 1) expect(xs[k] - xs[k - 1]).toBeGreaterThan(L.cellW * 0.9);
      }
      // 출구는 인형이 들어갈 만큼 넓다.
      expect(L.chuteW).toBeGreaterThanOrEqual(L.size * 0.98);
    }
  });

  it('열 수·이름표 글자 수', () => {
    expect([2, 3, 5, 15, 20].map(clawColumns)).toEqual([2, 3, 3, 4, 5]);
    expect(clawNameMax(4, false)).toBe(5);
    expect(clawNameMax(4, true)).toBeGreaterThan(5);
  });

  it('모양·색이 이웃끼리 다르다', () => {
    const L = clawLayout(15, seededRandom(3));
    for (let i = 1; i < 15; i += 1) expect(L.toys[i].kind).not.toBe(L.toys[i - 1].kind);
    expect(new Set(L.toys.map((t) => t.color)).size).toBe(15);
  });
});

describe('인형뽑기 각본', () => {
  it('한 곳뿐이거나 당첨이 범위 밖이면 null', () => {
    expect(clawPlan(clawLayout(1), 0)).toBeNull();
    expect(clawPlan(clawLayout(3), 3)).toBeNull();
  });

  it('공정성: 끝에 당첨 인형만 won · 당첨 아닌 인형은 한 번도 출구에 들어가지 않는다 (2..20곳 × 여러 시드)', () => {
    for (let n = 2; n <= 20; n += 1) {
      for (let s = 0; s < 40; s += 1) {
        const w = (s * 7 + n) % n;
        const plan = planFor(n, w, s * 101 + n);
        const last = plan.steps[plan.steps.length - 1];
        expect(last.toys[w].state).toBe('won');
        last.toys.forEach((p, i) => {
          if (i !== w) expect(['won', 'chute'], `${n}/${s}/${i}`).not.toContain(p.state);
        });
        const finalStart = plan.attempts[plan.attempts.length - 1].startMs;
        for (const st of plan.steps) {
          st.toys.forEach((p, i) => {
            if (i !== w) expect(['won', 'chute'], `${n}/${s}/${i}`).not.toContain(p.state);
          });
          // 당첨 인형은 마지막 기회 전엔 들리지도 출구에 들어가지도 않는다.
          if (st.at < finalStart) expect(['held', 'chute', 'won']).not.toContain(st.toys[w].state);
        }
        // 마지막 기회는 언제나 당첨 인형을 노린다. 앞 기회는 weak 만 당첨을 스칠 수 있다.
        expect(plan.attempts[plan.attempts.length - 1].target).toBe(w);
        for (const a of plan.attempts.slice(0, -1)) {
          if (a.kind !== 'weak') expect(a.target).not.toBe(w);
          expect(a.extra).not.toBe(w);
        }
      }
    }
  });

  it('길이 5~7.2초, 기회 2~3번, 첫 기회는 가짜 당첨(미끄러짐·문턱·두 개·툭)', () => {
    let min = Infinity;
    let max = 0;
    for (let s = 0; s < 600; s += 1) {
      const n = 2 + (s % 19);
      const plan = planFor(n, s % n, s);
      min = Math.min(min, plan.endMs);
      max = Math.max(max, plan.endMs);
      expect(plan.attempts.length).toBeGreaterThanOrEqual(2);
      expect(plan.attempts.length).toBeLessThanOrEqual(3);
      expect(['slip', 'edge', 'double', 'nudge']).toContain(plan.attempts[0].kind);
      // 시각이 앞으로만 간다.
      for (let k = 1; k < plan.steps.length; k += 1) expect(plan.steps[k].at).toBeGreaterThan(plan.steps[k - 1].at);
      expect(plan.steps[plan.steps.length - 1].at).toBeLessThan(plan.endMs);
    }
    expect(min).toBeGreaterThanOrEqual(5000);
    expect(max).toBeLessThanOrEqual(MAX_END_MS);
  });

  it('계산한 길이와 각본 길이가 같다', () => {
    for (let s = 0; s < 200; s += 1) {
      const plan = planFor(9, s % 9, s);
      const kinds = plan.attempts.map((a) => a.kind);
      const fin = kinds[kinds.length - 1] as 'clean' | 'double' | 'teeter';
      const pre = kinds.slice(0, -1) as ('slip' | 'edge' | 'weak' | 'double' | 'nudge')[];
      const sum = pre.reduce((t, k) => t + preDuration(k), 0) + finalDuration(fin);
      expect(Math.abs(plan.endMs - sum)).toBeLessThanOrEqual(3);
    }
  });

  it('같은 판 번호면 같은 각본', () => {
    expect(planFor(12, 4, 77)).toEqual(planFor(12, 4, 77));
  });

  it('사건이 고루 나온다(2000판)', () => {
    const counts = new Map<string, number>();
    let three = 0;
    const N = 2000;
    for (let s = 0; s < N; s += 1) {
      const n = 2 + (s % 14);
      const plan = planFor(n, (s * 3) % n, s * 7 + 1);
      if (plan.attempts.length === 3) three += 1;
      plan.attempts.forEach((a, k) => {
        const key = k === plan.attempts.length - 1 ? `final-${a.kind}` : a.kind;
        counts.set(key, (counts.get(key) ?? 0) + 1);
      });
    }
    const kinds: string[] = ['slip', 'edge', 'weak', 'double', 'nudge', 'final-clean', 'final-double', 'final-teeter'];
    for (const k of kinds) expect(counts.get(k) ?? 0, k).toBeGreaterThan(N * 0.08);
    expect(three / N).toBeGreaterThan(0.2);
    expect(three / N).toBeLessThan(0.8);
  });

  it('툭 — 당첨 인형이 출구 쪽으로 굴러가고 마지막 집게는 거기로 간다', () => {
    let s = 0;
    let plan = planFor(10, 6, s);
    while (!plan.attempts.some((a) => a.kind === 'nudge')) plan = planFor(10, 6, ++s);
    const L = clawLayout(10, seededRandom(21));
    const last = plan.steps[stepAt(plan, plan.attempts[plan.attempts.length - 1].startMs) - 1];
    expect(last.toys[6].x).toBeLessThan(L.toys[6].x + 0.01);
    expect(last.toys[6].x).toBeLessThan(L.chuteW + L.size * 1.2);
    // 마지막 기회에 집게가 굴러간 자리로 내려간다.
    const fin = plan.steps.find((st) => st.at >= plan.attempts[plan.attempts.length - 1].startMs && st.button)!;
    expect(Math.abs(fin.claw.x - last.toys[6].x)).toBeLessThan(0.01);
  });

  it('문턱(아깝다) — 당첨 아닌 인형이 출구 벽에 걸렸다가 더미 쪽으로 넘어간다', () => {
    let s = 0;
    let plan = planFor(8, 1, s);
    while (!plan.attempts.some((a) => a.kind === 'edge')) plan = planFor(8, 1, ++s);
    const edge = plan.attempts.find((a) => a.kind === 'edge')!;
    const L = clawLayout(8, seededRandom(19));
    const teeter = plan.steps.find((st) => st.toys[edge.target].state === 'teeter')!;
    expect(teeter.callout?.text).toBe('아깝다!');
    expect(Math.abs(teeter.toys[edge.target].x - L.chuteW)).toBeLessThan(L.size * 0.2);
    const after = plan.steps[stepAt(plan, edge.startMs + preDuration('edge') - 1)];
    expect(after.toys[edge.target].x).toBeGreaterThan(L.chuteW);
    expect(after.toys[edge.target].state).not.toBe('chute');
  });

  it('마지막 기회엔 3·2·1 을 센다', () => {
    const plan = planFor(5, 2, 9);
    const fin = plan.attempts[plan.attempts.length - 1].startMs;
    const counts = plan.steps.filter((st) => st.at >= fin && st.callout?.tone === 'count').map((st) => st.callout!.text);
    expect([...new Set(counts)]).toEqual(['3', '2', '1']);
    const kinds = new Set<AttemptKind>(plan.attempts.map((a) => a.kind));
    expect(kinds.size).toBeGreaterThan(0);
  });
});
