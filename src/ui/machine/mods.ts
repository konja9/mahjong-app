import type { Mode } from '../../core/generator';
import type { MachineSpec } from './specs';

/**
 * 台の改造パーツの効き目（今付けているパーツをまとめたもの）。
 * 経済・台の抽選・演出の関数がここを見る。付け替えは parts.ts の applyParts で行う。
 * 何も付けていないときは、改造前の値と同じになる
 */
export interface Mods {
  /** 保留の上限 */
  holds: number;
  /** 速答の締切に足す秒数 */
  fastBonus: Record<Mode, number>;
  /** 不正解のとき、BET のうち戻る割合（0〜1） */
  missRefund: number;
  /** 電チュー開放に必要な連続正解から引く数 */
  denchuMinus: number;
  /** RUSH の回転数に足す数 */
  stPlus: number;
  /** 確変になる割合に足す値 */
  kakuhenPlus: number;
  /** 満貫以上のラウンド上乗せの上限に足す数 */
  extraMaxPlus: number;
  /** 連続正解の倍率の最上段に掛ける倍率（1 は ECONOMY のまま） */
  comboTopMult: number;
  /** 全問正解の上乗せの抽選を良くする */
  uwanoseUp: boolean;
  /** 保留変化・パチふとくん予告の出やすさの倍率（演出だけ） */
  noticeBoost: number;
  /** 大当り確率の倍率（1/odds に掛ける） */
  hitMult: number;
  /** 当りのうち PREMIUM（赤五筒）になる割合の上乗せ */
  premiumPlus: number;
}

export const BASE_MODS: Mods = {
  holds: 4,
  fastBonus: { hayami: 0, fu: 0, jissen: 0 },
  missRefund: 0,
  denchuMinus: 0,
  stPlus: 0,
  kakuhenPlus: 0,
  extraMaxPlus: 0,
  comboTopMult: 1,
  uwanoseUp: false,
  noticeBoost: 1,
  hitMult: 1,
  premiumPlus: 0,
};

/** 今の効き目 */
export let mods: Mods = BASE_MODS;

export function setMods(m: Mods): void {
  mods = m;
}

/** 改造を反映した台の数値 */
export function effectiveSpec(spec: MachineSpec, m: Mods = mods): MachineSpec {
  return {
    ...spec,
    odds: spec.odds / m.hitMult,
    rushOdds: spec.rushOdds / m.hitMult,
    st: spec.st + m.stPlus,
    kakuhenRate: Math.min(1, spec.kakuhenRate + m.kakuhenPlus),
  };
}
