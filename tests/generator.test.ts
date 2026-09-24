import { describe, expect, it } from 'vitest';
import { decompose } from '../src/core/decompose';
import { generateHandQuestion, generateHayami } from '../src/core/generator';
import { allTiles } from '../src/core/hand';
import { DEFAULT_RULES } from '../src/core/rules';
import { isValidHanFu } from '../src/core/score';
import { EAST, toCounts } from '../src/core/tiles';

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const anyFilter = { seat: 'any', win: 'any' } as const;

describe('generateHayami', () => {
  it('常に有効な翻符を出す', () => {
    const rng = mulberry32(1);
    for (let i = 0; i < 2000; i++) {
      const q = generateHayami(DEFAULT_RULES, anyFilter, rng);
      expect(isValidHanFu(q.han, q.fu, q.tsumo)).toBe(true);
    }
  });
  it('フィルタを守る', () => {
    const rng = mulberry32(2);
    for (let i = 0; i < 200; i++) {
      const q = generateHayami(DEFAULT_RULES, { seat: 'dealer', win: 'tsumo' }, rng);
      expect(q.dealer && q.tsumo).toBe(true);
    }
  });
});

describe('generateHandQuestion', () => {
  for (const mode of ['fu', 'jissen'] as const) {
    it(`${mode}: 1000問すべて和了形・役あり・牌が4枚以内`, () => {
      const rng = mulberry32(mode === 'fu' ? 3 : 4);
      for (let i = 0; i < 1000; i++) {
        const q = generateHandQuestion({ mode, rules: DEFAULT_RULES, filters: anyFilter, rng });
        const tiles = allTiles(q.hand);
        const kanCount = q.hand.melds.filter((m) => m.type.endsWith('kan')).length;
        expect(tiles.length).toBe(14 + kanCount);
        const counts = toCounts([...tiles, ...q.sit.doraIndicators, ...q.sit.uraIndicators]);
        expect(Math.max(...counts)).toBeLessThanOrEqual(4);
        expect(decompose(q.hand, q.sit.tsumo).length).toBeGreaterThan(0);
        expect(q.ev.yaku.length).toBeGreaterThan(0);
        expect(q.ev.score.dealer).toBe(q.sit.seatWind === EAST);
      }
    });
  }
});

describe('確変ブースト', () => {
  it('実戦で役満が3割以上出る・すべて正しい和了形', () => {
    const rng = mulberry32(99);
    let yakuman = 0;
    for (let i = 0; i < 1000; i++) {
      const q = generateHandQuestion({ mode: 'jissen', rules: DEFAULT_RULES, filters: anyFilter, rng, boost: true });
      expect(decompose(q.hand, q.sit.tsumo).length).toBeGreaterThan(0);
      const counts = toCounts([...allTiles(q.hand), ...q.sit.doraIndicators, ...q.sit.uraIndicators]);
      expect(Math.max(...counts)).toBeLessThanOrEqual(4);
      if (q.ev.yakuman) yakuman++;
    }
    expect(yakuman).toBeGreaterThan(300);
  });
  it('早見で13翻・11翻が増える', () => {
    const rng = mulberry32(5);
    let big = 0;
    for (let i = 0; i < 1000; i++) if (generateHayami(DEFAULT_RULES, anyFilter, rng, true).han >= 11) big++;
    expect(big).toBeGreaterThan(150);
  });
});

describe('符の分布', () => {
  it('早見：60符以上は8%以下、30符と40符で過半数', () => {
    const rng = mulberry32(11);
    let high = 0;
    let mid = 0;
    let n = 0;
    for (let i = 0; i < 4000; i++) {
      const q = generateHayami(DEFAULT_RULES, anyFilter, rng);
      if (q.han >= 5) continue;
      n++;
      if (q.fu >= 60) high++;
      if (q.fu === 30 || q.fu === 40) mid++;
    }
    expect(high / n).toBeLessThan(0.08);
    expect(mid / n).toBeGreaterThan(0.5);
  });
  for (const mode of ['fu', 'jissen'] as const) {
    it(`${mode}：60符以上は8%以下、30符と40符で過半数`, () => {
      const rng = mulberry32(12);
      let high = 0;
      let mid = 0;
      const n = 2000;
      for (let i = 0; i < n; i++) {
        const q = generateHandQuestion({ mode, rules: DEFAULT_RULES, filters: anyFilter, rng });
        if (q.ev.fu.fu >= 60) high++;
        if (q.ev.fu.fu === 30 || q.ev.fu.fu === 40) mid++;
      }
      expect(high / n).toBeLessThan(0.08);
      expect(mid / n).toBeGreaterThan(0.5);
    });
  }
});

describe('大盤振る舞い', () => {
  it('実戦：満貫以上が6割以上、役満が15%以上', () => {
    const rng = mulberry32(21);
    let limit = 0;
    let yakuman = 0;
    const n = 1000;
    for (let i = 0; i < n; i++) {
      const q = generateHandQuestion({ mode: 'jissen', rules: DEFAULT_RULES, filters: anyFilter, rng, generous: true });
      expect(decompose(q.hand, q.sit.tsumo).length).toBeGreaterThan(0);
      if (q.ev.score.limit) limit++;
      if (q.ev.yakuman) yakuman++;
    }
    expect(limit / n).toBeGreaterThan(0.6);
    expect(yakuman / n).toBeGreaterThan(0.15);
  });
  it('早見：5翻以上が過半数', () => {
    const rng = mulberry32(22);
    let big = 0;
    for (let i = 0; i < 1000; i++) if (generateHayami(DEFAULT_RULES, anyFilter, rng, false, true).han >= 5) big++;
    expect(big).toBeGreaterThan(500);
  });
});
