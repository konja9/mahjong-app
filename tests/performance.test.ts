import { describe, expect, it } from 'vitest';
import { CONFIRMED_CUTINS, drawCharaNotice, drawHoldDisguise, drawNotice, drawSuspense } from '../src/ui/effects/performance';

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('drawSuspense', () => {
  const rng = mulberry32(42);
  const cases: { lamp: number; highValue: boolean; kakuhen: boolean; level: 'lite' | 'max' }[] = [];
  for (const lamp of [0, 1, 2, 3, 4])
    for (const highValue of [false, true])
      for (const kakuhen of [false, true])
        for (const level of ['lite', 'max'] as const) cases.push({ lamp, highValue, kakuhen, level });

  it('不正解では確定演出（キリン柄・虹・金PUSH）が出ない', () => {
    for (const c of cases) {
      for (let i = 0; i < 300; i++) {
        const s = drawSuspense({ ...c, correct: false, streak: i % 12 }, rng);
        expect(CONFIRMED_CUTINS).not.toContain(s.cutin);
        expect(s.push).not.toBe('gold');
        expect(s.hit).toBe(false);
      }
    }
  });

  it('正解ではリールがそろう', () => {
    for (const c of cases) {
      const s = drawSuspense({ ...c, correct: true, streak: 3 }, rng);
      expect(s.hit).toBe(true);
    }
  });

  it('正解のときは確定演出が出ることがある', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 2000; i++) {
      const s = drawSuspense({ correct: true, lamp: 3, highValue: true, streak: 2, kakuhen: false, level: 'max' }, rng);
      seen.add(s.cutin);
      seen.add(`push:${s.push}`);
    }
    expect(seen).toContain('rainbow');
    expect(seen).toContain('zebra');
    expect(seen).toContain('push:gold');
  });

  it('演出オフでは即判定', () => {
    const s = drawSuspense({ correct: true, lamp: 4, highValue: true, streak: 9, kakuhen: true, level: 'off' }, rng);
    expect(s.kind).toBe('quick');
  });

  it('控えめではリールを使わない', () => {
    for (let i = 0; i < 500; i++) {
      const s = drawSuspense({ correct: i % 2 === 0, lamp: i % 5, highValue: true, streak: i, kakuhen: false, level: 'lite' }, rng);
      expect(s.kind).not.toBe('reel');
    }
  });
});

describe('drawNotice', () => {
  it('オフでは予告なし、控えめでは文字予告のみ', () => {
    const rng = mulberry32(7);
    for (let i = 0; i < 500; i++) {
      expect(drawNotice(4, 10, true, 'off', rng)).toBe('none');
      expect(['none', 'text']).toContain(drawNotice(4, 10, true, 'lite', rng));
    }
  });
});

describe('パチふとくんの演出', () => {
  it('虹の吹き出しは当りのときだけ。オフでは出ない', () => {
    const rng = mulberry32(11);
    const seen = new Set<string>();
    for (let i = 0; i < 4000; i++) {
      const lamp = i % 5;
      const miss = drawCharaNotice(lamp, false, i % 2 === 0, 'max', rng);
      expect(miss).not.toBe('rainbow');
      const hit = drawCharaNotice(lamp, true, false, 'max', rng);
      if (hit) seen.add(hit);
      expect(drawCharaNotice(lamp, true, true, 'off', rng)).toBe(null);
    }
    expect(seen).toContain('rainbow');
    expect(seen).toContain('white');
  });
  it('当りのほうがパチふとくん予告が出やすい', () => {
    const rng = mulberry32(5);
    let hit = 0;
    let miss = 0;
    for (let i = 0; i < 4000; i++) {
      if (drawCharaNotice(1, true, false, 'max', rng)) hit++;
      if (drawCharaNotice(1, false, false, 'max', rng)) miss++;
    }
    expect(hit).toBeGreaterThan(miss * 2);
  });
  it('復活は当りのときだけ。スペシャルリーチと復活は全開のときだけ', () => {
    const rng = mulberry32(3);
    let revive = 0;
    let sp = 0;
    for (let i = 0; i < 3000; i++) {
      const inp = { lamp: i % 5, highValue: false, streak: 0, kakuhen: false };
      const miss = drawSuspense({ ...inp, correct: false, level: 'max' }, rng);
      expect(miss.revive ?? false).toBe(false);
      const hit = drawSuspense({ ...inp, correct: true, level: 'max' }, rng);
      if (hit.revive) revive++;
      if (hit.sp) sp++;
      const lite = drawSuspense({ ...inp, correct: true, level: 'lite' }, rng);
      expect(lite.sp ?? false).toBe(false);
      expect(lite.revive ?? false).toBe(false);
    }
    expect(revive).toBeGreaterThan(0);
    expect(sp).toBeGreaterThan(0);
  });
  it('保留変化は全開・赤以上の保留だけで、見せる色は本当の色より低い', () => {
    const rng = mulberry32(9);
    let changed = 0;
    for (let i = 0; i < 2000; i++) {
      const color = i % 5;
      const shown = drawHoldDisguise(color, 'max', rng);
      if (shown !== null) {
        changed++;
        expect(color).toBeGreaterThanOrEqual(2);
        expect(shown).toBeLessThan(color);
      }
      expect(drawHoldDisguise(color, 'lite', rng)).toBe(null);
    }
    expect(changed).toBeGreaterThan(0);
  });
});
