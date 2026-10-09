import { describe, expect, it } from 'vitest';
import type { Mode } from '../src/core/generator';
import {
  ECONOMY,
  applyDelta,
  comboMult,
  costFor,
  drawUwanose,
  extraRoundsFor,
  freshWallet,
  fuScale,
  fuScaleKey,
  isBankrupt,
  roundPrize,
  uwanoseMean,
} from '../src/ui/machine/economy';
import { type MachineSpec, SPECS } from '../src/ui/machine/specs';
import { mulberry32, simulate, simulateDetail } from './sim';

describe('yan', () => {
  it('コスト', () => {
    expect(costFor(true, true)).toBe(20);
    expect(costFor(true, false)).toBe(40);
    // 不正解・パス・時間切れは BET のまま（追加のペナルティはない。速答の割引もない）
    expect(costFor(false, false)).toBe(40);
    expect(costFor(false, true)).toBe(40);
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
    // 連続正解の倍率は6問連続で最上段（×2）。それ以上は上がらない
    expect(ECONOMY.comboLadder).toEqual([1, 1.1, 1.25, 1.45, 1.7, 2]);
    expect(roundPrize({ ...base, combo: 20 })).toBe(roundPrize({ ...base, combo: ECONOMY.comboLadder.length }));
    expect(roundPrize({ ...base, combo: ECONOMY.comboLadder.length })).toBeGreaterThanOrEqual(Math.floor(v * ECONOMY.comboLadder.at(-1)!));
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

describe('経済バランス（シミュレーション）', () => {
  for (const mode of ['hayami', 'fu', 'jissen'] as Mode[]) {
    // 中級者（正解85%・速答5割）は約150%、上級者（95%・8割）は約350〜420%、初心者（60%・2割）は大きく負ける
    it(`${mode}：中級は約150%、上級は約370%、初心者は大きくマイナス`, () => {
      const mid = (simulate(mode, 0.85, 0.5, 1, 30000) + simulate(mode, 0.85, 0.5, 7, 30000)) / 2;
      expect(mid).toBeGreaterThan(1.3);
      expect(mid).toBeLessThan(1.7);
      const pro = simulate(mode, 0.95, 0.8, 2, 30000);
      expect(pro).toBeGreaterThan(3.0);
      expect(pro).toBeLessThan(4.8);
      expect(simulate(mode, 0.6, 0.2, 3)).toBeLessThan(0.45);
    });
  }
  // 大当りが重い台は1回の試行のばらつきが大きいので、長めにまわして平均をとる
  it('ミドル（符計算・実戦）・MAX（実戦）：中級は約150%、上級は約370%', () => {
    for (const id of ['middle', 'max'] as const) for (const mode of SPECS[id].modes) {
      const mid = [11, 21, 31].map((sd) => simulate(mode, 0.85, 0.5, sd, 100000, SPECS[id])).reduce((a, b) => a + b) / 3;
      expect(mid).toBeGreaterThan(1.3);
      expect(mid).toBeLessThan(1.8);
      const pro = simulate(mode, 0.95, 0.8, 12, 100000, SPECS[id]);
      expect(pro).toBeGreaterThan(3.0);
      expect(pro).toBeLessThan(4.8);
    }
  }, 240000);
  it('1問あたりの稼ぎは 甘デジ < ミドル < MAX（ミドルはどの種目でも間に入る）', () => {
    const net = (mode: Mode, id: 'ama' | 'middle' | 'max', acc: number, fast: number) => {
      // 重い台はばらつきが大きいので、3つの種で平均する
      const ds = [11, 21, 31].map((sd) => simulateDetail(mode, acc, fast, sd, 100000, SPECS[id]));
      return ds.reduce((a, d) => a + d.won - d.spent, 0) / ds.reduce((a, d) => a + d.questions, 0);
    };
    for (const [acc, fast] of [[0.85, 0.5], [0.95, 0.8]] as const)
      for (const mode of SPECS.middle.modes) {
        const mid = net(mode, 'middle', acc, fast);
        expect(mid).toBeGreaterThan(net(mode, 'ama', acc, fast));
        expect(mid).toBeLessThan(net('jissen', 'max', acc, fast));
      }
  }, 480000);
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
