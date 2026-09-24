import { type Hand, type Situation, isMenzen } from './hand';
import type { Group, Interpretation } from './decompose';
import type { Rules } from './rules';
import {
  CHUN,
  HAKU,
  HATSU,
  type Tile,
  isDragon,
  isHonor,
  isTerminal,
  isWind,
  isYaochu,
  suitOf,
  toCounts,
  windName,
} from './tiles';

export interface YakuItem {
  name: string;
  han: number;
  /** 役満の倍数（役満でなければ 0） */
  yakuman: number;
}

const y = (name: string, han: number): YakuItem => ({ name, han, yakuman: 0 });
const ym = (name: string, mult = 1): YakuItem => ({ name, han: 13 * mult, yakuman: mult });

const GREEN = new Set<Tile>([19, 20, 21, 23, 25, HATSU]);

function tilesOf(interp: Interpretation): Tile[] {
  if (interp.form === 'chiitoi') return interp.pairs.flatMap((p) => [p, p]);
  if (interp.form === 'kokushi') return [];
  const out: Tile[] = [interp.pair, interp.pair];
  for (const g of interp.groups) {
    if (g.kind === 'shuntsu') out.push(g.tile, g.tile + 1, g.tile + 2);
    else out.push(g.tile, g.tile, g.tile);
  }
  return out;
}

const isTriplet = (g: Group) => g.kind !== 'shuntsu';
const groupHasYaochu = (g: Group) =>
  g.kind === 'shuntsu' ? isTerminal(g.tile) || isTerminal(g.tile + 2) : isYaochu(g.tile);

export interface YakuResult {
  yaku: YakuItem[];
  /** 平和が成立しているか（符計算に使う） */
  pinfu: boolean;
}

export function detectYaku(interp: Interpretation, hand: Hand, sit: Situation, rules: Rules): YakuResult {
  const menzen = isMenzen(hand);
  const yakuman: YakuItem[] = [];
  const yaku: YakuItem[] = [];
  const allT = [...hand.concealed, hand.winTile, ...tilesOfMelds(hand)];
  const counts = toCounts(allT);

  // ---- 役満 ----
  if (interp.form === 'kokushi') {
    yakuman.push(interp.thirteenWait && rules.doubleYakuman ? ym('国士無双十三面待ち', 2) : ym('国士無双'));
  }
  if (allT.every(isHonor)) yakuman.push(ym('字一色'));
  if (allT.every(isTerminal)) yakuman.push(ym('清老頭'));
  if (allT.every((t) => GREEN.has(t))) yakuman.push(ym('緑一色'));

  if (interp.form === 'standard') {
    const { groups, pair } = interp;
    const triplets = groups.filter(isTriplet);
    const anko = triplets.filter((g) => g.concealed).length;
    const kans = groups.filter((g) => g.kind === 'kantsu').length;
    const dragonTrip = triplets.filter((g) => isDragon(g.tile)).length;
    const windTrip = triplets.filter((g) => isWind(g.tile)).length;

    if (anko === 4) {
      yakuman.push(interp.wait === 'tanki' && rules.doubleYakuman ? ym('四暗刻単騎', 2) : ym('四暗刻'));
    }
    if (dragonTrip === 3) yakuman.push(ym('大三元'));
    if (windTrip === 4) yakuman.push(rules.doubleYakuman ? ym('大四喜', 2) : ym('大四喜'));
    else if (windTrip === 3 && isWind(pair)) yakuman.push(ym('小四喜'));
    if (kans === 4) yakuman.push(ym('四槓子'));
    if (menzen && hand.melds.length === 0) {
      const chuuren = detectChuuren(counts);
      if (chuuren) {
        const before = toCounts(hand.concealed);
        const pure = detectPureChuuren(before);
        yakuman.push(pure && rules.doubleYakuman ? ym('純正九蓮宝燈', 2) : ym('九蓮宝燈'));
      }
    }
  }

  if (yakuman.length) {
    if (!rules.doubleYakuman) {
      // 複合・ダブル役満なし：最初の1つだけ役満として数える
      return { yaku: [{ ...yakuman[0], han: 13, yakuman: 1 }], pinfu: false };
    }
    return { yaku: yakuman, pinfu: false };
  }
  if (interp.form === 'kokushi') return { yaku: [], pinfu: false };

  // ---- 状況役 ----
  if (sit.doubleRiichi && menzen) yaku.push(y('ダブル立直', 2));
  else if (sit.riichi && menzen) yaku.push(y('立直', 1));
  if (sit.ippatsu && (sit.riichi || sit.doubleRiichi) && menzen) yaku.push(y('一発', 1));
  if (sit.tsumo && menzen) yaku.push(y('門前清自摸和', 1));
  if (sit.haitei && sit.tsumo) yaku.push(y('海底摸月', 1));
  if (sit.houtei && !sit.tsumo) yaku.push(y('河底撈魚', 1));
  if (sit.rinshan && sit.tsumo) yaku.push(y('嶺上開花', 1));
  if (sit.chankan && !sit.tsumo) yaku.push(y('槍槓', 1));

  const tiles = tilesOf(interp);
  const suits = new Set(tiles.filter((t) => !isHonor(t)).map(suitOf));
  const hasHonor = tiles.some(isHonor);

  if (tiles.every((t) => !isYaochu(t)) && (menzen || rules.kuitan)) yaku.push(y('断么九', 1));
  if (suits.size === 1 && !hasHonor) yaku.push(y('清一色', menzen ? 6 : 5));
  else if (suits.size === 1 && hasHonor) yaku.push(y('混一色', menzen ? 3 : 2));
  if (tiles.every(isYaochu)) yaku.push(y('混老頭', 2));

  let pinfu = false;
  if (interp.form === 'chiitoi') {
    yaku.push(y('七対子', 2));
    return { yaku, pinfu };
  }

  const { groups, pair } = interp;
  const shuntsu = groups.filter((g) => g.kind === 'shuntsu');
  const triplets = groups.filter(isTriplet);

  // 平和
  const pairIsYakuhai = isDragon(pair) || pair === sit.roundWind || pair === sit.seatWind;
  if (menzen && shuntsu.length === 4 && !pairIsYakuhai && interp.wait === 'ryanmen') {
    pinfu = true;
    yaku.push(y('平和', 1));
  }

  // 一盃口・二盃口
  if (menzen) {
    const starts = shuntsu.map((g) => g.tile).sort((a, b) => a - b);
    let peiko = 0;
    for (let i = 0; i + 1 < starts.length; i++) {
      if (starts[i] === starts[i + 1]) {
        peiko++;
        i++;
      }
    }
    if (peiko === 2) yaku.push(y('二盃口', 3));
    else if (peiko === 1) yaku.push(y('一盃口', 1));
  }

  // 役牌
  for (const g of triplets) {
    if (g.tile === HAKU) yaku.push(y('役牌 白', 1));
    if (g.tile === HATSU) yaku.push(y('役牌 發', 1));
    if (g.tile === CHUN) yaku.push(y('役牌 中', 1));
    if (g.tile === sit.seatWind) yaku.push(y(`自風 ${windName(g.tile)}`, 1));
    if (g.tile === sit.roundWind) yaku.push(y(`場風 ${windName(g.tile)}`, 1));
  }

  // 一気通貫
  for (let s = 0; s < 3; s++) {
    const b = s * 9;
    if ([b, b + 3, b + 6].every((t) => shuntsu.some((g) => g.tile === t))) {
      yaku.push(y('一気通貫', menzen ? 2 : 1));
    }
  }

  // 三色同順・三色同刻
  for (let n = 0; n < 9; n++) {
    if ([0, 9, 18].every((b) => shuntsu.some((g) => g.tile === b + n))) {
      yaku.push(y('三色同順', menzen ? 2 : 1));
      break;
    }
  }
  for (let n = 0; n < 9; n++) {
    if ([0, 9, 18].every((b) => triplets.some((g) => g.tile === b + n))) {
      yaku.push(y('三色同刻', 2));
      break;
    }
  }

  // 対々和・三暗刻・三槓子
  if (triplets.length === 4) yaku.push(y('対々和', 2));
  if (triplets.filter((g) => g.concealed).length === 3) yaku.push(y('三暗刻', 2));
  if (groups.filter((g) => g.kind === 'kantsu').length === 3) yaku.push(y('三槓子', 2));

  // 小三元
  if (triplets.filter((g) => isDragon(g.tile)).length === 2 && isDragon(pair)) yaku.push(y('小三元', 2));

  // 混全帯么九・純全帯么九
  if (shuntsu.length > 0 && isYaochu(pair) && groups.every(groupHasYaochu)) {
    if (hasHonor) yaku.push(y('混全帯么九', menzen ? 2 : 1));
    else yaku.push(y('純全帯么九', menzen ? 3 : 2));
  }

  return { yaku, pinfu };
}

function tilesOfMelds(hand: Hand): Tile[] {
  return hand.melds.flatMap((m) =>
    m.type === 'chi' ? [m.tile, m.tile + 1, m.tile + 2] : [m.tile, m.tile, m.tile],
  );
}

function detectChuuren(counts: number[]): boolean {
  for (let s = 0; s < 3; s++) {
    const b = s * 9;
    const suitCount = counts.slice(b, b + 9).reduce((a, c) => a + c, 0);
    if (suitCount !== 14) continue;
    const need = [3, 1, 1, 1, 1, 1, 1, 1, 3];
    if (need.every((n, i) => counts[b + i] >= n)) return true;
  }
  return false;
}

function detectPureChuuren(before: number[]): boolean {
  for (let s = 0; s < 3; s++) {
    const b = s * 9;
    const need = [3, 1, 1, 1, 1, 1, 1, 1, 3];
    if (need.every((n, i) => before[b + i] === n)) return true;
  }
  return false;
}
