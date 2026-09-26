/** ノーマルモードの通貨 yan。パラメータはここに集約する */
import type { Mode } from '../../core/generator';
import { load, save } from '../storage';
import { type MachineSpec, SPECS } from './specs';

export const ECONOMY = {
  /** 初期所持 */
  initial: 1000,
  /** 1問のコスト */
  cost: 40,
  /** 速答で正解したときのコスト */
  fastCost: 30,
  /** 速答（割引）の締切（秒）。モードの難しさに合わせる */
  fastSeconds: { hayami: 6, fu: 12, jissen: 20 } as Record<Mode, number>,
  /** 不正解・パス・時間切れの追加ペナルティ */
  missPenalty: 20,
  /** 大当り 1 回のラウンド数（ラウンド問題の数） */
  rounds: 6,
  /**
   * BONUS の賞金は「符 × レート」。翻・ドラ・親子の運では増えず、計算した符そのものが賞金になる。
   * 早見の満貫以上（符が出ない）は 30符ぶん、役満（超大当りで出る）は 300符ぶん
   */
  limitFu: 30,
  yakumanFu: 300,
  /** 速答なら 1.2 倍 */
  fastMult: 1.2,
  /** ラウンド内の連続正解の倍率の階段（1問目 ×1、2問連続 ×1.5 …）。1問ミスで最初に戻る */
  comboLadder: [1, 1.2, 1.5, 2, 3],
  /** PREMIUM（赤5筒）大当りのラウンドは 2 倍 */
  premiumMult: 2,
  /** 全問正解の上乗せ抽選：ラウンドで得た賞金に掛ける倍率と重み（PREMIUM は最低 ×3） */
  uwanose: [
    [1.5, 50],
    [2, 30],
    [3, 15],
    [5, 5],
  ] as [number, number][],
  uwanosePremium: [
    [2, 50],
    [3, 35],
    [5, 15],
  ] as [number, number][],
  /**
   * モード別のレート（1符あたりの yan）。
   * 正解率85%・速答5割のプレイヤーの回収率がどのモードでもほぼ100%になるよう
   * tests/economy.test.ts のシミュレーションで決めた値
   */
  modeScale: { hayami: 0.56, fu: 0.84, jissen: 0.53 } as Record<Mode, number>,
  /** ハイローラー：コスト 2 倍・ラウンド賞金 2.5 倍 */
  highRoller: { costMult: 2, prizeMult: 2.5 },
  /** 残りがこれ未満で警告表示 */
  lowWarn: 200,
};

export function costFor(correct: boolean, fast: boolean, highRoller = false, spec: MachineSpec = SPECS.ama): number {
  const base = (!correct ? ECONOMY.cost + ECONOMY.missPenalty : fast ? ECONOMY.fastCost : ECONOMY.cost) * spec.betMult;
  return Math.round(highRoller ? base * ECONOMY.highRoller.costMult : base);
}

export interface RoundPrizeInput {
  mode: Mode;
  /** 手の符（早見の満貫以上は 0） */
  fu: number;
  yakuman: boolean;
  fast: boolean;
  /** このラウンド内での連続正解数（今回を含む） */
  combo: number;
  premium: boolean;
  highRoller: boolean;
  /** 台（省略時は甘デジ） */
  spec?: MachineSpec;
}

/** 賞金の計算に使う符（役満・符なしの手の換算込み） */
export function prizeFu(fu: number, yakuman: boolean): number {
  if (yakuman) return ECONOMY.yakumanFu;
  return fu > 0 ? fu : ECONOMY.limitFu;
}

/** 1符あたりの yan（PREMIUM・ハイローラー・台を込み、速答と連続は別） */
export function fuRate(mode: Mode, premium: boolean, highRoller: boolean, spec: MachineSpec = SPECS.ama): number {
  let v = ECONOMY.modeScale[mode] * spec.prizeMult;
  if (premium) v *= ECONOMY.premiumMult;
  if (highRoller) v *= ECONOMY.highRoller.prizeMult;
  return v;
}

/** 次に正解したときの連続正解の倍率（combo はここまでの連続正解数） */
export function comboMult(combo: number): number {
  const l = ECONOMY.comboLadder;
  return l[Math.min(Math.max(0, combo), l.length - 1)];
}

/** ラウンド問題の賞金 */
export function roundPrize(p: RoundPrizeInput): number {
  let v = prizeFu(p.fu, p.yakuman) * fuRate(p.mode, p.premium, p.highRoller, p.spec);
  if (p.fast) v *= ECONOMY.fastMult;
  v *= comboMult(p.combo - 1);
  return Math.max(1, Math.round(v));
}

/** 全問正解の上乗せ抽選。倍率を返す */
export function drawUwanose(rng: () => number, premium: boolean): number {
  const table = premium ? ECONOMY.uwanosePremium : ECONOMY.uwanose;
  const total = table.reduce((s, [, w]) => s + w, 0);
  let r = rng() * total;
  for (const [m, w] of table) {
    r -= w;
    if (r < 0) return m;
  }
  return table[table.length - 1][0];
}

/** 上乗せ倍率の期待値 */
export function uwanoseMean(premium: boolean): number {
  const table = premium ? ECONOMY.uwanosePremium : ECONOMY.uwanose;
  const total = table.reduce((s, [, w]) => s + w, 0);
  return table.reduce((s, [m, w]) => s + (m * w) / total, 0);
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

/** BONUS 中に液晶帯へ出す符の目盛り */
export const FU_SCALE = [30, 40, 50, 60, 70, 80] as const;

export interface FuScaleCell {
  /** 30〜70 は符、80 は「80〜」、yakuman は役満 */
  key: number | 'yakuman';
  label: string;
  prize: number;
}

/** 目盛りの各マスの賞金（速答なし・連続1問目） */
export function fuScale(mode: Mode, premium: boolean, highRoller: boolean, spec: MachineSpec = SPECS.ama): FuScaleCell[] {
  const cell = (fu: number, yakuman: boolean) =>
    roundPrize({ mode, fu, yakuman, fast: false, combo: 1, premium, highRoller, spec });
  const cells: FuScaleCell[] = FU_SCALE.map((fu) => ({ key: fu, label: fu === 80 ? '80〜' : fu === 30 ? '〜30' : `${fu}`, prize: cell(fu, false) }));
  if (premium) cells.push({ key: 'yakuman', label: '役満', prize: cell(0, true) });
  return cells;
}

/** 手の符が目盛りのどのマスに入るか */
export function fuScaleKey(fu: number, yakuman: boolean): FuScaleCell['key'] {
  if (yakuman) return 'yakuman';
  const f = prizeFu(fu, false);
  if (f >= 80) return 80;
  return Math.max(30, Math.floor(f / 10) * 10);
}
