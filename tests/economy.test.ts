import { describe, expect, it } from 'vitest';
import { practiceScore, speedMultiplier } from '../src/core/practiceScore';
import { generateQuestion, type Mode } from '../src/core/generator';
import { DEFAULT_RULES } from '../src/core/rules';
import {
  ECONOMY,
  applyDelta,
  comboMult,
  costFor,
  drawUwanose,
  freshWallet,
  fuScale,
  fuScaleKey,
  isBankrupt,
  roundPrize,
  uwanoseMean,
} from '../src/ui/machine/economy';
import { Machine, PREMIUM_SYMBOL } from '../src/ui/machine/machine';
import { type MachineSpec, SPECS } from '../src/ui/machine/specs';

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('yan', () => {
  it('コスト', () => {
    expect(costFor(true, true)).toBe(20);
    expect(costFor(true, false)).toBe(40);
    expect(costFor(false, false)).toBe(120);
    expect(costFor(false, true)).toBe(120);
  });
  it('ハイローラーはコスト2倍', () => {
    expect(costFor(true, true, true)).toBe(40);
    expect(costFor(false, false, true)).toBe(240);
  });
  it('ラウンド賞金：符・速答・連続・PREMIUM・ハイローラー（翻と親子では変わらない）', () => {
    const base = { mode: 'jissen' as Mode, fu: 40, yakuman: false, fast: false, combo: 1, premium: false, highRoller: false };
    const v = roundPrize(base);
    expect(roundPrize({ ...base, fu: 70 })).toBeGreaterThan(v);
    expect(roundPrize({ ...base, fu: 30 })).toBeLessThan(v);
    expect(roundPrize({ ...base, fu: 0, yakuman: true })).toBeGreaterThan(v * 5);
    expect(roundPrize({ ...base, fast: true })).toBeGreaterThan(v);
    expect(roundPrize({ ...base, combo: 20 })).toBe(roundPrize({ ...base, combo: 5 }));
    expect(roundPrize({ ...base, combo: 5 })).toBeGreaterThanOrEqual(v * 4.5);
    expect(roundPrize({ ...base, premium: true, highRoller: true })).toBeGreaterThanOrEqual(v * 4.5);
    // 早見の満貫以上（符なし）は30符ぶん
    expect(roundPrize({ ...base, mode: 'hayami', fu: 0 })).toBe(roundPrize({ ...base, mode: 'hayami', fu: 30 }));
  });
  it('破産判定と推移', () => {
    let w = freshWallet();
    expect(w.balance).toBe(ECONOMY.initial);
    w = applyDelta(w, -1000);
    expect(isBankrupt(w)).toBe(true);
    expect(w.history).toEqual([1000, 0]);
  });
});

describe('プラクティスのスコア', () => {
  it('即答で3倍、目安時間以上で1倍、不正解は0点', () => {
    expect(speedMultiplier('hayami', 0)).toBe(3);
    expect(practiceScore('hayami', true, 0)).toBe(300);
    expect(practiceScore('hayami', true, 8)).toBe(100);
    expect(practiceScore('hayami', true, 30)).toBe(100);
    expect(practiceScore('jissen', true, 12.5)).toBe(400);
    expect(practiceScore('fu', false, 1)).toBe(0);
  });
});

/** プレイヤーを模擬して回収率（払い出し ÷ 総コスト）を求める */
export function simulate(
  mode: Mode,
  accuracy: number,
  fastRate: number,
  highRoller = false,
  seed = 1,
  questions = 20000,
  spec: MachineSpec = SPECS.ama,
) {
  const rng = mulberry32(seed);
  const pick = (premium: boolean) => {
    const q = generateQuestion(mode, DEFAULT_RULES, { seat: 'any', win: 'any' }, rng, premium);
    return q.mode === 'hayami'
      ? { fu: q.han >= 5 ? 0 : q.fu, yakuman: q.han >= 13 }
      : { fu: q.ev.yakuman ? 0 : q.ev.fu.fu, yakuman: q.ev.yakuman > 0 };
  };
  const normalPool = Array.from({ length: 800 }, () => pick(false));
  const premiumPool = Array.from({ length: 800 }, () => pick(true));
  const m = new Machine(() => 'off', rng, spec);
  let spent = 0;
  let won = 0;
  const jackpot = (premium: boolean) => {
    const pool = premium ? premiumPool : normalPool;
    let combo = 0;
    let total = 0;
    let perfect = true;
    for (let k = 0; k < spec.rounds; k++) {
      const q = pool[Math.floor(rng() * pool.length)];
      if (rng() < accuracy) {
        combo++;
        total += roundPrize({ mode, fu: q.fu, yakuman: q.yakuman, fast: rng() < fastRate, combo, premium, highRoller, spec });
      } else {
        combo = 0;
        perfect = false;
      }
    }
    if (perfect) total *= drawUwanose(rng, premium);
    won += total;
  };
  for (let i = 0; i < questions; i++) {
    const correct = rng() < accuracy;
    const fast = correct && rng() < fastRate;
    spent += costFor(correct, fast, highRoller, spec);
    if (!correct) continue;
    m.enter(1);
    for (let r = m.spin(); r; r = m.spin()) {
      if (r.hit) jackpot(r.symbols[0] === PREMIUM_SYMBOL);
      m.settle(r);
    }
  }
  return won / spent;
}

describe('経済バランス（シミュレーション）', () => {
  for (const mode of ['hayami', 'fu', 'jissen'] as Mode[]) {
    it(`${mode}：中級はほぼ100%、上級は大きくプラス、初心者は大きくマイナス`, () => {
      const mid = simulate(mode, 0.85, 0.5);
      expect(mid).toBeGreaterThan(0.85);
      expect(mid).toBeLessThan(1.15);
      expect(simulate(mode, 0.95, 0.8, false, 2)).toBeGreaterThan(1.6);
      expect(simulate(mode, 0.6, 0.2, false, 3)).toBeLessThan(0.5);
    });
  }
  it('ミドル・MAX（実戦のみ）：中級はほぼ100%、上級は大きくプラス', () => {
    for (const id of ['middle', 'max'] as const) {
      const mid = simulate('jissen', 0.85, 0.5, false, 11, 40000, SPECS[id]);
      expect(mid).toBeGreaterThan(0.85);
      expect(mid).toBeLessThan(1.15);
      expect(simulate('jissen', 0.95, 0.8, false, 12, 40000, SPECS[id])).toBeGreaterThan(1.6);
    }
  });
  it('上の台ほど1セッション（300問）の振れ幅が大きい', () => {
    const spread = (spec: MachineSpec) => {
      const xs = Array.from({ length: 120 }, (_, i) => simulate('jissen', 0.85, 0.5, false, 500 + i, 300, spec));
      const m = xs.reduce((a, b) => a + b) / xs.length;
      return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length);
    };
    const [a, b, c] = [spread(SPECS.ama), spread(SPECS.middle), spread(SPECS.max)];
    expect(b).toBeGreaterThan(a);
    expect(c).toBeGreaterThan(b);
  }, 60000);
  it('ハイローラーは中級で回収率が上がる（高リスク・高リターン）', () => {
    expect(simulate('jissen', 0.85, 0.5, true, 4)).toBeGreaterThan(simulate('jissen', 0.85, 0.5, false, 4));
  });
});

describe('BONUS の符の目盛り', () => {
  it('各マスは roundPrize と一致し、符の順に高い。役満は超大当りだけ', () => {
    for (const mode of ['hayami', 'fu', 'jissen'] as Mode[]) {
      for (const premium of [false, true]) {
        for (const hr of [false, true]) {
          const cells = fuScale(mode, premium, hr);
          expect(cells.some((c) => c.key === 'yakuman')).toBe(premium);
          for (let i = 1; i < cells.length; i++) expect(cells[i].prize).toBeGreaterThan(cells[i - 1].prize);
        }
      }
    }
  });
  it('手の符からマスを引く', () => {
    expect(fuScaleKey(20, false)).toBe(30);
    expect(fuScaleKey(25, false)).toBe(30);
    expect(fuScaleKey(0, false)).toBe(30);
    expect(fuScaleKey(40, false)).toBe(40);
    expect(fuScaleKey(110, false)).toBe(80);
    expect(fuScaleKey(0, true)).toBe('yakuman');
  });
  it('連続正解の倍率は階段状で、上限で止まる', () => {
    expect(ECONOMY.comboLadder.map((_, i) => comboMult(i))).toEqual(ECONOMY.comboLadder);
    expect(comboMult(99)).toBe(ECONOMY.comboLadder.at(-1));
  });
  it('上乗せは超大当りのほうが期待値が高く、最低 ×3', () => {
    expect(uwanoseMean(true)).toBeGreaterThan(uwanoseMean(false));
    const rng = mulberry32(3);
    for (let i = 0; i < 200; i++) expect(drawUwanose(rng, true)).toBeGreaterThanOrEqual(3);
  });
});
