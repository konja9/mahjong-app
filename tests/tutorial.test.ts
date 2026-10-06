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
    const known = /^(#question|#choices|#machine|#meter|#steps|#mode-tabs|#cfg-toggle|#open-shop|#exp-strip|#open-story|#open-help|#open-settings|\.play-tab)/;
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
  it('パチふとくんの表情は5種類', () => {
    for (const f of ['neutral', 'grin', 'surprise', 'proud', 'sweat'] as const) expect(charaSvg(f)).toContain(`data-face="${f}"`);
  });
});
