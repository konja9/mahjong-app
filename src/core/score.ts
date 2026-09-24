import type { Rules } from './rules';

export type LimitName = '' | '満貫' | '跳満' | '倍満' | '三倍満' | '数え役満' | '役満' | 'ダブル役満' | 'トリプル役満';

export interface Payment {
  /** ロン時の支払い */
  ron: number;
  /** 子のツモ：子の支払い */
  fromChild: number;
  /** 子のツモ：親の支払い／親のツモ：各自の支払い */
  fromDealer: number;
  total: number;
}

export interface ScoreResult {
  han: number;
  fu: number;
  base: number;
  limit: LimitName;
  dealer: boolean;
  tsumo: boolean;
  payment: Payment;
}

const ceil100 = (n: number) => Math.ceil(n / 100) * 100;

/** 基本点と満貫以上の名称を求める */
export function basePoints(han: number, fu: number, rules: Rules, yakuman = 0): { base: number; limit: LimitName } {
  if (yakuman > 0) {
    const names: LimitName[] = ['役満', 'ダブル役満', 'トリプル役満'];
    return { base: 8000 * yakuman, limit: names[Math.min(yakuman, 3) - 1] };
  }
  if (han >= 13) {
    return rules.kazoe ? { base: 8000, limit: '数え役満' } : { base: 6000, limit: '三倍満' };
  }
  if (han >= 11) return { base: 6000, limit: '三倍満' };
  if (han >= 8) return { base: 4000, limit: '倍満' };
  if (han >= 6) return { base: 3000, limit: '跳満' };
  if (han >= 5) return { base: 2000, limit: '満貫' };
  const base = fu * 2 ** (han + 2);
  if (base >= 2000) return { base: 2000, limit: '満貫' };
  if (rules.kiriage && base >= 1920) return { base: 2000, limit: '満貫' };
  return { base, limit: '' };
}

export function calcScore(
  han: number,
  fu: number,
  dealer: boolean,
  tsumo: boolean,
  rules: Rules,
  yakuman = 0,
): ScoreResult {
  const { base, limit } = basePoints(han, fu, rules, yakuman);
  let payment: Payment;
  if (!tsumo) {
    const ron = ceil100(base * (dealer ? 6 : 4));
    payment = { ron, fromChild: 0, fromDealer: 0, total: ron };
  } else if (dealer) {
    const each = ceil100(base * 2);
    payment = { ron: 0, fromChild: each, fromDealer: each, total: each * 3 };
  } else {
    const c = ceil100(base);
    const d = ceil100(base * 2);
    payment = { ron: 0, fromChild: c, fromDealer: d, total: c * 2 + d };
  }
  return { han, fu, base, limit, dealer, tsumo, payment };
}

/** 正解の表記（ロン: "7700" / 子ツモ: "2000-3900" / 親ツモ: "3900オール"） */
export function formatAnswer(r: ScoreResult): string {
  if (!r.tsumo) return String(r.payment.ron);
  if (r.dealer) return `${r.payment.fromDealer}オール`;
  return `${r.payment.fromChild}-${r.payment.fromDealer}`;
}

/** 入力が正解か。子ツモは「子-親」の順。親ツモは1つの数値 */
export function checkPointsAnswer(input: string, r: ScoreResult): boolean {
  const nums = (input.match(/\d+/g) ?? []).map(Number);
  if (!r.tsumo) return nums.length === 1 && nums[0] === r.payment.ron;
  if (r.dealer) return nums.length === 1 && nums[0] === r.payment.fromDealer;
  return nums.length === 2 && nums[0] === r.payment.fromChild && nums[1] === r.payment.fromDealer;
}

/** 早見モードで出題しうる翻・符の組み合わせか */
export function isValidHanFu(han: number, fu: number, tsumo: boolean): boolean {
  if (han >= 5) return true;
  if (fu === 20) return tsumo && han >= 2;
  if (fu === 25) return han >= (tsumo ? 3 : 2);
  if (han === 1 && fu > 110) return false;
  return fu >= 30 && fu <= 110 && fu % 10 === 0;
}
