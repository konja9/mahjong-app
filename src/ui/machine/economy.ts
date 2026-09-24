/** ノーマルモードの通貨 yan。パラメータはここに集約する */
import { load, save } from '../storage';

export const ECONOMY = {
  /** 初期所持 */
  initial: 1000,
  /** 1問のコスト */
  cost: 40,
  /** 速答（fastSeconds 以内）で正解したときのコスト */
  fastCost: 20,
  fastSeconds: 10,
  /** 不正解・パス・時間切れの追加ペナルティ */
  missPenalty: 80,
  /**
   * 大当り 1 回の払い出し（10R × 20）。
   * 正解率85%・速答5割のプレイヤーで収支がほぼ±0になる値（tests/economy.test.ts のシミュレーション）
   */
  payout: 200,
  /** PREMIUM（赤5筒）の払い出し */
  premiumPayout: 400,
  /** 残りがこれ未満で警告表示 */
  lowWarn: 200,
} as const;

export function costFor(correct: boolean, fast: boolean): number {
  if (!correct) return ECONOMY.cost + ECONOMY.missPenalty;
  return fast ? ECONOMY.fastCost : ECONOMY.cost;
}

export function payoutFor(premium: boolean): number {
  return premium ? ECONOMY.premiumPayout : ECONOMY.payout;
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
