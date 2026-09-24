import { type Evaluation, evaluate } from './evaluate';
import { type Hand, type Meld, type Situation, allTiles } from './hand';
import type { Rules } from './rules';
import { type ScoreResult, calcScore, isValidHanFu } from './score';
import { EAST, NORTH, SOUTH, type Tile, WEST, YAOCHU, isFive, isSimple, suitOf, toCounts } from './tiles';

export type Mode = 'hayami' | 'fu' | 'jissen';

export interface Filters {
  seat: 'any' | 'child' | 'dealer';
  win: 'any' | 'ron' | 'tsumo';
}

export interface HayamiQuestion {
  mode: 'hayami';
  han: number;
  fu: number;
  dealer: boolean;
  tsumo: boolean;
  score: ScoreResult;
}

export interface HandQuestion {
  mode: 'fu' | 'jissen';
  hand: Hand;
  sit: Situation;
  ev: Evaluation;
}

export type Question = HayamiQuestion | HandQuestion;

export type Rng = () => number;

const pick = <T>(rng: Rng, arr: readonly T[]): T => arr[Math.floor(rng() * arr.length)];

function weighted<T>(rng: Rng, entries: readonly (readonly [T, number])[]): T {
  const total = entries.reduce((s, [, w]) => s + w, 0);
  let r = rng() * total;
  for (const [v, w] of entries) {
    r -= w;
    if (r < 0) return v;
  }
  return entries[entries.length - 1][0];
}

function rollSeat(rng: Rng, f: Filters): boolean {
  if (f.seat === 'child') return false;
  if (f.seat === 'dealer') return true;
  return rng() < 0.3;
}

function rollTsumo(rng: Rng, f: Filters): boolean {
  if (f.win === 'ron') return false;
  if (f.win === 'tsumo') return true;
  return rng() < 0.45;
}

// ------------------------------------------------------------ 早見モード

const FU_WEIGHTS = [
  [20, 6],
  [25, 6],
  [30, 24],
  [40, 24],
  [50, 12],
  [60, 9],
  [70, 7],
  [80, 4],
  [90, 3],
  [100, 2],
  [110, 2],
] as const;

export function generateHayami(rules: Rules, f: Filters, rng: Rng = Math.random): HayamiQuestion {
  for (;;) {
    const dealer = rollSeat(rng, f);
    const tsumo = rollTsumo(rng, f);
    const han = weighted(rng, [
      [1, 16],
      [2, 26],
      [3, 26],
      [4, 20],
      [5, 4],
      [6, 3],
      [8, 2],
      [11, 1],
      [13, 1],
    ] as const);
    const fu = han >= 5 ? 0 : weighted(rng, FU_WEIGHTS);
    if (han < 5 && !isValidHanFu(han, fu, tsumo)) continue;
    return { mode: 'hayami', han, fu, dealer, tsumo, score: calcScore(han, fu, dealer, tsumo, rules) };
  }
}

// ------------------------------------------------------------ 手牌モード

type Flavor = 'free' | 'tanyao' | 'honitsu' | 'chinitsu' | 'yakuhai' | 'toitoi' | 'chiitoi' | 'kokushi';

interface Plan {
  groups: { kind: 'shuntsu' | 'koutsu'; tile: Tile }[];
  pair: Tile;
}

function allowedTiles(flavor: Flavor, suit: number): Tile[] {
  const all = Array.from({ length: 34 }, (_, i) => i);
  switch (flavor) {
    case 'tanyao':
      return all.filter(isSimple);
    case 'honitsu':
      return all.filter((t) => t >= 27 || suitOf(t) === suit);
    case 'chinitsu':
      return all.filter((t) => t < 27 && suitOf(t) === suit);
    default:
      return all;
  }
}

function buildPlan(rng: Rng, flavor: Flavor, used: number[]): Plan | null {
  const suit = Math.floor(rng() * 3);
  const allowed = allowedTiles(flavor, suit);
  const groups: Plan['groups'] = [];
  const honorKoutsuRate = flavor === 'yakuhai' ? 0.6 : flavor === 'honitsu' ? 0.45 : 0.25;
  const koutsuRate = flavor === 'toitoi' ? 1 : 0.32;

  for (let i = 0; i < 4; i++) {
    let ok = false;
    for (let attempt = 0; attempt < 30 && !ok; attempt++) {
      const wantKoutsu = rng() < koutsuRate;
      if (wantKoutsu) {
        const honors = allowed.filter((t) => t >= 27);
        const nums = allowed.filter((t) => t < 27);
        const pool = honors.length && rng() < honorKoutsuRate ? honors : nums.length ? nums : honors;
        const tile = pick(rng, pool);
        if (used[tile] + 3 > 4) continue;
        used[tile] += 3;
        groups.push({ kind: 'koutsu', tile });
        ok = true;
      } else {
        const starts = allowed.filter((t) => t < 27 && t % 9 <= 6 && allowed.includes(t + 2));
        if (!starts.length) continue;
        const tile = pick(rng, starts);
        if ([0, 1, 2].some((d) => used[tile + d] + 1 > 4)) continue;
        for (const d of [0, 1, 2]) used[tile + d]++;
        groups.push({ kind: 'shuntsu', tile });
        ok = true;
      }
    }
    if (!ok) return null;
  }
  const pairPool = allowed.filter((t) => used[t] + 2 <= 4);
  if (!pairPool.length) return null;
  const pair = pick(rng, pairPool);
  used[pair] += 2;
  return { groups, pair };
}

function pickIndicators(rng: Rng, used: number[], n: number): Tile[] {
  const out: Tile[] = [];
  while (out.length < n) {
    const t = Math.floor(rng() * 34);
    if (used[t] >= 4) continue;
    used[t]++;
    out.push(t);
  }
  return out;
}

interface Built {
  hand: Hand;
  kans: number;
}

function buildStandard(rng: Rng, flavor: Flavor, openRate: number): Built | null {
  const used = new Array<number>(34).fill(0);
  const plan = buildPlan(rng, flavor, used);
  if (!plan) return null;

  const melds: Meld[] = [];
  const closedTiles: Tile[] = [plan.pair, plan.pair];
  const open = rng() < openRate;
  const openCount = open ? weighted(rng, [[1, 45], [2, 35], [3, 16], [4, 4]] as const) : 0;
  const order = plan.groups.map((_, i) => i).sort(() => rng() - 0.5);
  const openIdx = new Set(order.slice(0, openCount));

  let kans = 0;
  plan.groups.forEach((g, i) => {
    if (g.kind === 'shuntsu') {
      if (openIdx.has(i)) melds.push({ type: 'chi', tile: g.tile });
      else closedTiles.push(g.tile, g.tile + 1, g.tile + 2);
      return;
    }
    const canKan = used[g.tile] === 3 && kans < 2;
    if (openIdx.has(i)) {
      if (canKan && rng() < 0.15) {
        used[g.tile]++;
        kans++;
        melds.push({ type: 'minkan', tile: g.tile });
      } else melds.push({ type: 'pon', tile: g.tile });
    } else if (canKan && rng() < 0.1) {
      used[g.tile]++;
      kans++;
      melds.push({ type: 'ankan', tile: g.tile });
    } else closedTiles.push(g.tile, g.tile, g.tile);
  });

  const winIdx = Math.floor(rng() * closedTiles.length);
  const winTile = closedTiles[winIdx];
  const concealed = closedTiles.filter((_, i) => i !== winIdx).sort((a, b) => a - b);
  return { hand: { concealed, melds, winTile, akaTiles: [] }, kans };
}

function buildChiitoi(rng: Rng): Built {
  const pairs = new Set<Tile>();
  const simpleBias = rng() < 0.3;
  while (pairs.size < 7) {
    const t = Math.floor(rng() * 34);
    if (simpleBias && !isSimple(t)) continue;
    pairs.add(t);
  }
  const tiles = [...pairs].flatMap((p) => [p, p]);
  const winIdx = Math.floor(rng() * tiles.length);
  const winTile = tiles[winIdx];
  const concealed = tiles.filter((_, i) => i !== winIdx).sort((a, b) => a - b);
  return { hand: { concealed, melds: [], winTile, akaTiles: [] }, kans: 0 };
}

function buildKokushi(rng: Rng): Built {
  const tiles = [...YAOCHU, pick(rng, YAOCHU)];
  const winIdx = Math.floor(rng() * tiles.length);
  const winTile = tiles[winIdx];
  const concealed = tiles.filter((_, i) => i !== winIdx).sort((a, b) => a - b);
  return { hand: { concealed, melds: [], winTile, akaTiles: [] }, kans: 0 };
}

export interface HandGenOptions {
  mode: 'fu' | 'jissen';
  rules: Rules;
  filters: Filters;
  rng?: Rng;
}

export function generateHandQuestion({ mode, rules, filters, rng = Math.random }: HandGenOptions): HandQuestion {
  for (let attempt = 0; attempt < 5000; attempt++) {
    const flavor: Flavor = weighted(rng, [
      ['free', 40],
      ['tanyao', 14],
      ['yakuhai', 14],
      ['honitsu', 9],
      ['chinitsu', 4],
      ['toitoi', 4],
      ['chiitoi', mode === 'fu' ? 3 : 6],
      ['kokushi', mode === 'fu' ? 0 : 0.5],
    ] as const);
    const built =
      flavor === 'chiitoi'
        ? buildChiitoi(rng)
        : flavor === 'kokushi'
          ? buildKokushi(rng)
          : buildStandard(rng, flavor, mode === 'fu' ? 0.4 : 0.45);
    if (!built) continue;
    const { hand, kans } = built;

    const menzen = hand.melds.every((m) => m.type === 'ankan');
    const dealer = rollSeat(rng, filters);
    const tsumo = rollTsumo(rng, filters);
    const seatWind = dealer ? EAST : pick(rng, [SOUTH, WEST, NORTH]);
    const roundWind = weighted(rng, [[EAST, 65], [SOUTH, 30], [WEST, 5]] as const);
    const riichi = menzen && rng() < 0.55;
    const doubleRiichi = riichi && rng() < 0.03;
    const ippatsu = riichi && rng() < 0.12;
    const rinshan = tsumo && kans > 0 && rng() < 0.2;
    const haitei = tsumo && !rinshan && rng() < 0.03;
    const houtei = !tsumo && rng() < 0.03;

    const used = toCounts(allTiles(hand));
    const indicatorCount = 1 + kans;
    const doraIndicators = pickIndicators(rng, used, indicatorCount);
    const uraIndicators = riichi ? pickIndicators(rng, used, indicatorCount) : [];

    if (rules.aka) {
      const tiles = allTiles(hand);
      for (const five of [4, 13, 22]) {
        if (tiles.some((t) => t === five && isFive(t)) && rng() < 0.4) hand.akaTiles.push(five);
      }
    }

    const sit: Situation = {
      tsumo,
      riichi: riichi && !doubleRiichi,
      doubleRiichi,
      ippatsu,
      roundWind,
      seatWind,
      doraIndicators,
      uraIndicators,
      haitei,
      houtei,
      rinshan,
      chankan: false,
    };

    const ev = evaluate(hand, sit, rules);
    if (!ev) continue;
    // 符モードでは符が意味を持つ（満貫未満）問題を中心にする
    if (mode === 'fu' && (ev.yakuman || ev.fu.fu === 0)) continue;
    if (mode === 'fu' && ev.han >= 5 && rng() < 0.8) continue;
    // 役満は出すぎないように間引く
    if (ev.yakuman && rng() < 0.5) continue;
    // ドラ過多の問題は間引く
    if (ev.han >= 8 && !ev.yakuman && rng() < 0.6) continue;
    return { mode, hand, sit, ev };
  }
  throw new Error('failed to generate question');
}

export function generateQuestion(mode: Mode, rules: Rules, filters: Filters, rng: Rng = Math.random): Question {
  if (mode === 'hayami') return generateHayami(rules, filters, rng);
  return generateHandQuestion({ mode, rules, filters, rng });
}
