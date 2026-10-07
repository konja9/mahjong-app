import { describe, expect, it } from 'vitest';
import { generateHandQuestion } from '../src/core/generator';
import { DEFAULT_RULES } from '../src/core/rules';
import { formatAnswer } from '../src/core/score';
import { hanBucket, stepCorrect, studySteps } from '../src/core/steps';
import { StepRun, stepVerdict } from '../src/ui/steps';

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const keikoHands = (seed: number, n: number) => {
  const rng = mulberry32(seed);
  const c = { call: 'any', shape: 'any', dist: 'real', want: (q: { ev: { yakuman: number } }) => !q.ev.yakuman } as const;
  return Array.from({ length: n }, () => generateHandQuestion({ mode: 'jissen', rules: DEFAULT_RULES, filters: { seat: 'any', win: 'any' }, rng, constraints: c }));
};

describe('稽古の段階練習', () => {
  it('重点学習：段階の答えが点数エンジン（符・翻・点数）と一致する', () => {
    for (const q of keikoHands(12, 1000)) {
      const steps = studySteps(q, DEFAULT_RULES, 'focus', mulberry32(1));
      const els = steps.map((s) => s.element);
      expect(els.slice(-3)).toEqual(['fu', 'han', 'score']);
      const [fu, han, score] = steps.slice(-3);
      expect(fu.answer).toBe(q.ev.fu.fu);
      expect(han.answerNum).toBe(q.ev.han);
      expect(han.answer).toBe(hanBucket(q.ev.han));
      expect(score.answer).toBe(formatAnswer(q.ev.score));
      // 選択肢に正解が含まれる
      for (const s of steps) if (!s.auto) expect(s.options.some((o) => o.value === s.answer)).toBe(true);
      if (q.ev.interp.form === 'chiitoi') {
        // 七対子は基本符〜待ちを飛ばして、符（25）から
        expect(els).toEqual(['fu', 'han', 'score']);
        expect(fu.answer).toBe(25);
        continue;
      }
      expect(els[0]).toBe('base');
      // 刻子・槓子の数だけ面子の段階がある（なければ表示だけの段階が1つ）
      const triplets = q.ev.interp.form === 'standard' ? q.ev.interp.groups.filter((g) => g.kind !== 'shuntsu').length : 0;
      const mentsu = steps.filter((s) => s.element === 'mentsu');
      expect(mentsu.length).toBe(Math.max(1, triplets));
      if (!triplets) expect(mentsu[0].auto).toBe(true);
      // 積み上げ：副底20 ＋ 基本符・面子・雀頭・待ち ＝ 切り上げ前の合計（喰い平和形は 20 → 30）
      const sum = 20 + steps.reduce((t, s) => t + (s.tally?.fu ?? 0), 0);
      const kui = q.ev.fu.items.some((x) => x.label.startsWith('喰い平和'));
      expect(kui ? 30 : sum).toBe(q.ev.fu.raw);
    }
  });
  it('簡易学習は 符 → 翻 → 点数 の3段階', () => {
    for (const q of keikoHands(13, 200)) {
      expect(studySteps(q, DEFAULT_RULES, 'quick').map((s) => s.element)).toEqual(['fu', 'han', 'score']);
    }
  });
  it('数値入力：翻は翻数そのもの、点数は子のツモなら「子-親」で照合する', () => {
    for (const q of keikoHands(14, 200)) {
      const [, han, score] = studySteps(q, DEFAULT_RULES, 'quick');
      expect(stepCorrect(han, String(q.ev.han), true)).toBe(true);
      expect(stepCorrect(han, String(q.ev.han + 1), true)).toBe(false);
      const s = q.ev.score;
      const typed = !s.tsumo ? String(s.payment.ron) : s.dealer ? String(s.payment.fromDealer) : `${s.payment.fromChild}-${s.payment.fromDealer}`;
      expect(stepCorrect(score, typed, true)).toBe(true);
    }
  });
  it('進行：表示だけの段階は自動で進み、正答数に数えない', () => {
    const q = keikoHands(15, 300).find((h) => h.ev.interp.form === 'standard' && h.ev.interp.groups.every((g) => g.kind === 'shuntsu'))!;
    const run = new StepRun(studySteps(q, DEFAULT_RULES, 'focus'));
    while (!run.done) run.answer(run.current!.answer, false);
    expect(run.allCorrect).toBe(true);
    expect(run.total).toBe(run.steps.length - 1);
    expect(run.html()).toContain('副底');
  });
});

describe('段階練習の判定', () => {
  it('全部正解は正解、点数が合えばほぼ正解、過半数ならおしい、それ以外は不正解', () => {
    expect(stepVerdict(7, 7, true)).toBe('ok');
    expect(stepVerdict(6, 7, true)).toBe('almost');
    expect(stepVerdict(1, 7, true)).toBe('almost');
    expect(stepVerdict(4, 7, false)).toBe('close');
    expect(stepVerdict(3, 7, false)).toBe('ng');
    expect(stepVerdict(2, 3, false)).toBe('close');
    expect(stepVerdict(1, 3, false)).toBe('ng');
  });
});
