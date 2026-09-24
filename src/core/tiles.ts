/**
 * 牌は 0..33 の整数で表す。
 *   0-8  : 萬子 1-9
 *   9-17 : 筒子 1-9
 *   18-26: 索子 1-9
 *   27-33: 東 南 西 北 白 發 中
 */
export type Tile = number;

export const EAST = 27;
export const SOUTH = 28;
export const WEST = 29;
export const NORTH = 30;
export const HAKU = 31;
export const HATSU = 32;
export const CHUN = 33;

export const WINDS = [EAST, SOUTH, WEST, NORTH] as const;
export const DRAGONS = [HAKU, HATSU, CHUN] as const;

export const SUIT_CHARS = ['m', 'p', 's', 'z'] as const;

export const suitOf = (t: Tile): number => Math.floor(t / 9);
export const numOf = (t: Tile): number => (t < 27 ? (t % 9) + 1 : t - 26);
export const isHonor = (t: Tile): boolean => t >= 27;
export const isWind = (t: Tile): boolean => t >= EAST && t <= NORTH;
export const isDragon = (t: Tile): boolean => t >= HAKU;
export const isTerminal = (t: Tile): boolean => t < 27 && (t % 9 === 0 || t % 9 === 8);
export const isYaochu = (t: Tile): boolean => isHonor(t) || isTerminal(t);
export const isSimple = (t: Tile): boolean => !isYaochu(t);

export const YAOCHU: Tile[] = [0, 8, 9, 17, 18, 26, 27, 28, 29, 30, 31, 32, 33];

/** "123m456p11z" 形式をパースする（z: 1東 2南 3西 4北 5白 6發 7中） */
export function parseTiles(src: string): Tile[] {
  const out: Tile[] = [];
  let pending: number[] = [];
  for (const ch of src.replace(/\s+/g, '')) {
    if (ch >= '0' && ch <= '9') {
      pending.push(Number(ch));
      continue;
    }
    const suit = SUIT_CHARS.indexOf(ch as (typeof SUIT_CHARS)[number]);
    if (suit < 0) throw new Error(`invalid tile char: ${ch}`);
    for (const n of pending) {
      const num = n === 0 ? 5 : n;
      if (suit === 3 ? num < 1 || num > 7 : num < 1 || num > 9) {
        throw new Error(`invalid tile: ${n}${ch}`);
      }
      out.push(suit * 9 + num - 1);
    }
    pending = [];
  }
  if (pending.length) throw new Error('trailing digits without suit');
  return out;
}

export function tileToString(t: Tile): string {
  return `${numOf(t)}${SUIT_CHARS[suitOf(t)]}`;
}

const KANJI_NUM = ['一', '二', '三', '四', '五', '六', '七', '八', '九'];
const HONOR_NAMES = ['東', '南', '西', '北', '白', '發', '中'];

export function tileName(t: Tile): string {
  if (isHonor(t)) return HONOR_NAMES[t - 27];
  const n = numOf(t);
  switch (suitOf(t)) {
    case 0:
      return `${KANJI_NUM[n - 1]}萬`;
    case 1:
      return `${n}筒`;
    default:
      return `${n}索`;
  }
}

export function windName(t: Tile): string {
  return HONOR_NAMES[t - 27];
}

/** ドラ表示牌からドラを求める */
export function doraFromIndicator(t: Tile): Tile {
  if (t < 27) return suitOf(t) * 9 + ((t % 9) + 1) % 9;
  if (isWind(t)) return EAST + ((t - EAST + 1) % 4);
  return HAKU + ((t - HAKU + 1) % 3);
}

export function toCounts(tiles: readonly Tile[]): number[] {
  const c = new Array<number>(34).fill(0);
  for (const t of tiles) c[t]++;
  return c;
}

export function sortTiles(tiles: readonly Tile[]): Tile[] {
  return [...tiles].sort((a, b) => a - b);
}

export const isFive = (t: Tile): boolean => t < 27 && t % 9 === 4;
