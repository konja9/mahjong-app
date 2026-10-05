import { describe, expect, it } from 'vitest';
import { diagnose, diagnosisText } from '../src/core/diagnose';
import { calcFu } from '../src/core/fu';
import type { HandQuestion } from '../src/core/generator';
import { type Hand, type Situation, defaultSituation, isMenzen } from '../src/core/hand';
import { DEFAULT_RULES } from '../src/core/rules';
import { formatAnswer } from '../src/core/score';
import { evaluate } from '../src/core/evaluate';
import { hand, t } from './helpers';

const R = DEFAULT_RULES;

function question(h: Hand, sit: Partial<Situation>, mode: 'fu' | 'jissen' = 'fu'): HandQuestion {
  const s = defaultSituation(sit);
  const ev = evaluate(h, s, R);
  if (!ev) throw new Error('not a winning hand');
  return { mode, hand: h, sit: s, ev };
}

const fuAnswer = (q: HandQuestion, n: number) => diagnose(q, R, (fu) => fu === n).map((d) => d.slip);

describe('誤答の診断', () => {
  // 嵌張ツモ・999s 暗刻：20+2+8+2 = 32 → 40符
  const kanchanTsumo = question(hand('234m567p13s999s55p', '2s'), { tsumo: true, riichi: true });
  // 平和ロン：30符
  const pinfuRon = question(hand('234m567p345s78s55p', '9s'), { riichi: true });
  // 中ポン・999s 暗刻のロン：20+4+8 = 32 → 40符
  const openAnkou = question(hand('567p999s34s55p', '5s', [{ type: 'pon', tile: t('7z') }]), {});
  // 999s と 11m のシャンポンを 9s でロン・555p 暗刻：20+10+4+4 = 38 → 40符
  const shanponRon = question(hand('234m555p345s99s11m', '9s'), { riichi: true });

  it('前提の符', () => {
    expect([kanchanTsumo, pinfuRon, openAnkou, shanponRon].map((q) => q.ev.fu.fu)).toEqual([40, 30, 40, 40]);
  });

  it('ツモ符の付け忘れ', () => {
    expect(fuAnswer(kanchanTsumo, 30)).toContain('tsumo');
  });
  it('門前加符の付け忘れ', () => {
    expect(fuAnswer(pinfuRon, 20)).toEqual(['menzenRon']);
  });
  it('么九の倍を忘れる', () => {
    expect(fuAnswer(openAnkou, 30)).toContain('yaochu');
  });
  it('ロンの刻子を暗刻で数える', () => {
    expect(fuAnswer(shanponRon, 50)).toEqual(['ronKoutsu']);
  });
  it('切り上げ忘れ（入力モード）', () => {
    expect(fuAnswer(kanchanTsumo, 32)).toEqual(['roundUp']);
  });
  it('平和ツモにツモ符を付ける', () => {
    const q = question(hand('234m567p345s78s55p', '9s'), { tsumo: true, riichi: true });
    expect(q.ev.fu.fu).toBe(20);
    expect(fuAnswer(q, 30)).toEqual(['pinfuTsumo']);
  });
  it('正解と同じ値になるミスや、どのミスとも合わない答えは何も言わない', () => {
    expect(fuAnswer(shanponRon, 40)).toEqual([]);
    expect(fuAnswer(pinfuRon, 110)).toEqual([]);
  });
  it('実戦は点数で照らし合わせる', () => {
    const q = question(hand('234m567p345s78s55p', '9s'), { riichi: true }, 'jissen');
    expect(formatAnswer(q.ev.score)).toBe('2000');
    expect(diagnose(q, R, (_, s) => formatAnswer(s) === '1300').map((d) => d.slip)).toEqual(['menzenRon']);
  });
  it('診断の文', () => {
    const ds = diagnose(shanponRon, R, (fu) => fu === 50);
    expect(diagnosisText(ds)).toBe('その答えは『ロンで完成した刻子を暗刻で数えた』場合の値です');
  });
  it('ミスを指定しない calcFu は正解の符と同じ', () => {
    for (const q of [kanchanTsumo, pinfuRon, openAnkou, shanponRon]) {
      const pinfu = q.ev.yaku.some((y) => y.name === '平和');
      expect(calcFu(q.ev.interp, q.sit, R, isMenzen(q.hand), pinfu).fu).toBe(q.ev.fu.fu);
    }
  });
});
