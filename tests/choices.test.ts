import { describe, expect, it } from 'vitest';
import { FU_BUTTONS, makeChoices } from '../src/core/choices';
import { generateQuestion } from '../src/core/generator';
import { DEFAULT_RULES } from '../src/core/rules';
import { calcScore, formatAnswer } from '../src/core/score';

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pattern = (label: string) => label.replace(/\d+/g, 'N');

describe('makeChoices', () => {
  it('符計算：いつも同じ昇順の6つのボタンで、正解は1つ', () => {
    const rng = mulberry32(99);
    for (let i = 0; i < 1000; i++) {
      const q = generateQuestion('fu', DEFAULT_RULES, { seat: 'any', win: 'any' }, rng);
      if (q.mode !== 'fu') throw new Error('mode');
      for (const fuFocus of [false, true]) {
        const choices = makeChoices(q, DEFAULT_RULES, rng, fuFocus);
        expect(choices.map((c) => c.label)).toEqual(['20符', '25符', '30符', '40符', '50符', '60符']);
        const correct = choices.filter((c) => c.correct);
        expect(correct).toHaveLength(1);
        const fu = q.ev.fu.fu;
        expect(correct[0].label).toBe(`${fu}符`);
      }
    }
    expect([...FU_BUTTONS]).toEqual([...FU_BUTTONS].sort((a, b) => a - b));
  });

  for (const mode of ['hayami', 'jissen'] as const) {
    it(`${mode}: 4択・重複なし・正解は1つ・表記がそろう`, () => {
      const rng = mulberry32(mode.length * 7);
      for (let i = 0; i < 1000; i++) {
        const q = generateQuestion(mode, DEFAULT_RULES, { seat: 'any', win: 'any' }, rng);
        const choices = makeChoices(q, DEFAULT_RULES, rng);
        expect(choices).toHaveLength(4);
        expect(new Set(choices.map((c) => c.label)).size).toBe(4);
        const correct = choices.filter((c) => c.correct);
        expect(correct).toHaveLength(1);
        const expected = formatAnswer(q.mode === 'hayami' ? q.score : q.mode === 'jissen' ? q.ev.score : q.ev.score);
        expect(correct[0].label).toBe(expected);
        for (const c of choices) expect(pattern(c.label)).toBe(pattern(expected));
      }
    });
  }

  for (const mode of ['hayami', 'jissen'] as const) {
    it(`${mode}: BONUS の4翻以下は、誤答の大半が同じ翻で符だけ違う点数`, () => {
      const rng = mulberry32(mode.length * 13);
      let same = 0;
      let total = 0;
      for (let i = 0; i < 600; i++) {
        const q = generateQuestion(mode, DEFAULT_RULES, { seat: 'any', win: 'any' }, rng);
        const han = q.mode === 'hayami' ? q.han : q.mode === 'jissen' ? q.ev.han : 0;
        const s = q.mode === 'hayami' ? q.score : q.mode === 'jissen' ? q.ev.score : null;
        if (!s || han >= 5 || s.limit) continue;
        const labels = new Set(
          [20, 25, 30, 40, 50, 60, 70, 80, 90, 100, 110].map((fu) =>
            formatAnswer(calcScore(han, fu, s.dealer, s.tsumo, DEFAULT_RULES)),
          ),
        );
        const choices = makeChoices(q, DEFAULT_RULES, rng, true);
        expect(choices).toHaveLength(4);
        expect(new Set(choices.map((c) => c.label)).size).toBe(4);
        for (const c of choices.filter((c) => !c.correct)) {
          total++;
          if (labels.has(c.label)) same++;
        }
      }
      expect(same / total).toBeGreaterThan(0.85);
    });
  }
});
