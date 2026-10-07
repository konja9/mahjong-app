import { describe, expect, it } from 'vitest';
import { fastWindows, helpHtml } from '../src/ui/help';
import { introHtml } from '../src/ui/intro';
import { ECONOMY } from '../src/ui/machine/economy';
import { NORMAL_ODDS, RUSH_ODDS } from '../src/ui/machine/machine';
import { MODE_EXP } from '../src/ui/level';
import { Tips, tipLink, tipText } from '../src/ui/tips';

describe('一言ガイド', () => {
  it('各ガイドは1回だけ', () => {
    const t = new Tips();
    expect(t.first('enter')).toBe(true);
    expect(t.first('enter')).toBe(false);
    expect(t.has('enter')).toBe(true);
  });

  it('リセットしても大当り済みの印は残る', () => {
    const t = new Tips();
    t.first('miss');
    t.first('firstHit');
    t.reset();
    expect(t.has('miss')).toBe(false);
    expect(t.has('firstHit')).toBe(true);
  });
});

describe('遊び方', () => {
  it('数値は ECONOMY と台の定数から作る', () => {
    const rush = helpHtml('machine', 'jissen');
    expect(rush).toContain(`1/${NORMAL_ODDS}`);
    expect(rush).toContain(`1/${RUSH_ODDS}`);
    const money = helpHtml('basic', 'jissen');
    expect(money).toContain(`${ECONOMY.initial.toLocaleString()} yan`);
    expect(fastWindows()).toBe(
      `早見 ${ECONOMY.fastSeconds.hayami}秒・符計算 ${ECONOMY.fastSeconds.fu}秒・実戦 ${ECONOMY.fastSeconds.jissen}秒`,
    );
  });

  it('基本タブにゲームの目的・画面の見方・スマホの操作、台タブにコンボ（電チュー）の説明がある', () => {
    const basic = helpHtml('basic', 'jissen');
    for (const id of ['goal', 'screen', 'flow', 'modes', 'ops', 'bet']) expect(basic).toContain(`id="h-${id}"`);
    expect(basic).toContain('タップ');
    // キーボードの説明は PC 用の囲みに入れる（タッチだけの端末では隠す）
    expect(basic).toMatch(/class="h-pc"[\s\S]*<kbd>Tab<\/kbd>/);
    const html = helpHtml('machine', 'jissen');
    expect(html).toContain(`${ECONOMY.denchu.jissen}連`);
    expect(html).toContain(`${ECONOMY.denchu.hayami}連`);
  });

  it('BONUS タブに階段・上乗せ・ラウンド上乗せの数値がある', () => {
    const html = helpHtml('bonus', 'jissen');
    for (const m of ECONOMY.comboLadder) expect(html).toContain(`×${m}`);
    expect(html).toContain(`+${ECONOMY.extraRounds.max}R`);
  });

  it('成長タブに経験値（種目ごとの量）・昇段試験・改造・物語・成績・交換所がある', () => {
    const html = helpHtml('grow', 'jissen');
    for (const id of ['level', 'exam', 'parts', 'story', 'settle', 'shop', 'games']) expect(html).toContain(`id="h-${id}"`);
    for (const n of Object.values(MODE_EXP)) expect(html).toContain(`<td>${n}</td>`);
  });

  it('すべての Tips に文面があり、「詳しく」の行き先のカードがヘルプにある', () => {
    const ids = ['enter', 'reach', 'jackpot', 'rush', 'miss', 'fast', 'low', 'denchuSoon', 'denchu', 'bonusFu', 'ladder', 'bonusMiss', 'roundUp', 'uwanose', 'rushMiss', 'shop', 'machine', 'levelUp'] as const;
    for (const id of ids) {
      expect(tipText(id, 20).length).toBeGreaterThan(10);
      const link = tipLink(id);
      if (link) expect(helpHtml(link.tab, 'jissen')).toContain(`id="h-${link.card}"`);
    }
  });

  it('導入は3ステップで、最後に稽古への導線がある', () => {
    expect(introHtml(0)).toContain('data-intro="next"');
    expect(introHtml(2)).toContain('data-intro="keiko"');
    expect(introHtml(2)).toContain('data-intro="start"');
  });
});

describe('出題する符の範囲', () => {
  it('ヘルプの「符の数え方」に、70符以上を出題しない説明がある', async () => {
    const { helpHtml } = await import('../src/ui/help');
    const html = helpHtml('fu', 'fu');
    expect(html).toContain('出題する符は20〜60符');
    expect(html).toContain('70符以上は出題しません');
  });
});
