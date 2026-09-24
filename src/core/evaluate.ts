import { type Hand, type Situation, allTiles, isMenzen } from './hand';
import { type Interpretation, decompose } from './decompose';
import { type FuResult, calcFu } from './fu';
import type { Rules } from './rules';
import { type ScoreResult, calcScore } from './score';
import { EAST, doraFromIndicator } from './tiles';
import { type YakuItem, detectYaku } from './yaku';

export interface Evaluation {
  interp: Interpretation;
  yaku: YakuItem[];
  /** ドラ・赤ドラ・裏ドラ（役ではない） */
  dora: YakuItem[];
  han: number;
  yakuman: number;
  fu: FuResult;
  score: ScoreResult;
}

export function countDora(hand: Hand, sit: Situation, rules: Rules, menzen: boolean): YakuItem[] {
  const tiles = allTiles(hand);
  const count = (indicators: readonly number[]) =>
    indicators.reduce((s, ind) => s + tiles.filter((t) => t === doraFromIndicator(ind)).length, 0);
  const out: YakuItem[] = [];
  const d = count(sit.doraIndicators);
  if (d) out.push({ name: 'ドラ', han: d, yakuman: 0 });
  if (rules.aka && hand.akaTiles.length) out.push({ name: '赤ドラ', han: hand.akaTiles.length, yakuman: 0 });
  if (menzen && (sit.riichi || sit.doubleRiichi)) {
    const u = count(sit.uraIndicators);
    if (u) out.push({ name: '裏ドラ', han: u, yakuman: 0 });
  }
  return out;
}

/** 高点法で最も高い解釈を返す。役がなければ null */
export function evaluate(hand: Hand, sit: Situation, rules: Rules): Evaluation | null {
  const menzen = isMenzen(hand);
  const dealer = sit.seatWind === EAST;
  let best: Evaluation | null = null;
  for (const interp of decompose(hand, sit.tsumo)) {
    const { yaku, pinfu } = detectYaku(interp, hand, sit, rules);
    if (!yaku.length) continue;
    const yakuman = yaku.reduce((s, y) => s + y.yakuman, 0);
    const dora = yakuman ? [] : countDora(hand, sit, rules, menzen);
    const han = yaku.reduce((s, y) => s + y.han, 0) + dora.reduce((s, y) => s + y.han, 0);
    const fu = calcFu(interp, sit, rules, menzen, pinfu);
    const score = calcScore(han, fu.fu, dealer, sit.tsumo, rules, yakuman);
    const ev: Evaluation = { interp, yaku, dora, han, yakuman, fu, score };
    if (!best || isBetter(ev, best)) best = ev;
  }
  return best;
}

function isBetter(a: Evaluation, b: Evaluation): boolean {
  if (a.score.payment.total !== b.score.payment.total) return a.score.payment.total > b.score.payment.total;
  if (a.han !== b.han) return a.han > b.han;
  return a.fu.fu > b.fu.fu;
}
