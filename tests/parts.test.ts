import { afterEach, describe, expect, it } from 'vitest';
import { BASE_MODS, effectiveSpec, setMods } from '../src/ui/machine/mods';
import { MAX_SLOTS, PARTS, PART_ORDER, type PartId, applyParts, equipPart, modsFor, nextSlotRank, partForLevel, rewardsFor, slotsFor, syncOwned, unequipPart } from '../src/ui/machine/parts';
import { Machine } from '../src/ui/machine/machine';
import { ballsFor, costFor, denchuFor, fastSecondsFor } from '../src/ui/machine/economy';
import { SPECS } from '../src/ui/machine/specs';
import { simulate } from './sim';

afterEach(() => setMods(BASE_MODS));

describe('台の改造パーツ', () => {
  it('Lv 2 から決まった順に1つずつ手に入り、なくなったら祝い金', () => {
    expect(partForLevel(1)).toBe(null);
    expect(partForLevel(2)).toBe(PART_ORDER[0]);
    expect(partForLevel(13)).toBe(PART_ORDER[11]);
    expect(partForLevel(14)).toBe(null);
    const s = { owned: [] as PartId[], equip: [] as PartId[] };
    expect(rewardsFor(s, [2, 3])).toEqual({ parts: [PART_ORDER[0], PART_ORDER[1]], cash: 0 });
    expect(rewardsFor(s, [14]).cash).toBeGreaterThan(0);
    expect(rewardsFor(s, [2]).parts).toEqual([]);
  });
  it('前から Lv が高い人にも、その Lv までのパーツを持たせる', () => {
    const s = { owned: [] as PartId[], equip: [] as PartId[] };
    syncOwned(s, 5);
    expect(s.owned).toEqual(PART_ORDER.slice(0, 4));
  });
  it('枠は5つ。最初は0で、5級・3級・1級・二段・名人で1つずつ開く', () => {
    expect(Array.from({ length: 11 }, (_, r) => slotsFor(r))).toEqual([0, 1, 1, 2, 2, 3, 3, 4, 4, 4, 5]);
    expect(slotsFor(10)).toBe(MAX_SLOTS);
    expect([0, 1, 2, 5, 7, 9, 10].map(nextSlotRank)).toEqual([1, 3, 3, 7, 10, 10, null]);
  });
  it('持っていないパーツ・枠を超えるパーツは付けられない', () => {
    const s = { owned: ['fast', 'tank'] as PartId[], equip: [] as PartId[] };
    expect(equipPart(s, 'gold', 2)).toBe(false);
    expect(equipPart(s, 'fast', 1)).toBe(true);
    expect(equipPart(s, 'fast', 2)).toBe(false);
    expect(equipPart(s, 'tank', 1)).toBe(false);
    unequipPart(s, 'fast');
    expect(equipPart(s, 'tank', 1)).toBe(true);
    // 枠が減ったら後ろから外す
    s.equip = ['fast', 'tank'];
    s.owned = ['fast', 'tank'];
    applyParts(s, 1);
    expect(s.equip).toEqual(['fast']);
  });
  it('効き目が台と経済に入る', () => {
    setMods(modsFor(['fast', 'tank', 'cushion', 'denchu', 'st', 'kakuhen', 'gold']));
    expect(fastSecondsFor('jissen')).toBe(22);
    expect(fastSecondsFor('hayami')).toBe(7);
    expect(costFor(false, false)).toBe(50);
    expect(denchuFor('jissen')).toBe(3);
    expect(ballsFor('jissen', 3)).toBe(2);
    const sp = effectiveSpec(SPECS.ama);
    expect(sp.st).toBe(SPECS.ama.st + 1);
    expect(sp.kakuhenRate).toBeCloseTo(SPECS.ama.kakuhenRate + 0.05);
    expect(sp.odds).toBeLessThan(SPECS.ama.odds);
    const m = new Machine(() => 'off');
    expect(m.enter(10)).toBe(5);
  });
  it('すべてのパーツに名前・効果・一言がある', () => {
    for (const id of PART_ORDER) {
      const p = PARTS[id];
      expect(p.name && p.desc && p.flavor).toBeTruthy();
    }
  });
  it('全部の枠を強いパーツで埋めても、中級者の回収率の伸びは +60% 未満', () => {
    for (const mode of ['hayami', 'fu', 'jissen'] as const) {
      setMods(BASE_MODS);
      const base = simulate(mode, 0.85, 0.5, 1, 30000, SPECS.ama);
      setMods(modsFor(['round', 'gold', 'kakuhen', 'st', 'combo']));
      const full = simulate(mode, 0.85, 0.5, 1, 30000, effectiveSpec(SPECS.ama));
      expect(full / base).toBeGreaterThan(1.05);
      expect(full / base).toBeLessThan(1.6);
    }
  });
});
