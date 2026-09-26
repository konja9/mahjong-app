import { describe, expect, it } from 'vitest';
import { CONFIRMED_CUTINS } from '../src/ui/effects/performance';
import { MAX_HOLDS, Machine, NORMAL_ODDS, RUSH_ODDS, ST_SPINS, isKakuhenSymbol } from '../src/ui/machine/machine';

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('Machine', () => {
  it('保留は最大4つ', () => {
    const m = new Machine(() => 'max', mulberry32(1));
    expect(m.enter(10)).toBe(MAX_HOLDS);
    expect(m.holds).toHaveLength(MAX_HOLDS);
  });

  it('通常時の当り確率はおよそ 1/8', () => {
    const m = new Machine(() => 'max', mulberry32(2));
    let hits = 0;
    const n = 20000;
    for (let i = 0; i < n; i++) {
      m.rush = false;
      m.enter();
      const r = m.spin()!;
      if (r.hit) hits++;
    }
    expect(hits / n).toBeGreaterThan(1 / NORMAL_ODDS - 0.01);
    expect(hits / n).toBeLessThan(1 / NORMAL_ODDS + 0.01);
  });

  it('確変中はおよそ 1/RUSH_ODDS', () => {
    const m = new Machine(() => 'max', mulberry32(3));
    let hits = 0;
    const n = 10000;
    for (let i = 0; i < n; i++) {
      m.rush = true;
      m.holds = [];
      m.enter();
      if (m.spin()!.hit) hits++;
    }
    expect(hits / n).toBeGreaterThan(1 / RUSH_ODDS - 0.03);
    expect(hits / n).toBeLessThan(1 / RUSH_ODDS + 0.03);
  });

  it('ハズレでは確定演出・虹保留が出ず、図柄もそろわない', () => {
    const m = new Machine(() => 'max', mulberry32(4));
    for (let i = 0; i < 5000; i++) {
      m.enter();
      const r = m.spin()!;
      if (!r.hit) {
        expect(CONFIRMED_CUTINS).not.toContain(r.plan.cutin);
        expect(r.plan.push).not.toBe('gold');
        expect(r.color).toBeLessThan(4);
        expect(new Set(r.symbols).size).toBeGreaterThan(1);
      } else {
        expect(r.reach).toBe(true);
        expect(new Set(r.symbols).size).toBe(1);
        expect(isKakuhenSymbol(r.symbols[0])).toBe(r.kakuhen);
      }
      m.settle(r);
    }
  });

  it('確変は ST 回転を使い切ると終わる', () => {
    const m = new Machine(() => 'max', () => 0.99); // 常にハズレ
    m.rush = true;
    m.stLeft = ST_SPINS;
    let ended = false;
    for (let i = 0; i < ST_SPINS; i++) {
      m.enter();
      ended = m.settle(m.spin()!).rushEnd;
    }
    expect(ended).toBe(true);
    expect(m.rush).toBe(false);
  });

  it('RUSH 中の不正解は ST を1回転消費し、0 で終わる。RUSH 外では何もしない', () => {
    const m = new Machine(() => 'max', () => 0.99);
    expect(m.missSpin()).toBe(false);
    expect(m.stLeft).toBe(0);
    m.rush = true;
    m.stLeft = 2;
    expect(m.missSpin()).toBe(false);
    expect(m.stLeft).toBe(1);
    expect(m.missSpin()).toBe(true);
    expect(m.rush).toBe(false);
    expect(m.data.rushChain).toBe(0);
  });

  it('確変図柄の当りで確変に入る', () => {
    const m = new Machine(() => 'max', mulberry32(9));
    for (let i = 0; i < 2000 && !m.rush; i++) {
      m.enter();
      m.settle(m.spin()!);
    }
    expect(m.rush).toBe(true);
    expect(m.stLeft).toBe(ST_SPINS);
    expect(m.data.rushEntries).toBe(1);
  });

  it('forceNextHit で次の入賞だけが確変大当りになる', () => {
    const m = new Machine(() => 'max', () => 0.99);
    m.forceNextHit();
    expect(m.forcePending).toBe(true);
    m.enter(2);
    expect(m.forcePending).toBe(false);
    expect(m.holds[0]).toMatchObject({ hit: true, kakuhen: true });
    expect(m.holds[1].hit).toBe(false);
    const r = m.spin()!;
    expect(r.hit).toBe(true);
    expect(r.symbols[0]).toBe(r.symbols[2]);
    expect(isKakuhenSymbol(r.symbols[0])).toBe(true);
  });

  it('reset で forceNextHit は取り消される', () => {
    const m = new Machine(() => 'max', () => 0.99);
    m.forceNextHit();
    m.reset();
    m.enter();
    expect(m.holds[0].hit).toBe(false);
  });
});
