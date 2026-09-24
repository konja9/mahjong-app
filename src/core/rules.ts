export interface Rules {
  /** 喰いタン */
  kuitan: boolean;
  /** 赤ドラ（各色1枚） */
  aka: boolean;
  /** 切り上げ満貫（30符4翻・60符3翻を満貫扱い） */
  kiriage: boolean;
  /** 数え役満（13翻以上を役満扱い）。false なら三倍満止まり */
  kazoe: boolean;
  /** ダブル役満・役満の複合を認める */
  doubleYakuman: boolean;
  /** 連風牌の雀頭の符 */
  doubleWindPairFu: 2 | 4;
}

export const DEFAULT_RULES: Rules = {
  kuitan: true,
  aka: true,
  kiriage: false,
  kazoe: true,
  doubleYakuman: false,
  doubleWindPairFu: 2,
};
