import { afterEach, describe, expect, it } from 'vitest';
import { BASE_MODS, effectiveSpec, setMods } from '../src/ui/machine/mods';
import { MAX_SLOTS, PARTS, PART_ORDER, type PartId, UPGRADE_COST, applyParts, equipPart, loadParts, modsFor, nextSlotRank, partForLevel, partLevel, rewardsFor, saveParts, slotsFor, syncOwned, unequipPart, upgradeCost, upgradePart } from '../src/ui/machine/parts';
import { Machine } from '../src/ui/machine/machine';
import { ballsFor, comboMult, costFor, denchuFor, fastSecondsFor } from '../src/ui/machine/economy';
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

  describe('強化（yan で）', () => {
    it('費用は Lv1→2 が 1,500、Lv2→3 が 4,500。最大段階では強化できない', () => {
      expect(UPGRADE_COST).toEqual([1500, 4500]);
      const s = { owned: ['fast', 'tank', 'uwanose'] as PartId[], equip: [] as PartId[] };
      expect(partLevel(s, 'fast')).toBe(1);
      expect(upgradeCost(s, 'fast')).toBe(1500);
      expect(upgradePart(s, 'fast', 1499)).toBe(0);
      expect(upgradePart(s, 'fast', 1500)).toBe(1500);
      expect(partLevel(s, 'fast')).toBe(2);
      expect(upgradeCost(s, 'fast')).toBe(4500);
      expect(upgradePart(s, 'fast', 99999)).toBe(4500);
      expect(partLevel(s, 'fast')).toBe(3);
      expect(upgradeCost(s, 'fast')).toBe(null);
      expect(upgradePart(s, 'fast', 99999)).toBe(0);
      // 2段階までのパーツ・1段階だけのパーツ
      expect(PARTS.tank.levels).toHaveLength(2);
      expect(upgradePart(s, 'tank', 99999)).toBe(1500);
      expect(upgradePart(s, 'tank', 99999)).toBe(0);
      expect(upgradeCost(s, 'uwanose')).toBe(null);
    });
    it('持っていないパーツは強化できない', () => {
      const s = { owned: ['fast'] as PartId[], equip: [] as PartId[] };
      expect(upgradePart(s, 'gold', 99999)).toBe(0);
    });
    it('段階が上がると効き目が強くなる（速答の締切・ペナルティ・ST・連続ブースター・保留）', () => {
      setMods(modsFor(['fast', 'cushion', 'st', 'combo', 'tank'], { fast: 3, cushion: 3, st: 3, combo: 3, tank: 2 }));
      expect(fastSecondsFor('jissen')).toBe(24);
      expect(fastSecondsFor('hayami')).toBe(8);
      expect(costFor(false, false)).toBe(40);
      expect(effectiveSpec(SPECS.ama).st).toBe(SPECS.ama.st + 3);
      expect(comboMult(5)).toBeCloseTo(2 * 1.3);
      expect(new Machine(() => 'off').enter(10)).toBe(6);
      // 強化なし（Lv1）は今までと同じ
      setMods(modsFor(['fast', 'cushion', 'combo']));
      expect(fastSecondsFor('jissen')).toBe(22);
      expect(costFor(false, false)).toBe(50);
      expect(comboMult(5)).toBeCloseTo(2 * 1.1);
    });
    it('保存データ：強化の段階を読み込む。ないものは Lv1、壊れた値・最大を超える値・持っていないパーツは Lv1 に整える', () => {
      const store: Record<string, string> = {};
      const ls = { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => void (store[k] = v), removeItem: (k: string) => void delete store[k] };
      Object.defineProperty(globalThis, 'localStorage', { value: ls, configurable: true });
      saveParts({ owned: ['fast', 'tank', 'gold'], equip: ['fast'], lv: { fast: 3, tank: 9, gold: -2, premium: 3 } as never });
      const loaded = loadParts(1);
      expect(partLevel(loaded, 'fast')).toBe(3);
      expect(partLevel(loaded, 'tank')).toBe(2);
      expect(partLevel(loaded, 'gold')).toBe(1);
      expect(loaded.lv?.premium).toBeUndefined();
      // 古いデータ（lv なし）
      store['tensu.parts.v1'] = JSON.stringify({ owned: ['fast'], equip: [] });
      expect(partLevel(loadParts(1), 'fast')).toBe(1);
    });
    it('全部の枠を強いパーツで埋めて最大まで強化しても、中級者の回収率の伸びは2.6倍未満（Lv1 のときは 1.6倍未満）', () => {
      const set: PartId[] = ['round', 'gold', 'kakuhen', 'st', 'combo'];
      const max = Object.fromEntries(set.map((id) => [id, PARTS[id].levels.length]));
      for (const mode of ['hayami', 'fu', 'jissen'] as const) {
        setMods(BASE_MODS);
        const base = simulate(mode, 0.85, 0.5, 1, 30000, SPECS.ama);
        setMods(modsFor(set));
        const lv1 = simulate(mode, 0.85, 0.5, 1, 30000, effectiveSpec(SPECS.ama));
        setMods(modsFor(set, max));
        const top = simulate(mode, 0.85, 0.5, 1, 30000, effectiveSpec(SPECS.ama));
        expect(lv1 / base).toBeLessThan(1.6);
        expect(top / base).toBeGreaterThan(lv1 / base);
        expect(top / base).toBeLessThan(2.6);
      }
    });
  });
});
