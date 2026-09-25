import { describe, expect, it } from 'vitest';
import { practiceScore, speedMultiplier } from '../src/core/practiceScore';
import { generateQuestion, type Mode } from '../src/core/generator';
import { DEFAULT_RULES } from '../src/core/rules';
import {
  ECONOMY,
  applyDelta,
  comboMult,
  costFor,
  freshWallet,
  isBankrupt,
  paytableKey,
  paytableRows,
  roundPrize,
} from '../src/ui/machine/economy';
import { Machine, PREMIUM_SYMBOL } from '../src/ui/machine/machine';

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
  it('ラウンド賞金：打点・親・速答・連続・PREMIUM・ハイローラー', () => {
    const base = { mode: 'jissen' as Mode, limit: '満貫' as const, dealer: false, fast: false, combo: 1, premium: false, highRoller: false };
    const v = roundPrize(base);
    expect(roundPrize({ ...base, limit: '役満' })).toBeGreaterThan(v * 10);
    expect(roundPrize({ ...base, dealer: true })).toBeGreaterThan(v);
    expect(roundPrize({ ...base, fast: true })).toBeGreaterThan(v);
    expect(roundPrize({ ...base, combo: 20 })).toBe(roundPrize({ ...base, combo: 6 }));
    expect(roundPrize({ ...base, combo: 6 })).toBeGreaterThan(v);
    expect(roundPrize({ ...base, premium: true, highRoller: true })).toBeGreaterThanOrEqual(v * 4.9);
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
function simulate(mode: Mode, accuracy: number, fastRate: number, highRoller = false, seed = 1, questions = 20000) {
  const rng = mulberry32(seed);
  const pick = (round: boolean) => {
    const q = generateQuestion(mode, DEFAULT_RULES, { seat: 'any', win: 'any' }, rng, false, round);
    const s = q.mode === 'hayami' ? q.score : q.ev.score;
    return { limit: s.limit, dealer: s.dealer, yakuman: q.mode !== 'hayami' && q.ev.yakuman > 0 };
  };
  const roundPool = Array.from({ length: 800 }, () => pick(true));
  const normalPool = Array.from({ length: 800 }, () => pick(false));
  const m = new Machine(() => 'off', rng);
  let spent = 0;
  let won = 0;
  const jackpot = (premium: boolean) => {
    let combo = 0;
    for (let k = 0; k < ECONOMY.rounds; k++) {
      const q = roundPool[Math.floor(rng() * roundPool.length)];
      if (rng() < accuracy * 0.95) {
        combo++;
        won += roundPrize({ mode, limit: q.limit, dealer: q.dealer, fast: rng() < fastRate, combo, premium, highRoller });
      } else combo = 0;
    }
  };
  for (let i = 0; i < questions; i++) {
    const correct = rng() < accuracy;
    const fast = correct && rng() < fastRate;
    spent += costFor(correct, fast, highRoller);
    if (!correct) continue;
    const q = normalPool[Math.floor(rng() * normalPool.length)];
    // 役満直撃（通常時のみ）
    if (q.yakuman && !m.rush) m.holds.unshift({ hit: true, kakuhen: true, color: 4 });
    else m.enter(1);
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
  it('ハイローラーは中級で回収率が上がる（高リスク・高リターン）', () => {
    expect(simulate('jissen', 0.85, 0.5, true, 4)).toBeGreaterThan(simulate('jissen', 0.85, 0.5, false, 4));
  });
});

describe('BONUS の賞金表', () => {
  it('各マスは roundPrize と一致し、打点の順に高い', () => {
    for (const mode of ['hayami', 'fu', 'jissen'] as Mode[]) {
      for (const premium of [false, true]) {
        for (const hr of [false, true]) {
          const rows = paytableRows(mode, premium, hr);
          expect(rows.map((r) => r.key)).toEqual(['under', '満貫', '跳満', '倍満', '三倍満', '役満']);
          for (const r of rows) {
            const limit = r.key === 'under' ? '' : r.key;
            expect(paytableKey(limit)).toBe(r.key);
            expect(r.prize).toBe(
              roundPrize({ mode, limit, dealer: false, fast: false, combo: 1, premium, highRoller: hr }),
            );
          }
          for (let i = 1; i < rows.length; i++) expect(rows[i].prize).toBeGreaterThan(rows[i - 1].prize);
        }
      }
    }
  });

  it('連続正解の倍率は 1.0 から 0.1 ずつ上がり最大 1.5', () => {
    expect(comboMult(0)).toBe(1);
    expect(comboMult(2)).toBeCloseTo(1.2);
    expect(comboMult(9)).toBe(ECONOMY.comboMax);
  });
});
