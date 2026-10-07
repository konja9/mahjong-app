import { describe, expect, it } from 'vitest';
import { DEFAULT_RULES } from '../src/core/rules';
import { helpHtml } from '../src/ui/help';
import { limitTableHtml, scoreGridHtml, scoreTableHtml } from '../src/ui/scoreTable';

/** 表の「符」の行の、翻の列のマスの文字 */
function cellText(html: string, fu: number, han: number): string {
  const row = html.match(new RegExp(`<tr><th>${fu}符</th>(.*?)</tr>`))![1];
  const cells = [...row.matchAll(/<td[^>]*>(.*?)<\/td>/g)].map((m) => m[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
  return cells[han - 1];
}

describe('点数表', () => {
  const child = scoreGridHtml(false, DEFAULT_RULES);
  const dealer = scoreGridHtml(true, DEFAULT_RULES);
  it('子：ロンとツモ（子-親）。ありえない組み合わせは —', () => {
    expect(cellText(child, 30, 1)).toBe('1,000 300-500');
    expect(cellText(child, 30, 3)).toBe('3,900 1,000-2,000');
    expect(cellText(child, 20, 1)).toBe('— —');
    expect(cellText(child, 20, 2)).toBe('— 400-700');
    expect(cellText(child, 25, 2)).toBe('1,600 —');
    expect(cellText(child, 40, 4)).toBe('満貫');
  });
  it('親：ロンとツモ（オール）', () => {
    expect(cellText(dealer, 30, 2)).toBe('2,900 1,000∀');
    expect(cellText(dealer, 40, 3)).toBe('7,700 2,600∀');
  });
  it('満貫以上', () => {
    const t = limitTableHtml(DEFAULT_RULES);
    expect(t).toContain('<b>8,000</b>');
    expect(t).toContain('<b>12,000</b>');
    expect(t).toContain('<b>48,000</b>');
  });
  it('子・親の切り替えと、遊び方の「点数」タブ', () => {
    expect(scoreTableHtml(DEFAULT_RULES, true)).toContain('data-show="dealer"');
    const h = helpHtml('score', 'jissen');
    for (const id of ['score-flow', 'score-table', 'score-tips']) expect(h).toContain(`id="h-${id}"`);
  });
});
