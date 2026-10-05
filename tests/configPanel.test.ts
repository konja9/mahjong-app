import { describe, expect, it } from 'vitest';
import { configPanelHtml, configSummaryHtml } from '../src/ui/configPanel';
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
const note = (html: string, group: string) => html.split(`data-group="${group}"`)[1]?.match(/<p class="cfg-note">([^<]*)</)?.[1] ?? '';

describe('出題設定のパネル', () => {
  it('パチンコには稽古だけの行（出題・問題数・絞り込み・段階）が出ず、「成績を見る」がある', () => {
    const d = doc(configPanelHtml(view({ mode: 'fu' }, false)));
    expect(sections(d)).toEqual(['答え方', '状況']);
    expect(btn(d, 'answer', 'steps')).toBeNull();
    // 制限時間はなしで固定
    expect(has(d, 'time')).toBe(false);
    expect(has(d, 'count')).toBe(false);
    expect(d).toMatch(/data-summary>成績を見る/);
    expect(d).not.toContain('精算');
  });
  it('稽古の符計算は4つの区分がそろい、制限時間は出ない', () => {
    const d = doc(configPanelHtml(view({ mode: 'fu' }, true)));
    expect(sections(d)).toEqual(['答え方', '出題', '絞り込み', '状況']);
    expect(has(d, 'time')).toBe(false);
    expect(btn(d, 'answer', 'steps')?.disabled).toBe(false);
    expect(d).toContain('data-restart');
  });
  it('形が七対子なら、鳴きは門前に決まり、ほかは押せず理由が出る', () => {
    const d = doc(configPanelHtml(view({ mode: 'fu', keikoFilters: { call: 'open', shape: 'chiitoi', dist: 'real' } }, true)));
    expect(btn(d, 'call', 'menzen')?.on).toBe(true);
    expect(btn(d, 'call', 'open')?.disabled).toBe(true);
    expect(btn(d, 'call', 'any')?.disabled).toBe(true);
    expect(note(d, 'call')).toContain('七対子は門前');
  });
  it('復習が0問なら押せない', () => {
    const d = doc(configPanelHtml(view({ mode: 'jissen' }, true, 0)));
    expect(btn(d, 'source', 'review')?.disabled).toBe(true);
    expect(btn(d, 'source', 'review')?.text).toBe('復習（0問）');
  });
  it('早見は絞り込みが出ず、苦手と段階は押せない', () => {
    const d = doc(configPanelHtml(view({ mode: 'hayami', answerStyle: 'steps' }, true)));
    expect(sections(d)).toEqual(['答え方', '出題', '状況']);
    expect(btn(d, 'source', 'weak')?.disabled).toBe(true);
    expect(btn(d, 'answer', 'steps')?.disabled).toBe(true);
    // 段階が使えないときは選択（4択）として扱う
    expect(btn(d, 'answer', 'choice')?.on).toBe(true);
  });
  it('要約ボタン', () => {
    expect(configSummaryHtml(view({ mode: 'fu', count: 25, keikoFilters: { call: 'any', shape: 'pinfu', dist: 'real' } }, true))).toMatch(/選択.*平和.*25問/);
    expect(configSummaryHtml(view({ mode: 'jissen' }, false))).toMatch(/4択.*出題設定/);
  });
});
