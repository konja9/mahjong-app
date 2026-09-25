import { describe, expect, it } from 'vitest';
import { fastWindows, helpHtml } from '../src/ui/help';
import { introHtml } from '../src/ui/intro';
import { ECONOMY } from '../src/ui/machine/economy';
import { NORMAL_ODDS, RUSH_ODDS } from '../src/ui/machine/machine';
import { Tips } from '../src/ui/tips';

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
  it('ルールの数値は ECONOMY と台の定数から作る', () => {
    const html = helpHtml('rules', 'jissen');
    expect(html).toContain(`1/${NORMAL_ODDS}`);
    expect(html).toContain(`1/${RUSH_ODDS}`);
    expect(html).toContain(`${ECONOMY.initial.toLocaleString()} yan`);
    expect(fastWindows()).toBe(
      `早見 ${ECONOMY.fastSeconds.hayami}秒・符計算 ${ECONOMY.fastSeconds.fu}秒・実戦 ${ECONOMY.fastSeconds.jissen}秒`,
    );
  });

  it('導入は3ステップで、最後にプラクティスへの導線がある', () => {
    expect(introHtml(0)).toContain('data-intro="next"');
    expect(introHtml(2)).toContain('data-intro="practice"');
    expect(introHtml(2)).toContain('data-intro="start"');
  });
});
