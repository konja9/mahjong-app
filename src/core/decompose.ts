import { type Hand, type Meld } from './hand';
import { type Tile, YAOCHU, toCounts } from './tiles';

export type GroupKind = 'shuntsu' | 'koutsu' | 'kantsu';

export interface Group {
  kind: GroupKind;
  /** 順子は最小の牌 */
  tile: Tile;
  /** 鳴いた面子（門前を崩す） */
  called: boolean;
  /** 暗刻・暗槓として扱う（ロンで完成したシャンポン待ちの刻子は false） */
  concealed: boolean;
}

export type WaitType = 'ryanmen' | 'kanchan' | 'penchan' | 'shanpon' | 'tanki';

export const WAIT_NAMES: Record<WaitType, string> = {
  ryanmen: '両面待ち',
  kanchan: '嵌張待ち',
  penchan: '辺張待ち',
  shanpon: '双碰待ち',
  tanki: '単騎待ち',
};

export type Interpretation =
  | { form: 'standard'; pair: Tile; groups: Group[]; wait: WaitType }
  | { form: 'chiitoi'; pairs: Tile[] }
  | { form: 'kokushi'; thirteenWait: boolean };

export function meldToGroup(m: Meld): Group {
  switch (m.type) {
    case 'chi':
      return { kind: 'shuntsu', tile: m.tile, called: true, concealed: false };
    case 'pon':
      return { kind: 'koutsu', tile: m.tile, called: true, concealed: false };
    case 'minkan':
      return { kind: 'kantsu', tile: m.tile, called: true, concealed: false };
    case 'ankan':
      return { kind: 'kantsu', tile: m.tile, called: false, concealed: true };
  }
}

interface RawGroup {
  kind: 'shuntsu' | 'koutsu';
  tile: Tile;
}

/** counts を n 個の面子に分解するすべての方法 */
function splitGroups(counts: number[], n: number): RawGroup[][] {
  if (n === 0) return counts.every((c) => c === 0) ? [[]] : [];
  const first = counts.findIndex((c) => c > 0);
  if (first < 0) return [];
  const results: RawGroup[][] = [];
  if (counts[first] >= 3) {
    counts[first] -= 3;
    for (const rest of splitGroups(counts, n - 1)) results.push([{ kind: 'koutsu', tile: first }, ...rest]);
    counts[first] += 3;
  }
  if (first < 27 && first % 9 <= 6 && counts[first + 1] > 0 && counts[first + 2] > 0) {
    counts[first]--;
    counts[first + 1]--;
    counts[first + 2]--;
    for (const rest of splitGroups(counts, n - 1)) results.push([{ kind: 'shuntsu', tile: first }, ...rest]);
    counts[first]++;
    counts[first + 1]++;
    counts[first + 2]++;
  }
  return results;
}

function shuntsuWait(start: Tile, win: Tile): WaitType {
  const pos = win - start;
  if (pos === 1) return 'kanchan';
  if (pos === 0) return start % 9 === 6 ? 'penchan' : 'ryanmen';
  return start % 9 === 0 ? 'penchan' : 'ryanmen';
}

/** 和了形としての全解釈を列挙する（和了形でなければ空配列） */
export function decompose(hand: Hand, tsumo: boolean): Interpretation[] {
  const closed = [...hand.concealed, hand.winTile];
  const counts = toCounts(closed);
  const need = 4 - hand.melds.length;
  if (closed.length !== need * 3 + 2) return [];

  const results: Interpretation[] = [];

  if (hand.melds.length === 0) {
    // 七対子
    const pairs = counts.flatMap((c, t) => (c === 2 ? [t] : []));
    if (pairs.length === 7) results.push({ form: 'chiitoi', pairs });
    // 国士無双
    if (YAOCHU.every((t) => counts[t] >= 1) && YAOCHU.reduce((s, t) => s + counts[t], 0) === 14) {
      const before = toCounts(hand.concealed);
      results.push({ form: 'kokushi', thirteenWait: YAOCHU.every((t) => before[t] === 1) });
      return results;
    }
  }

  const meldGroups = hand.melds.map(meldToGroup);
  const seen = new Set<string>();
  for (let pair = 0; pair < 34; pair++) {
    if (counts[pair] < 2) continue;
    counts[pair] -= 2;
    for (const raw of splitGroups(counts, need)) {
      // 和了牌をどの部分で使ったかで待ちが変わる
      const options: { idx: number; wait: WaitType }[] = [];
      if (pair === hand.winTile) options.push({ idx: -1, wait: 'tanki' });
      raw.forEach((g, i) => {
        if (g.kind === 'koutsu' && g.tile === hand.winTile) options.push({ idx: i, wait: 'shanpon' });
        if (g.kind === 'shuntsu' && hand.winTile >= g.tile && hand.winTile <= g.tile + 2) {
          options.push({ idx: i, wait: shuntsuWait(g.tile, hand.winTile) });
        }
      });
      for (const opt of options) {
        const groups: Group[] = raw.map((g, i) => ({
          kind: g.kind,
          tile: g.tile,
          called: false,
          // ロン和了のシャンポン待ちで完成した刻子は明刻扱い
          concealed: g.kind === 'koutsu' ? !(i === opt.idx && !tsumo) : false,
        }));
        const all = [...groups, ...meldGroups];
        const key = `${pair}|${opt.wait}|${all
          .map((g) => `${g.kind}${g.tile}${g.concealed ? 'c' : ''}${g.called ? 'o' : ''}`)
          .sort()
          .join(',')}`;
        if (seen.has(key)) continue;
        seen.add(key);
        results.push({ form: 'standard', pair, groups: all, wait: opt.wait });
      }
    }
    counts[pair] += 2;
  }
  return results;
}
