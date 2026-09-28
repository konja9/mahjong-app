import type { Situation } from './hand';
import { type Group, type Interpretation, WAIT_NAMES } from './decompose';
import type { Rules } from './rules';
import { CHUN, HAKU, type Tile, isHonor, isYaochu, numOf, suitOf, tileName } from './tiles';

export interface FuItem {
  label: string;
  fu: number;
}

/** 解説用の内訳の1行。0符の項目も含め、なぜその符になるかの注記を付ける */
export interface FuRow extends FuItem {
  note?: string;
  /** 面子の行なら groups での位置、雀頭の行なら -1 */
  group?: number;
}

export interface FuResult {
  /** 切り上げ後の符 */
  fu: number;
  /** 切り上げ前の合計 */
  raw: number;
  items: FuItem[];
  /** 解説用：数える順にすべての項目（0符も含む）を並べたもの */
  rows: FuRow[];
}

export function pairFu(pair: Tile, sit: Situation, rules: Rules): FuItem[] {
  const items: FuItem[] = [];
  const name = tileName(pair);
  if (pair >= HAKU && pair <= CHUN) items.push({ label: `雀頭 ${name}（役牌）`, fu: 2 });
  if (pair === sit.roundWind && pair === sit.seatWind) {
    items.push({ label: `雀頭 ${name}（連風牌）`, fu: rules.doubleWindPairFu });
  } else if (pair === sit.roundWind) {
    items.push({ label: `雀頭 ${name}（場風）`, fu: 2 });
  } else if (pair === sit.seatWind) {
    items.push({ label: `雀頭 ${name}（自風）`, fu: 2 });
  }
  return items;
}

const KANJI_NUM = ['一', '二', '三', '四', '五', '六', '七', '八', '九'];
const SUIT_NAME = ['萬', '筒', '索'];

/** 順子の名前（例 二三四萬・567筒） */
function shuntsuName(start: Tile): string {
  const nums = [0, 1, 2].map((d) => numOf(start + d));
  const s = suitOf(start);
  return `${s === 0 ? nums.map((n) => KANJI_NUM[n - 1]).join('') : nums.join('')}${SUIT_NAME[s]}`;
}

/** 刻子・槓子の種類の名前（暗刻・明刻・暗槓・明槓） */
export function tripletKind(g: Group): string {
  if (g.kind === 'kantsu') return g.concealed ? '暗槓' : '明槓';
  return g.concealed ? '暗刻' : '明刻';
}

/** 面子の符（順子は 0） */
export function groupFu(g: Group): number {
  if (g.kind === 'shuntsu') return 0;
  let fu = g.kind === 'kantsu' ? 8 : 2;
  if (g.concealed) fu *= 2;
  if (isYaochu(g.tile)) fu *= 2;
  return fu;
}

function groupRow(g: Group, i: number, winGroup: number, tsumo: boolean): FuRow {
  if (g.kind === 'shuntsu') {
    return { label: `順子 ${shuntsuName(g.tile)}`, fu: 0, note: '順子は0符', group: i };
  }
  const yao = isYaochu(g.tile);
  const kind = tripletKind(g);
  const notes = [yao ? (isHonor(g.tile) ? '么九（字牌）' : '么九（1・9）') : '中張（2〜8）'];
  // 手の内の刻子なのに明刻になるのは、ロンで完成させたとき
  if (!g.called && !g.concealed && g.kind === 'koutsu' && i === winGroup && !tsumo) notes.push('ロンで完成＝明刻扱い');
  if (g.kind === 'kantsu') notes.push('槓子は刻子の4倍');
  return { label: `${kind} ${tileName(g.tile)}`, fu: groupFu(g), note: notes.join('・'), group: i };
}

/** 数える順（副底 → 門前ロン → ツモ → 面子 → 雀頭 → 待ち）にすべての項目を並べる */
function fuRows(
  interp: Extract<Interpretation, { form: 'standard' }>,
  sit: Situation,
  rules: Rules,
  menzen: boolean,
  pinfuTsumo: boolean,
): FuRow[] {
  const rows: FuRow[] = [{ label: '副底', fu: 20, note: 'どの手にも付く' }];
  if (menzen && !sit.tsumo) rows.push({ label: '門前ロン', fu: 10, note: '鳴かずにロン' });
  else rows.push({ label: '門前ロン', fu: 0, note: sit.tsumo ? 'ツモなので付かない' : '鳴いているので付かない' });
  if (pinfuTsumo) rows.push({ label: 'ツモ', fu: 0, note: '平和ツモには付けない' });
  else if (sit.tsumo) rows.push({ label: 'ツモ', fu: 2 });
  else rows.push({ label: 'ツモ', fu: 0, note: 'ロンなので付かない' });

  interp.groups.forEach((g, i) => rows.push(groupRow(g, i, interp.winGroup, sit.tsumo)));

  const pair = pairFu(interp.pair, sit, rules);
  if (pair.length) {
    const double = interp.pair === sit.roundWind && interp.pair === sit.seatWind;
    for (const p of pair) rows.push({ ...p, group: -1, note: double ? `場風かつ自風（設定：${rules.doubleWindPairFu}符）` : '役牌の雀頭' });
  } else {
    const note = interp.pair >= 27 ? '客風牌（役牌でない）' : '数牌';
    rows.push({ label: `雀頭 ${tileName(interp.pair)}`, fu: 0, note, group: -1 });
  }

  const waitFu = interp.wait === 'kanchan' || interp.wait === 'penchan' || interp.wait === 'tanki' ? 2 : 0;
  const waitNote: Record<string, string> = {
    ryanmen: '両面は0符',
    shanpon: '双碰は0符（刻子の側で数える）',
  };
  rows.push({ label: WAIT_NAMES[interp.wait], fu: waitFu, note: waitNote[interp.wait] });
  return rows;
}

export function calcFu(
  interp: Interpretation,
  sit: Situation,
  rules: Rules,
  menzen: boolean,
  pinfu: boolean,
): FuResult {
  if (interp.form === 'chiitoi') {
    const items = [{ label: '七対子', fu: 25 }];
    return { fu: 25, raw: 25, items, rows: [{ ...items[0], note: '25符で固定（切り上げない）' }] };
  }
  if (interp.form === 'kokushi') {
    return { fu: 0, raw: 0, items: [], rows: [] };
  }

  if (pinfu && sit.tsumo) {
    return {
      fu: 20,
      raw: 20,
      items: [{ label: '平和ツモ', fu: 20 }],
      rows: fuRows(interp, sit, rules, menzen, true),
    };
  }

  const items: FuItem[] = [{ label: '副底', fu: 20 }];
  if (menzen && !sit.tsumo) items.push({ label: '門前ロン', fu: 10 });
  if (sit.tsumo) items.push({ label: 'ツモ', fu: 2 });

  for (const g of interp.groups) {
    if (g.kind === 'shuntsu') continue;
    items.push({ label: `${tripletKind(g)} ${tileName(g.tile)}${isYaochu(g.tile) ? '（么九）' : ''}`, fu: groupFu(g) });
  }

  items.push(...pairFu(interp.pair, sit, rules));

  if (interp.wait === 'kanchan') items.push({ label: '嵌張待ち', fu: 2 });
  if (interp.wait === 'penchan') items.push({ label: '辺張待ち', fu: 2 });
  if (interp.wait === 'tanki') items.push({ label: '単騎待ち', fu: 2 });

  const rows = fuRows(interp, sit, rules, menzen, false);
  let raw = items.reduce((s, i) => s + i.fu, 0);
  if (!menzen && raw === 20) {
    // 喰い平和形のロンは 30 符に
    const kui = { label: '喰い平和形（30符に）', fu: 10 };
    items.push(kui);
    rows.push({ ...kui, note: '鳴いて20符のロンは30符にする' });
    raw = 30;
  }
  return { fu: Math.ceil(raw / 10) * 10, raw, items, rows };
}
