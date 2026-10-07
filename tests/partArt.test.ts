import { describe, expect, it } from 'vitest';
import { partSvg, slotRowHtml } from '../src/ui/machine/partArt';

const RANKS5 = ['5級', '3級', '1級', '二段', '名人'];
import { PART_ORDER } from '../src/ui/machine/parts';
import { partsHtml } from '../src/ui/shop';

describe('改造パーツの絵', () => {
  it('12個すべてに 64×64 の絵がある', () => {
    for (const id of PART_ORDER) {
      const svg = partSvg(id);
      expect(svg.startsWith('<svg')).toBe(true);
      expect(svg).toContain('viewBox="0 0 64 64"');
      expect(svg.endsWith('</svg>')).toBe(true);
    }
  });
  it('同じ画面に何枚並べても、グラデーションの id がぶつからない', () => {
    const html = [...PART_ORDER, ...PART_ORDER].map((id) => partSvg(id)).join('');
    const ids = [...html.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]);
    expect(new Set(ids).size).toBe(ids.length);
    // 参照している id はすべて定義されている
    for (const m of html.matchAll(/url\(#([^)]+)\)/g)) expect(ids).toContain(m[1]);
  });
  it('名前を渡すと読み上げ用のラベルが付く', () => {
    expect(partSvg('gold', '金の玉')).toContain('aria-label="金の玉"');
    expect(partSvg('gold')).toContain('aria-hidden="true"');
  });
  it('改造の画面：各行に絵の枠。付けている行は光り、まだのパーツは影', () => {
    const html = partsHtml({ state: { owned: ['fast', 'tank'], equip: ['tank'] }, slots: 2, rank: '5級', nextSlotRank: '1級', slotRanks: RANKS5, canChange: true });
    expect(html.match(/class="part-thumb/g)).toHaveLength(PART_ORDER.length);
    expect(html.match(/part-thumb on/g)).toHaveLength(1);
    expect(html.match(/part-thumb unknown/g)).toHaveLength(PART_ORDER.length - 2);
  });
  it('改造の画面：5つの枠のうち、開いていない枠は鍵で、次に開く鍵が光る', () => {
    const html = partsHtml({ state: { owned: ['fast', 'tank'], equip: ['tank'] }, slots: 2, rank: '3級', nextSlotRank: '1級', slotRanks: RANKS5, canChange: true });
    expect(html.match(/class="slot on/g)).toHaveLength(1);
    expect(html.match(/class="slot open/g)).toHaveLength(1);
    expect(html.match(/class="slot locked/g)).toHaveLength(3);
    expect(html.match(/slot locked next/g)).toHaveLength(1);
    expect(html).toContain('あと3つの枠が鍵の中');
  });
  it('枠が0のときは付けられず、5級の昇段試験をすすめる', () => {
    const html = partsHtml({ state: { owned: ['fast'], equip: [] }, slots: 0, rank: '', nextSlotRank: '5級', slotRanks: RANKS5, canChange: true });
    expect(html).not.toContain('data-part-on');
    expect(html).toContain('枠が鍵の中');
    expect(html).toContain('5級の昇段試験に受かると');
    expect(html.match(/class="slot locked/g)).toHaveLength(5);
  });
  it('枠の並び：新しく開いた枠には、外れる鍵の動きを付ける', () => {
    const row = slotRowHtml({ equip: [], slots: 1, ranks: RANKS5, opened: 0, labels: true });
    expect(row).toContain('slot open opened');
    expect(row.match(/<small>/g)).toHaveLength(5);
  });
});
