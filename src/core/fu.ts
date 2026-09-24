import type { Situation } from './hand';
import type { Interpretation } from './decompose';
import type { Rules } from './rules';
import { CHUN, HAKU, type Tile, isYaochu, tileName } from './tiles';

export interface FuItem {
  label: string;
  fu: number;
}

export interface FuResult {
  /** 切り上げ後の符 */
  fu: number;
  /** 切り上げ前の合計 */
  raw: number;
  items: FuItem[];
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

export function calcFu(
  interp: Interpretation,
  sit: Situation,
  rules: Rules,
  menzen: boolean,
  pinfu: boolean,
): FuResult {
  if (interp.form === 'chiitoi') {
    return { fu: 25, raw: 25, items: [{ label: '七対子', fu: 25 }] };
  }
  if (interp.form === 'kokushi') {
    return { fu: 0, raw: 0, items: [] };
  }

  if (pinfu && sit.tsumo) {
    return { fu: 20, raw: 20, items: [{ label: '平和ツモ', fu: 20 }] };
  }

  const items: FuItem[] = [{ label: '副底', fu: 20 }];
  if (menzen && !sit.tsumo) items.push({ label: '門前ロン', fu: 10 });
  if (sit.tsumo) items.push({ label: 'ツモ', fu: 2 });

  for (const g of interp.groups) {
    if (g.kind === 'shuntsu') continue;
    const yao = isYaochu(g.tile);
    let fu = g.kind === 'kantsu' ? 8 : 2;
    if (g.concealed) fu *= 2;
    if (yao) fu *= 2;
    const kind =
      g.kind === 'kantsu' ? (g.concealed ? '暗槓' : '明槓') : g.concealed ? '暗刻' : '明刻';
    items.push({ label: `${kind} ${tileName(g.tile)}${yao ? '（么九）' : ''}`, fu });
  }

  items.push(...pairFu(interp.pair, sit, rules));

  if (interp.wait === 'kanchan') items.push({ label: '嵌張待ち', fu: 2 });
  if (interp.wait === 'penchan') items.push({ label: '辺張待ち', fu: 2 });
  if (interp.wait === 'tanki') items.push({ label: '単騎待ち', fu: 2 });

  let raw = items.reduce((s, i) => s + i.fu, 0);
  if (!menzen && raw === 20) {
    // 喰い平和形のロンは 30 符に
    items.push({ label: '喰い平和形（30符に）', fu: 10 });
    raw = 30;
  }
  return { fu: Math.ceil(raw / 10) * 10, raw, items };
}
