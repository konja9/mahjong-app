import { describe, expect, it } from 'vitest';
import { partSvg } from '../src/ui/machine/partArt';
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
    const html = partsHtml({ state: { owned: ['fast', 'tank'], equip: ['tank'] }, slots: 2, rank: '5級', nextSlotRank: '3級', canChange: true });
    expect(html.match(/class="part-thumb/g)).toHaveLength(PART_ORDER.length);
    expect(html.match(/part-thumb on/g)).toHaveLength(1);
    expect(html.match(/part-thumb unknown/g)).toHaveLength(PART_ORDER.length - 2);
  });
});
