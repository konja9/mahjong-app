import { describe, expect, it } from 'vitest';
import { decompose } from '../src/core/decompose';
import { FU_BUCKETS, MAX_FU, feasibleBuckets, generateHandQuestion, generateHayami, matchesConstraints } from '../src/core/generator';
import { allTiles, isMenzen } from '../src/core/hand';
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

describe('超大当りの BONUS', () => {
  it('実戦で役満が約3割・すべて正しい和了形', () => {
    const rng = mulberry32(99);
    let yakuman = 0;
    for (let i = 0; i < 1000; i++) {
      const q = generateHandQuestion({ mode: 'jissen', rules: DEFAULT_RULES, filters: anyFilter, rng, premium: true });
      expect(decompose(q.hand, q.sit.tsumo).length).toBeGreaterThan(0);
      const counts = toCounts([...allTiles(q.hand), ...q.sit.doraIndicators, ...q.sit.uraIndicators]);
      expect(Math.max(...counts)).toBeLessThanOrEqual(4);
      if (q.ev.yakuman) yakuman++;
    }
    expect(yakuman).toBeGreaterThan(250);
    expect(yakuman).toBeLessThan(380);
  });
  it('早見で13翻が約3割', () => {
    const rng = mulberry32(5);
    let big = 0;
    for (let i = 0; i < 1000; i++) if (generateHayami(DEFAULT_RULES, anyFilter, rng, true).han === 13) big++;
    expect(big).toBeGreaterThan(250);
    expect(big).toBeLessThan(380);
  });
});

describe('70符以上は出題しない', () => {
  it('早見', () => {
    const rng = mulberry32(21);
    for (let i = 0; i < 2000; i++) expect(generateHayami(DEFAULT_RULES, anyFilter, rng).fu).toBeLessThanOrEqual(MAX_FU);
  });
  for (const mode of ['fu', 'jissen'] as const) {
    it(`${mode}（通常・超大当り・稽古の均等）`, () => {
      const rng = mulberry32(mode.length + 22);
      for (let i = 0; i < 2000; i++) {
        const premium = i % 4 === 0;
        const constraints = i % 3 === 0 ? ({ call: 'any', shape: 'any', dist: 'even' } as const) : undefined;
        const q = generateHandQuestion({ mode, rules: DEFAULT_RULES, filters: anyFilter, rng, premium, constraints });
        if (!q.ev.yakuman) expect(q.ev.fu.fu).toBeLessThanOrEqual(MAX_FU);
      }
    });
  }
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

describe('通常時の分布', () => {
  it('実戦：満貫以上は半分未満、役満は4%未満', () => {
    const rng = mulberry32(21);
    let limit = 0;
    let yakuman = 0;
    const n = 1000;
    for (let i = 0; i < n; i++) {
      const q = generateHandQuestion({ mode: 'jissen', rules: DEFAULT_RULES, filters: anyFilter, rng });
      if (q.ev.score.limit) limit++;
      if (q.ev.yakuman) yakuman++;
    }
    expect(limit / n).toBeLessThan(0.5);
    expect(yakuman / n).toBeLessThan(0.04);
  });
  it('早見：13翻は1%程度', () => {
    const rng = mulberry32(22);
    let big = 0;
    for (let i = 0; i < 2000; i++) if (generateHayami(DEFAULT_RULES, anyFilter, rng).han === 13) big++;
    expect(big / 2000).toBeLessThan(0.03);
  });
});

describe('稽古の絞り込み', () => {
  const shapes = ['any', 'chiitoi', 'pinfu', 'kuipinfu', 'kantsu', 'tanki', 'shanpon'] as const;
  for (const mode of ['fu', 'jissen'] as const) {
    for (const shape of shapes) {
      it(`${mode}: ${shape} の手だけを出す`, () => {
        const rng = mulberry32(shape.length * 31 + (mode === 'fu' ? 1 : 2));
        const c = { call: 'any', shape, dist: 'real' } as const;
        for (let i = 0; i < 100; i++) {
          const q = generateHandQuestion({ mode, rules: DEFAULT_RULES, filters: anyFilter, rng, constraints: c });
          expect(matchesConstraints(q, c)).toBe(true);
          expect(decompose(q.hand, q.sit.tsumo).length).toBeGreaterThan(0);
        }
      });
    }
  }
  it('門前・副露を守る', () => {
    const rng = mulberry32(77);
    for (const call of ['menzen', 'open'] as const) {
      for (let i = 0; i < 100; i++) {
        const q = generateHandQuestion({ mode: 'fu', rules: DEFAULT_RULES, filters: anyFilter, rng, constraints: { call, shape: 'any', dist: 'real' } });
        expect(isMenzen(q.hand)).toBe(call === 'menzen');
      }
    }
  });
  it('均等：符の区分ごとにおおむね同じ数を出す', () => {
    const rng = mulberry32(8);
    const n: Record<number, number> = {};
    const N = 700;
    for (let i = 0; i < N; i++) {
      const q = generateHandQuestion({ mode: 'fu', rules: DEFAULT_RULES, filters: anyFilter, rng, constraints: { call: 'any', shape: 'any', dist: 'even' } });
      const b = q.ev.fu.fu;
      n[b] = (n[b] ?? 0) + 1;
    }
    for (const b of FU_BUCKETS) {
      expect(n[b] ?? 0).toBeGreaterThan(N / FU_BUCKETS.length / 2);
    }
  });
  it('均等：形で出せない符は狙わない', () => {
    expect(feasibleBuckets({ call: 'any', shape: 'pinfu', dist: 'even' }, { seat: 'any', win: 'ron' })).toEqual([30]);
    expect(feasibleBuckets({ call: 'open', shape: 'any', dist: 'even' }, anyFilter)).toEqual([30, 40, 50, 60]);
  });
});
