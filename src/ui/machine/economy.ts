/** ノーマルモードの通貨 yan。パラメータはここに集約する */
import type { Mode } from '../../core/generator';
import type { LimitName } from '../../core/score';
import { load, save } from '../storage';

export const ECONOMY = {
  /** 初期所持 */
  initial: 1000,
  /** 1問のコスト */
  cost: 40,
  /** 速答で正解したときのコスト */
  fastCost: 20,
  /** 速答（半額）の締切（秒）。モードの難しさに合わせる */
  fastSeconds: { hayami: 6, fu: 12, jissen: 20 } as Record<Mode, number>,
  /** 不正解・パス・時間切れの追加ペナルティ */
  missPenalty: 80,
  /** 大当り 1 回のラウンド数（ラウンド問題の数） */
  rounds: 6,
  /** ラウンド問題の賞金表（打点別） */
  paytable: {
    under: 5,
    満貫: 20,
    跳満: 30,
    倍満: 50,
    三倍満: 80,
    役満: 300,
  },
  /** 親の手は 1.5 倍 */
  dealerMult: 1.5,
  /** 速答なら 1.2 倍 */
  fastMult: 1.2,
  /** ラウンド内の連続正解ごとに +0.1 倍（最大 1.5 倍） */
  comboStep: 0.1,
  comboMax: 1.5,
  /** PREMIUM（赤5筒）大当りのラウンドは 2 倍 */
  premiumMult: 2,
  /**
   * モード別の賞金補正。出題される手の打点分布がモードで違うため、
   * 正解率85%・速答5割のプレイヤーの回収率がどのモードでもほぼ100%になるよう
   * tests/economy.test.ts のシミュレーションで決めた値
   */
  modeScale: { hayami: 1.05, fu: 6.4, jissen: 1.12 } as Record<Mode, number>,
  /** ハイローラー：コスト 2 倍・ラウンド賞金 2.5 倍 */
  highRoller: { costMult: 2, prizeMult: 2.5 },
  /** 残りがこれ未満で警告表示 */
  lowWarn: 200,
};

export function costFor(correct: boolean, fast: boolean, highRoller = false): number {
  const base = !correct ? ECONOMY.cost + ECONOMY.missPenalty : fast ? ECONOMY.fastCost : ECONOMY.cost;
  return highRoller ? base * ECONOMY.highRoller.costMult : base;
}

export interface RoundPrizeInput {
  mode: Mode;
  limit: LimitName;
  dealer: boolean;
  fast: boolean;
  /** このラウンド内での連続正解数（今回を含む） */
  combo: number;
  premium: boolean;
  highRoller: boolean;
}

export function paytableKey(limit: LimitName): keyof typeof ECONOMY.paytable {
  if (limit === '' ) return 'under';
  if (limit === '数え役満' || limit === 'ダブル役満' || limit === 'トリプル役満') return '役満';
  return limit;
}

/** ラウンド問題の賞金 */
export function roundPrize(p: RoundPrizeInput): number {
  let v = ECONOMY.paytable[paytableKey(p.limit)] * ECONOMY.modeScale[p.mode];
  if (p.dealer) v *= ECONOMY.dealerMult;
  if (p.fast) v *= ECONOMY.fastMult;
  v *= Math.min(ECONOMY.comboMax, 1 + ECONOMY.comboStep * Math.max(0, p.combo - 1));
  if (p.premium) v *= ECONOMY.premiumMult;
  if (p.highRoller) v *= ECONOMY.highRoller.prizeMult;
  return Math.round(v / 5) * 5;
}

export interface Wallet {
  balance: number;
  /** スランプグラフ用の所持金の推移（直近のみ） */
  history: number[];
  bankrupts: number;
}

const KEY = 'tensu.wallet.v1';
const HISTORY_MAX = 120;

export const freshWallet = (bankrupts = 0): Wallet => ({
  balance: ECONOMY.initial,
  history: [ECONOMY.initial],
  bankrupts,
});

export function loadWallet(): Wallet {
  const w = load<Wallet>(KEY, freshWallet());
  if (!Number.isFinite(w.balance) || !Array.isArray(w.history)) return freshWallet();
  return w;
}

export function saveWallet(w: Wallet): void {
  save(KEY, w);
}

/** 所持金を増減し、推移を記録する */
export function applyDelta(w: Wallet, delta: number): Wallet {
  const balance = w.balance + delta;
  const history = [...w.history, balance].slice(-HISTORY_MAX);
  return { ...w, balance, history };
}

export const isBankrupt = (w: Wallet): boolean => w.balance <= 0;

/** BONUS 中に出す賞金表の1マス */
export interface PaytableRow {
  key: keyof typeof ECONOMY.paytable;
  label: string;
  prize: number;
}

const PAYTABLE_LABELS: [keyof typeof ECONOMY.paytable, LimitName, string][] = [
  ['under', '', '未満'],
  ['満貫', '満貫', '満貫'],
  ['跳満', '跳満', '跳満'],
  ['倍満', '倍満', '倍満'],
  ['三倍満', '三倍満', '三倍'],
  ['役満', '役満', '役満'],
];

/** 賞金表：子・速答なし・連続1問目の賞金（PREMIUM とハイローラーは込み） */
export function paytableRows(mode: Mode, premium: boolean, highRoller: boolean): PaytableRow[] {
  return PAYTABLE_LABELS.map(([key, limit, label]) => ({
    key,
    label,
    prize: roundPrize({ mode, limit, dealer: false, fast: false, combo: 1, premium, highRoller }),
  }));
}

/** 次に正解したときの連続正解の倍率（combo はここまでの連続正解数） */
export function comboMult(combo: number): number {
  return Math.min(ECONOMY.comboMax, 1 + ECONOMY.comboStep * Math.max(0, combo));
}
