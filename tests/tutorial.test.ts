import { describe, expect, it } from 'vitest';
import { charaSvg } from '../src/ui/tutorial/chara';
import { CHAPTERS } from '../src/ui/tutorial/script';

describe('チュートリアルの台本', () => {
  it('章は プロローグ → パチンコ → 稽古 → 道具 の順で、どの章にもセリフがある', () => {
    expect(CHAPTERS.map((c) => c.id)).toEqual(['prologue', 'pachinko', 'keiko', 'tools']);
    for (const c of CHAPTERS) expect(c.steps.some((s) => s.kind !== 'do')).toBe(true);
  });
  it('セリフは吹き出しに収まる長さ（90字以内）で、パチふとくんの口調', () => {
    const lines = CHAPTERS.flatMap((c) => c.steps.flatMap((s) => ('text' in s ? [s.text] : [])));
    for (const t of lines) expect(t.length).toBeLessThanOrEqual(90);
    expect(lines[0]).toContain('クケケケ、久しぶりの新顔だな');
  });
  it('光らせる場所は画面にある要素を指す', () => {
    const known = /^(#question|#choices|#machine|#meter|#steps|#mode-tabs|#cfg-toggle|#open-menu|#exp-strip|#answer-tools|\.play-tab)/;
    for (const c of CHAPTERS) for (const s of c.steps) if (s.kind === 'spot') expect(s.target).toMatch(known);
  });
  it('第1章は大当りを待ち、BONUS が終わるまで通しで見せる', () => {
    const p = CHAPTERS.find((c) => c.id === 'pachinko')!.steps;
    expect(p.some((s) => s.kind === 'free' && s.until === 'bonusStart')).toBe(true);
    expect(p.some((s) => s.kind === 'free' && s.until === 'bonusEnd')).toBe(true);
    // BET なしで始め、最後に元へ戻す
    const acts = p.flatMap((s) => (s.kind === 'do' ? [s.action] : []));
    expect(acts.indexOf('freeBet')).toBeLessThan(acts.indexOf('paidBet'));
  });
  it('稽古の章は問題を解かせず、簡易学習と重点学習のタブを押させて紹介する', () => {
    const k = CHAPTERS.find((c) => c.id === 'keiko')!.steps;
    expect(k.some((s) => s.kind === 'spot' && s.next === 'answered')).toBe(false);
    const clicks = k.flatMap((s) => (s.kind === 'spot' && s.next === 'click' ? [s.target] : []));
    expect(clicks).toEqual(['.play-tab[data-play="keiko"]', '#mode-tabs .study-tabs [data-study="quick"]', '#mode-tabs .study-tabs [data-study="focus"]']);
  });
  it('3つの出題の説明では、プレイヤーにタブを押して切り替えてもらい、最後は早見に戻す', () => {
    const clicks = CHAPTERS.find((c) => c.id === 'pachinko')!.steps.flatMap((s) => (s.kind === 'spot' && s.next === 'click' ? [s.target] : []));
    expect(clicks).toEqual(['#mode-tabs [data-mode="fu"]', '#mode-tabs [data-mode="jissen"]', '#mode-tabs [data-mode="hayami"]']);
  });
  it('実戦の説明のあとに、点数表をプレイヤーに開かせ、閉じるまで待つ', () => {
    const p = CHAPTERS.find((c) => c.id === 'pachinko')!.steps;
    const i = p.findIndex((s) => s.kind === 'spot' && s.target === '#answer-tools [data-score-table]');
    expect(i).toBeGreaterThan(0);
    expect((p[i] as { next: string }).next).toBe('scoreTableClosed');
    // 実戦に切り替えたあと、早見に戻す前
    const jissen = p.findIndex((s) => s.kind === 'spot' && s.target === '#mode-tabs [data-mode="jissen"]');
    const back = p.findIndex((s) => s.kind === 'spot' && s.target === '#mode-tabs [data-mode="hayami"]');
    expect(i).toBeGreaterThan(jissen);
    expect(i).toBeLessThan(back);
  });
  it('最初の正解のすぐあとに、経験値の帯を見せる', () => {
    const p = CHAPTERS.find((c) => c.id === 'pachinko')!.steps;
    const exp = p.findIndex((s) => s.kind === 'spot' && s.target === '#exp-strip');
    const first = p.findIndex((s) => s.kind === 'spot' && s.next === 'answered');
    expect(exp).toBeGreaterThan(first);
    expect(exp - first).toBeLessThanOrEqual(3);
  });
  it('パチふとくんの表情は5種類', () => {
    for (const f of ['neutral', 'grin', 'surprise', 'proud', 'sweat'] as const) expect(charaSvg(f)).toContain(`data-face="${f}"`);
  });
});
