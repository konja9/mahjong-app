import { describe, expect, it } from 'vitest';
import { configPanelHtml, configSummaryHtml, keikoTabsHtml } from '../src/ui/configPanel';
import { DEFAULT_SETTINGS, type Settings } from '../src/ui/settings';

const view = (patch: Partial<Settings>, keiko: boolean, reviewCount = 3) => ({
  s: { ...DEFAULT_SETTINGS, ...patch, keikoFilters: { ...DEFAULT_SETTINGS.keikoFilters, ...patch.keikoFilters } },
  keiko,
  reviewCount,
});
/** DOM のないテスト環境なので、HTML の文字列から必要なところを取り出す */
const doc = (html: string) => html;
interface Btn {
  disabled: boolean;
  on: boolean;
  text: string;
}
function btn(html: string, group: string, v: string): Btn | null {
  const m = html.match(new RegExp(`<button type="button" class="cfg( on)?" data-cfg="${group}" data-v="${v}"([^>]*)>([^<]*)</button>`));
  return m ? { on: !!m[1], disabled: m[2].includes(' disabled'), text: m[3] } : null;
}
const sections = (html: string) => [...html.matchAll(/<section class="cfg-sec"><h3>([^<]+)<\/h3>/g)].map((m) => m[1]);
const has = (html: string, group: string) => html.includes(`data-group="${group}"`);

describe('出題設定のパネル', () => {
  it('パチンコには稽古だけの行（問題数・鳴き）が出ない。「成績を見る」はメニューへ移した', () => {
    const d = doc(configPanelHtml(view({ mode: 'fu' }, false)));
    expect(sections(d)).toEqual(['答え方', '状況']);
    expect(btn(d, 'answer', 'steps')).toBeNull();
    // 制限時間はなしで固定
    expect(has(d, 'time')).toBe(false);
    expect(has(d, 'count')).toBe(false);
    expect(d).not.toContain('data-summary');
    expect(d).not.toContain('精算');
  });
  it('稽古のパネルは回答・問題数・鳴き・親子・和了だけ（形・分布・段階・出題・制限時間はない）', () => {
    const d = doc(configPanelHtml(view({ mode: 'fu' }, true)));
    expect(sections(d)).toEqual(['答え方', '出題', '状況']);
    for (const g of ['answer', 'count', 'call', 'seat', 'win']) expect(has(d, g)).toBe(true);
    for (const g of ['time', 'shape', 'dist', 'source', 'mode']) expect(has(d, g)).toBe(false);
    expect(btn(d, 'answer', 'steps')).toBeNull();
    expect(d).toContain('data-restart');
  });
  it('稽古の上部の切り替え：1段目は学習モード、2段目は出題（復習0問なら押せない）', () => {
    const t = keikoTabsHtml(view({ keikoStudy: 'quick', keikoSource: 'normal' }, true, 0));
    const [row1, row2] = t.split('</div>');
    expect(row1).toContain('重点学習');
    expect(row1).toMatch(/class="mode-tab on"[^>]*data-study="quick"/);
    expect(row2).toContain('通常');
    expect(row2).toContain('苦手');
    expect(row2).toMatch(/data-source="review" disabled/);
    expect(row2).not.toContain('選択');
  });
  it('要約ボタン', () => {
    expect(configSummaryHtml(view({ count: 25, keikoFilters: { call: 'menzen' } }, true))).toMatch(/選択.*門前.*25問/);
    expect(configSummaryHtml(view({ mode: 'jissen' }, false))).toMatch(/4択.*出題設定/);
  });
});
