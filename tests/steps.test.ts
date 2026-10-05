import { describe, expect, it } from 'vitest';
import { generateHandQuestion } from '../src/core/generator';
import { DEFAULT_RULES } from '../src/core/rules';
import { fuSteps } from '../src/core/steps';

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('段階回答', () => {
  it('段階の正解を足すと、点数エンジンの符と一致する', () => {
    const rng = mulberry32(12);
    for (let i = 0; i < 1000; i++) {
      const q = generateHandQuestion({ mode: 'fu', rules: DEFAULT_RULES, filters: { seat: 'any', win: 'any' }, rng });
      const steps = fuSteps(q, DEFAULT_RULES);
      if (q.ev.interp.form === 'chiitoi') {
        expect(steps.map((s) => s.answer)).toEqual([25]);
        continue;
      }
      expect(steps.map((s) => s.element)).toEqual(['wait', 'mentsu', 'pair', 'kafu', 'total', 'roundup']);
      const [wait, mentsu, pair, kafu, total, round] = steps;
      expect(wait.answer).toBe(q.ev.interp.form === 'standard' && q.ev.interp.wait);
      const kui = q.ev.fu.items.some((x) => x.label.startsWith('喰い平和'));
      expect(20 + Number(mentsu.answer) + Number(pair.answer) + Number(kafu.answer) + (kui ? 10 : 0)).toBe(total.answer);
      expect(total.answer).toBe(q.ev.fu.raw);
      expect(round.answer).toBe(Math.min(q.ev.fu.fu, 70));
      // 選択肢に正解が含まれる
      for (const s of steps) if (s.kind === 'buttons') expect(s.options.some((o) => o.value === s.answer)).toBe(true);
    }
  });
});
