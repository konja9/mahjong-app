import type { Tile } from './tiles';

export type MeldType = 'chi' | 'pon' | 'minkan' | 'ankan';

export interface Meld {
  type: MeldType;
  /** chi は最小の牌、その他は構成牌 */
  tile: Tile;
}

export interface Hand {
  /** 和了牌を除いた手の内の牌 */
  concealed: Tile[];
  melds: Meld[];
  winTile: Tile;
  /** 赤ドラとして扱う5の牌（各要素が赤5を1枚表す） */
  akaTiles: Tile[];
}

export interface Situation {
  tsumo: boolean;
  riichi: boolean;
  doubleRiichi: boolean;
  ippatsu: boolean;
  roundWind: Tile;
  seatWind: Tile;
  doraIndicators: Tile[];
  uraIndicators: Tile[];
  haitei: boolean;
  houtei: boolean;
  rinshan: boolean;
  chankan: boolean;
}

export function meldTiles(m: Meld): Tile[] {
  switch (m.type) {
    case 'chi':
      return [m.tile, m.tile + 1, m.tile + 2];
    case 'pon':
      return [m.tile, m.tile, m.tile];
    default:
      return [m.tile, m.tile, m.tile, m.tile];
  }
}

export function allTiles(hand: Hand): Tile[] {
  return [...hand.concealed, hand.winTile, ...hand.melds.flatMap(meldTiles)];
}

export const isMenzen = (hand: Hand): boolean => hand.melds.every((m) => m.type === 'ankan');

export const defaultSituation = (over: Partial<Situation> = {}): Situation => ({
  tsumo: false,
  riichi: false,
  doubleRiichi: false,
  ippatsu: false,
  roundWind: 27,
  seatWind: 28,
  doraIndicators: [],
  uraIndicators: [],
  haitei: false,
  houtei: false,
  rinshan: false,
  chankan: false,
  ...over,
});
