import { describe, expect, it } from 'vitest';
import { generateQuestion, type Mode } from '../src/core/generator';
import { DEFAULT_RULES } from '../src/core/rules';
import {
  ECONOMY,
  applyDelta,
  comboMult,
  costFor,
  ballsFor,
  drawUwanose,
  extraRoundsFor,
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
    expect(costFor(false, false)).toBe(60);
    expect(costFor(false, true)).toBe(60);
  });
  it('ラウンド賞金：符のマス・連続・PREMIUM（翻と親子では変わらない）', () => {
    const base = { mode: 'jissen' as Mode, fu: 40, yakuman: false, fast: false, combo: 1, premium: false };
    const v = roundPrize(base);
    const v30 = roundPrize({ ...base, fu: 30 });
    // 高い符ほど大きい（30符を1として 20 ×0.7 … 60 ×3.3）
    expect(roundPrize({ ...base, fu: 60 }) / v30).toBeCloseTo(3.3, 1);
    expect(roundPrize({ ...base, fu: 20 }) / v30).toBeCloseTo(0.7, 1);
    expect(v30).toBeLessThan(v);
    expect(roundPrize({ ...base, fu: 0, yakuman: true })).toBeGreaterThan(v * 5);
    // 速答は BET の割引で得をするので、賞金は変わらない
    expect(roundPrize({ ...base, fast: true })).toBe(Math.round(v * ECONOMY.fastMult));
    expect(roundPrize({ ...base, combo: 20 })).toBe(roundPrize({ ...base, combo: 5 }));
    expect(roundPrize({ ...base, combo: 5 })).toBeGreaterThanOrEqual(Math.floor(v * ECONOMY.comboLadder.at(-1)!));
    expect(roundPrize({ ...base, premium: true })).toBeGreaterThanOrEqual(v * 1.9);
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

/** プレイヤーを模擬して回収率（払い出し ÷ 総コスト）を求める */
export function simulate(
  mode: Mode,
  accuracy: number,
  fastRate: number,
  seed = 1,
  questions = 20000,
  spec: MachineSpec = SPECS.ama,
) {
  const rng = mulberry32(seed);
  const pick = (premium: boolean) => {
    const q = generateQuestion(mode, DEFAULT_RULES, { seat: 'any', win: 'any' }, rng, premium);
    const ext = extraRoundsFor(q.mode === 'hayami' ? q.score.limit : q.ev.score.limit);
    return q.mode === 'hayami'
      ? { fu: q.han >= 5 ? 0 : q.fu, yakuman: q.han >= 13, ext }
      : { fu: q.ev.yakuman ? 0 : q.ev.fu.fu, yakuman: q.ev.yakuman > 0, ext };
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
    let extra = 0;
    for (let k = 0; k < spec.rounds + extra; k++) {
      const q = pool[Math.floor(rng() * pool.length)];
      if (rng() < accuracy) {
        combo++;
        extra += Math.min(q.ext, ECONOMY.extraRounds.max - extra);
        total += roundPrize({ mode, fu: q.fu, yakuman: q.yakuman, fast: rng() < fastRate, combo, premium, spec });
      } else {
        combo = 0;
        perfect = false;
      }
    }
    if (perfect) total *= drawUwanose(rng, premium);
    won += total;
  };
  let streak = 0;
  for (let i = 0; i < questions; i++) {
    const correct = rng() < accuracy;
    streak = correct ? streak + 1 : 0;
    const fast = correct && rng() < fastRate;
    spent += costFor(correct, fast, spec);
    if (!correct) {
      m.missSpin();
      continue;
    }
    m.enter(ballsFor(mode, streak));
    for (let r = m.spin(); r; r = m.spin()) {
      if (r.hit) jackpot(r.symbols[0] === PREMIUM_SYMBOL);
      m.settle(r);
    }
  }
  return won / spent;
}

describe('経済バランス（シミュレーション）', () => {
  for (const mode of ['hayami', 'fu', 'jissen'] as Mode[]) {
    // 中級者（正解85%・速答5割）は約115%、上級者（95%・8割）は約250〜300%、初心者（60%・2割）は大きく負ける
    it(`${mode}：中級は約115%、上級は約250%、初心者は大きくマイナス`, () => {
      const mid = (simulate(mode, 0.85, 0.5, 1, 30000) + simulate(mode, 0.85, 0.5, 7, 30000)) / 2;
      expect(mid).toBeGreaterThan(1.07);
      expect(mid).toBeLessThan(1.24);
      const pro = simulate(mode, 0.95, 0.8, 2, 30000);
      expect(pro).toBeGreaterThan(2.0);
      expect(pro).toBeLessThan(3.4);
      expect(simulate(mode, 0.6, 0.2, 3)).toBeLessThan(0.45);
    });
  }
  // 大当りが重い台は1回の試行のばらつきが大きいので、長めにまわして平均をとる
  it('ミドル・MAX（実戦のみ）：中級は約115%、上級は約250%', () => {
    for (const id of ['middle', 'max'] as const) {
      const mid = [11, 21, 31].map((sd) => simulate('jissen', 0.85, 0.5, sd, 100000, SPECS[id])).reduce((a, b) => a + b) / 3;
      expect(mid).toBeGreaterThan(1.05);
      expect(mid).toBeLessThan(1.27);
      const pro = simulate('jissen', 0.95, 0.8, 12, 100000, SPECS[id]);
      expect(pro).toBeGreaterThan(2.0);
      expect(pro).toBeLessThan(3.4);
    }
  }, 120000);
  it('上の台ほど1セッション（300問）の振れ幅が大きい', () => {
    const spread = (spec: MachineSpec) => {
      const xs = Array.from({ length: 120 }, (_, i) => simulate('jissen', 0.85, 0.5, 500 + i, 300, spec));
      const m = xs.reduce((a, b) => a + b) / xs.length;
      return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length);
    };
    const [a, b, c] = [spread(SPECS.ama), spread(SPECS.middle), spread(SPECS.max)];
    expect(b).toBeGreaterThan(a * 1.5);
    // MAX はミドルと同じくらい振れる（当たらないセッションが多い）。1割以上は小さくならない
    expect(c).toBeGreaterThan(b * 0.9);
    expect(c).toBeGreaterThan(a * 1.5);
  }, 60000);
});

describe('BONUS の符の目盛り', () => {
  it('各マスは roundPrize と一致し、符の順に高い。役満は超大当りだけ', () => {
    for (const mode of ['hayami', 'fu', 'jissen'] as Mode[]) {
      for (const premium of [false, true]) {
        const cells = fuScale(mode, premium);
        expect(cells.some((c) => c.key === 'yakuman')).toBe(premium);
        for (let i = 1; i < cells.length; i++) expect(cells[i].prize).toBeGreaterThan(cells[i - 1].prize);
      }
    }
  });
  it('手の符からマスを引く', () => {
    expect(fuScaleKey(20, false)).toBe(20);
    expect(fuScaleKey(25, false)).toBe(25);
    expect(fuScaleKey(0, false)).toBe(30);
    expect(fuScaleKey(40, false)).toBe(40);
    expect(fuScaleKey(60, false)).toBe(60);
    expect(fuScaleKey(110, false)).toBe(60);
    expect(fuScaleKey(0, true)).toBe('yakuman');
  });
  it('連続正解の倍率は階段状で、上限で止まる', () => {
    expect(ECONOMY.comboLadder.map((_, i) => comboMult(i))).toEqual(ECONOMY.comboLadder);
    expect(comboMult(99)).toBe(ECONOMY.comboLadder.at(-1));
  });
  it('満貫以上のラウンド上乗せ', () => {
    expect(extraRoundsFor('')).toBe(0);
    expect(extraRoundsFor('満貫')).toBe(1);
    expect(extraRoundsFor('跳満')).toBe(1);
    expect(extraRoundsFor('倍満')).toBe(2);
    expect(extraRoundsFor('三倍満')).toBe(2);
    expect(extraRoundsFor('役満')).toBe(3);
    expect(extraRoundsFor('数え役満')).toBe(3);
  });
  it('上乗せは超大当りのほうが期待値が高く、最低でも通常の最低より上', () => {
    expect(uwanoseMean(true)).toBeGreaterThan(uwanoseMean(false));
    const rng = mulberry32(3);
    for (let i = 0; i < 200; i++) expect(drawUwanose(rng, true)).toBeGreaterThan(ECONOMY.uwanose[0][0]);
  });
});

describe('電チュー開放', () => {
  it('モード別の連続正解数から玉が2個になる（早見は多く必要）', async () => {
    const { ballsFor } = await import('../src/ui/machine/economy');
    expect(ballsFor('jissen', ECONOMY.denchu.jissen - 1)).toBe(1);
    expect(ballsFor('jissen', ECONOMY.denchu.jissen)).toBe(2);
    expect(ballsFor('hayami', ECONOMY.denchu.jissen)).toBe(1);
    expect(ECONOMY.denchu.hayami).toBeGreaterThan(ECONOMY.denchu.fu);
    expect(ECONOMY.denchu.fu).toBeGreaterThan(ECONOMY.denchu.jissen);
  });
});
