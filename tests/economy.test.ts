import { describe, expect, it } from 'vitest';
import { practiceScore, speedMultiplier } from '../src/core/practiceScore';
import { ECONOMY, applyDelta, costFor, freshWallet, isBankrupt, payoutFor } from '../src/ui/machine/economy';
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
  it('払い出し', () => {
    expect(payoutFor(false)).toBe(200);
    expect(payoutFor(true)).toBe(400);
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

/** プレイヤーを模擬して収支を求める（収支 ÷ 総コスト） */
function simulate(accuracy: number, fastRate: number, seed: number, questions = 10000) {
  const rng = mulberry32(seed);
  const m = new Machine(() => 'off', rng);
  let spent = 0;
  let won = 0;
  for (let i = 0; i < questions; i++) {
    const correct = rng() < accuracy;
    const fast = correct && rng() < fastRate;
    spent += costFor(correct, fast);
    if (!correct) continue;
    m.enter(rng() < 0.08 ? 2 : 1);
    for (let r = m.spin(); r; r = m.spin()) {
      if (r.hit) won += payoutFor(r.symbols[0] === PREMIUM_SYMBOL);
      m.settle(r);
    }
  }
  return (won - spent) / spent;
}

describe('経済バランス（シミュレーション）', () => {
  it('上級（95%・速答80%）はプラス', () => {
    expect(simulate(0.95, 0.8, 1)).toBeGreaterThan(0.3);
  });
  it('中級（85%・速答50%）はほぼトントン（±15%）', () => {
    const r = simulate(0.85, 0.5, 2);
    expect(Math.abs(r)).toBeLessThan(0.15);
  });
  it('初心者（60%・速答20%）はマイナス', () => {
    expect(simulate(0.6, 0.2, 3)).toBeLessThan(-0.3);
  });
});
