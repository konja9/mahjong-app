import { type Evaluation, evaluateAll } from './evaluate';
import { type Slip, calcFu } from './fu';
import type { HandQuestion } from './generator';
import { isMenzen } from './hand';
import type { Rules } from './rules';
import { type ScoreResult, calcScore } from './score';
import { EAST } from './tiles';

/** 点数を出す手順の要素（稽古の段階・要素別の正答率・苦手ドリルに使う） */
export type FuElement = 'base' | 'mentsu' | 'pair' | 'wait' | 'fu' | 'han' | 'score';

export const ELEMENT_NAMES: Record<FuElement, string> = {
  base: '基本符・アガり方',
  mentsu: '面子の符',
  pair: '雀頭の符',
  wait: '待ちの符',
  fu: '符を確定',
  han: '翻を数える',
  score: '点数',
};

export interface Diagnosis {
  /** 'alt' は高点法で低い方の分け方を選んだ */
  slip: Slip | 'alt';
  /** 「その答えは『…』場合の値です」に入る言葉 */
  label: string;
  element: FuElement;
}

const SLIPS: readonly { slip: Slip; label: string; element: FuElement }[] = [
  { slip: 'tsumo', label: 'ツモ符を付け忘れた', element: 'base' },
  { slip: 'pinfuTsumo', label: '平和ツモにツモ符を付けた', element: 'base' },
  { slip: 'menzenRon', label: '門前ロンの10符を付け忘れた', element: 'base' },
  { slip: 'yaochu', label: '么九牌の刻子を2倍にし忘れた', element: 'mentsu' },
  { slip: 'ronKoutsu', label: 'ロンで完成した刻子を暗刻で数えた', element: 'mentsu' },
  { slip: 'wait', label: '待ちの2符を付け忘れた', element: 'wait' },
  { slip: 'kuiPinfu', label: '喰い平和形を30符にしなかった', element: 'fu' },
  { slip: 'roundUp', label: '切り上げを忘れた', element: 'fu' },
];

/** 符と点数のどちらが答えと一致するか（符計算は符、実戦は点数で照らし合わせる） */
export type AnswerMatcher = (fu: number, score: ScoreResult) => boolean;

/**
 * 不正解の答えが、どの典型ミスをしたときの値と一致するかを調べる。
 * 正解と同じ値になるミスは除く。一致がなければ空配列（何も伝えない）
 */
export function diagnose(q: HandQuestion, rules: Rules, matches: AnswerMatcher): Diagnosis[] {
  const { ev, hand, sit } = q;
  if (ev.yakuman || ev.interp.form !== 'standard') return [];
  const menzen = isMenzen(hand);
  const pinfu = ev.yaku.some((y) => y.name === '平和');
  const dealer = sit.seatWind === EAST;
  const scoreFor = (e: Evaluation, fu: number) => calcScore(e.han, fu, dealer, sit.tsumo, rules, e.yakuman);
  const sameAsCorrect = (fu: number, score: ScoreResult) =>
    q.mode === 'fu' ? fu === ev.fu.fu : score.payment.total === ev.score.payment.total;

  const out: Diagnosis[] = [];
  for (const s of SLIPS) {
    const fu = calcFu(ev.interp, sit, rules, menzen, pinfu, s.slip).fu;
    if (fu === ev.fu.fu) continue;
    const score = scoreFor(ev, fu);
    if (sameAsCorrect(fu, score) || !matches(fu, score)) continue;
    out.push({ slip: s.slip, label: s.label, element: s.element });
  }
  // 別の分け方（高点法で採らなかった方）
  const alt = evaluateAll(hand, sit, rules)
    .slice(1)
    .some((e) => !e.yakuman && !sameAsCorrect(e.fu.fu, e.score) && matches(e.fu.fu, e.score));
  if (alt) out.push({ slip: 'alt', label: '点数が低くなる分け方で数えた（高点法では高い方を採る）', element: 'wait' });
  return out;
}

/** 診断の1行（「その答えは『A』または『B』場合の値です」） */
export function diagnosisText(ds: Diagnosis[]): string {
  if (!ds.length) return '';
  return `その答えは${ds.map((d) => `『${d.label}』`).join('または')}場合の値です`;
}
