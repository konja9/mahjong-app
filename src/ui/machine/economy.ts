/** パチンコモードの通貨 yan。パラメータはここに集約する */
import type { Mode } from '../../core/generator';
import type { LimitName } from '../../core/score';
import { load, save } from '../storage';
import { mods } from './mods';
import { type MachineSpec, SPECS } from './specs';

export const ECONOMY = {
  /** 初期所持 */
  initial: 1000,
  /** 1問のコスト */
  cost: 40,
  /** 速答で正解したときのコスト（BET の半額） */
  fastCost: 20,
  /** 速答（割引）の締切（秒）。モードの難しさに合わせる */
  fastSeconds: { hayami: 6, fu: 12, jissen: 20 } as Record<Mode, number>,
  /** 不正解・パス・時間切れの追加ペナルティ */
  missPenalty: 20,
  /** 大当り 1 回のラウンド数（ラウンド問題の数） */
  rounds: 6,
  /**
   * BONUS の賞金は、正解した手の符のマス（20・25・30・40・50・60）の額。30符のマスを1とした倍率で、
   * 出にくく数えるのが難しい高い符ほど大きい。翻・ドラ・親子の運では増えない。
   * 早見の満貫以上（符が出ない）は30符のマス、役満（超大当りで出る）は30符の yakumanUnits 倍
   */
  fuPrize: { 20: 0.7, 25: 0.9, 30: 1, 40: 1.5, 50: 2.3, 60: 3.3 } as Record<number, number>,
  yakumanUnits: 10,
  /** 速答の賞金の倍率（速答は BET 半額で得をするので、賞金には上乗せしない） */
  fastMult: 1,
  /** ラウンド内の連続正解の倍率の階段（1問目 ×1、2問連続 ×1.05、3問以上 ×1.1）。1問ミスで最初に戻る */
  comboLadder: [1, 1.05, 1.1],
  /**
   * 電チュー開放：この連続正解数から、正解1回で玉が2個入る。
   * 早見は連続正解しやすいので、必要な連続数を多くする
   */
  denchu: { hayami: 15, fu: 6, jissen: 4 } as Record<Mode, number>,
  /** BONUS で満貫以上を正解したときのラウンド上乗せ（満貫・跳満 / 倍満・三倍満 / 役満）と、1回の BONUS の上限 */
  extraRounds: { mangan: 1, baiman: 2, yakuman: 3, max: 3 },
  /** PREMIUM（赤5筒）大当りのラウンドは 2 倍 */
  premiumMult: 2,
  /** 全問正解の上乗せ抽選：ラウンドで得た賞金に掛ける倍率と重み（PREMIUM は最低 ×1.3） */
  uwanose: [
    [1.1, 70],
    [1.3, 25],
    [1.5, 5],
  ] as [number, number][],
  uwanosePremium: [
    [1.3, 60],
    [1.5, 30],
    [2, 10],
  ] as [number, number][],
  /**
   * モード別のレート（30符のマス1つあたりの yan）。
   * 正解率85%・速答5割のプレイヤーの回収率が約115%になるよう
   * tests/economy.test.ts のシミュレーションで決めた値。上級者（正解95%・速答8割）は約250〜300%
   */
  modeScale: { hayami: 36.6, fu: 43.2, jissen: 22.2 } as Record<Mode, number>,
  /** 残りがこれ未満で警告表示 */
  lowWarn: 200,
};

/** 速答の締切（秒）。改造パーツの速答センサーを含む */
export function fastSecondsFor(mode: Mode): number {
  return ECONOMY.fastSeconds[mode] + mods.fastBonus[mode];
}

/** 電チュー開放に必要な連続正解数（改造込み） */
export function denchuFor(mode: Mode): number {
  return Math.max(2, ECONOMY.denchu[mode] - mods.denchuMinus);
}

export function costFor(correct: boolean, fast: boolean, spec: MachineSpec = SPECS.ama): number {
  const miss = mods.missPenalty ?? ECONOMY.missPenalty;
  const base = (!correct ? ECONOMY.cost + miss : fast ? ECONOMY.fastCost : ECONOMY.cost) * spec.betMult;
  return Math.round(base);
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
  /** 台（省略時は甘デジ） */
  spec?: MachineSpec;
}

/** 賞金のマスの倍率（30符＝1。役満・符なしの手の換算込み） */
export function prizeUnits(fu: number, yakuman: boolean): number {
  if (yakuman) return ECONOMY.yakumanUnits;
  return ECONOMY.fuPrize[fuScaleKey(fu, false) as number] ?? 1;
}

/** 30符のマス1つあたりの yan（PREMIUM・台を込み、速答と連続は別） */
export function fuRate(mode: Mode, premium: boolean, spec: MachineSpec = SPECS.ama): number {
  let v = ECONOMY.modeScale[mode] * spec.prizeMult;
  if (premium) v *= ECONOMY.premiumMult;
  return v;
}

/** 次に正解したときの連続正解の倍率（combo はここまでの連続正解数） */
export function comboMult(combo: number): number {
  const l = ECONOMY.comboLadder;
  const i = Math.min(Math.max(0, combo), l.length - 1);
  return i === l.length - 1 && mods.comboTop !== null ? mods.comboTop : l[i];
}

/** ラウンド問題の賞金 */
export function roundPrize(p: RoundPrizeInput): number {
  let v = prizeUnits(p.fu, p.yakuman) * fuRate(p.mode, p.premium, p.spec);
  if (p.fast) v *= ECONOMY.fastMult;
  v *= comboMult(p.combo - 1);
  return Math.max(1, Math.round(v));
}

/** 連続正解数（今回を含む）から、正解1回で台に入る玉の数 */
export function ballsFor(mode: Mode, streak: number): number {
  return streak >= denchuFor(mode) ? 2 : 1;
}

/** 1回の BONUS のラウンド上乗せの上限（改造込み） */
export function extraRoundsMax(): number {
  return ECONOMY.extraRounds.max + mods.extraMaxPlus;
}

/** 満貫以上を正解したときのラウンド上乗せ数（満貫未満は 0。4翻40符などの満貫も含む） */
export function extraRoundsFor(limit: LimitName): number {
  const e = ECONOMY.extraRounds;
  if (limit === '') return 0;
  if (limit === '満貫' || limit === '跳満') return e.mangan;
  if (limit === '倍満' || limit === '三倍満') return e.baiman;
  return e.yakuman;
}

/** 上乗せの抽選表（改造パーツの上乗せ強化で良い倍率が出やすくなる） */
function uwanoseTable(premium: boolean): [number, number][] {
  const t = premium ? ECONOMY.uwanosePremium : ECONOMY.uwanose;
  if (!mods.uwanoseUp) return t;
  // 最低の倍率の重みを減らし、上の倍率に回す
  return t.map(([m, w], i) => [m, i === 0 ? w * 0.6 : w * 1.6]);
}

/** 全問正解の上乗せ抽選。倍率を返す */
export function drawUwanose(rng: () => number, premium: boolean): number {
  const table = uwanoseTable(premium);
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
  const table = uwanoseTable(premium);
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
export const FU_SCALE = [20, 25, 30, 40, 50, 60] as const;

export interface FuScaleCell {
  /** 20〜60 は符（70符以上は出題しない）、yakuman は役満 */
  key: number | 'yakuman';
  label: string;
  prize: number;
}

/** 目盛りの各マスの賞金（速答なし・連続1問目） */
export function fuScale(mode: Mode, premium: boolean, spec: MachineSpec = SPECS.ama): FuScaleCell[] {
  const cell = (fu: number, yakuman: boolean) =>
    roundPrize({ mode, fu, yakuman, fast: false, combo: 1, premium, spec });
  const cells: FuScaleCell[] = FU_SCALE.map((fu) => ({ key: fu, label: `${fu}`, prize: cell(fu, false) }));
  if (premium) cells.push({ key: 'yakuman', label: '役満', prize: cell(0, true) });
  return cells;
}

/** 手の符が目盛りのどのマスに入るか */
export function fuScaleKey(fu: number, yakuman: boolean): FuScaleCell['key'] {
  if (yakuman) return 'yakuman';
  // 符なし（早見の満貫以上）は30符のマス
  if (!fu) return 30;
  if (fu <= 20) return 20;
  if (fu <= 25) return 25;
  return Math.min(60, Math.ceil(fu / 10) * 10);
}
