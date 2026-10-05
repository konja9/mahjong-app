import { type Evaluation, evaluate } from './evaluate';
import { type Hand, type Meld, type Situation, allTiles, isMenzen } from './hand';
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

/** 実戦の分布に寄せた符の出題比率（60符以上はまれ） */
const FU_WEIGHTS = [
  [20, 7],
  [25, 8],
  [30, 42],
  [40, 30],
  [50, 8],
  [60, 3],
  [70, 1],
  [80, 0.4],
  [90, 0.3],
  [100, 0.2],
  [110, 0.1],
] as const;

/** 超大当り（PREMIUM）の BONUS で役満を出す割合。ほかの BONUS・RUSH は通常時と同じ分布 */
export const PREMIUM_YAKUMAN_RATE = 0.3;

/** 生成した手の符に応じた採用率（高い符は実戦ではまれなので間引く） */
function fuAcceptRate(fu: number): number {
  if (fu >= 70) return 0.05;
  if (fu >= 60) return 0.15;
  if (fu >= 50) return 0.5;
  return 1;
}

export function generateHayami(
  rules: Rules,
  f: Filters,
  rng: Rng = Math.random,
  premium = false,
): HayamiQuestion {
  for (;;) {
    const dealer = rollSeat(rng, f);
    const tsumo = rollTsumo(rng, f);
    // 超大当りの BONUS だけは役満（数え役満）が出やすい
    const han =
      premium && rng() < PREMIUM_YAKUMAN_RATE
        ? 13
        : weighted(rng, [
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

// ------------------------------------------------------------ 稽古の絞り込み

export type CallFilter = 'any' | 'menzen' | 'open';
export type ShapeFilter = 'any' | 'chiitoi' | 'pinfu' | 'kuipinfu' | 'kantsu' | 'tanki' | 'shanpon';
/** real：実戦寄り（高い符は間引く） / even：符の値（20・25・30・40・50・60・70〜）ごとに均等 */
export type FuDist = 'real' | 'even';

export interface HandConstraints {
  call: CallFilter;
  shape: ShapeFilter;
  dist: FuDist;
  /** 苦手ドリル：この条件を満たす手だけを出す */
  want?: (q: HandQuestion) => boolean;
}

export const SHAPE_NAMES: Record<ShapeFilter, string> = {
  any: 'すべて',
  chiitoi: '七対子',
  pinfu: '平和',
  kuipinfu: '喰い平和',
  kantsu: '槓子',
  tanki: '単騎',
  shanpon: 'シャンポン',
};

/** 形が決める鳴きの有無（七対子・平和は門前、喰い平和は副露）。決めない形は null */
export function shapeCall(shape: ShapeFilter): CallFilter | null {
  if (shape === 'chiitoi' || shape === 'pinfu') return 'menzen';
  if (shape === 'kuipinfu') return 'open';
  return null;
}

export const FU_BUCKETS = [20, 25, 30, 40, 50, 60, 70] as const;
/** 符を均等に出すときの区分（70符以上は1つにまとめる） */
export const fuBucket = (fu: number): number => (fu >= 70 ? 70 : fu);

export function matchesShape(q: HandQuestion, shape: ShapeFilter): boolean {
  const { ev } = q;
  switch (shape) {
    case 'any':
      return true;
    case 'chiitoi':
      return ev.interp.form === 'chiitoi';
    case 'pinfu':
      return ev.yaku.some((y) => y.name === '平和');
    case 'kuipinfu':
      return ev.fu.items.some((i) => i.label.startsWith('喰い平和'));
    case 'kantsu':
      return ev.interp.form === 'standard' && ev.interp.groups.some((g) => g.kind === 'kantsu');
    case 'tanki':
      return ev.interp.form === 'standard' && ev.interp.wait === 'tanki';
    case 'shanpon':
      return ev.interp.form === 'standard' && ev.interp.wait === 'shanpon';
  }
}

export function matchesConstraints(q: HandQuestion, c: HandConstraints): boolean {
  const call = shapeCall(c.shape) ?? c.call;
  if (call !== 'any' && isMenzen(q.hand) !== (call === 'menzen')) return false;
  if (!matchesShape(q, c.shape)) return false;
  return !c.want || c.want(q);
}

/** 均等のとき、この絞り込みで出せる符の区分 */
export function feasibleBuckets(c: HandConstraints, f: Filters): number[] {
  const call = shapeCall(c.shape) ?? c.call;
  const tsumoOk = f.win !== 'ron';
  const ronOk = f.win !== 'tsumo';
  switch (c.shape) {
    case 'chiitoi':
      return [25];
    case 'pinfu':
      return [...(tsumoOk ? [20] : []), ...(ronOk ? [30] : [])];
    case 'kuipinfu':
      return [30];
    default: {
      const out: number[] = [];
      // 20符は平和ツモ、25符は七対子だけ
      if (c.shape === 'any' && call !== 'open' && tsumoOk) out.push(20);
      if (c.shape === 'any' && call !== 'open') out.push(25);
      out.push(30, 40, 50, 60, 70);
      return out;
    }
  }
}

/** 生成の確率を絞り込みに寄せる（最後は matchesConstraints で判定する） */
interface Bias {
  flavor?: Flavor;
  openRate?: number;
  koutsuRate?: number;
  kanRate?: number;
  winOn?: 'pair' | 'koutsu';
}

function biasFor(c: HandConstraints, target: number | null): Bias {
  const call = shapeCall(c.shape) ?? c.call;
  const b: Bias = {};
  if (call === 'menzen') b.openRate = 0;
  if (call === 'open') b.openRate = 1;
  switch (c.shape) {
    case 'chiitoi':
      b.flavor = 'chiitoi';
      break;
    case 'pinfu':
    case 'kuipinfu':
      b.koutsuRate = 0;
      break;
    case 'kantsu':
      b.koutsuRate = 0.5;
      b.kanRate = 0.7;
      break;
    case 'tanki':
      b.winOn = 'pair';
      break;
    case 'shanpon':
      b.koutsuRate = 0.6;
      b.winOn = 'koutsu';
      break;
  }
  if (target === 25) b.flavor = 'chiitoi';
  if (target === 20) {
    b.koutsuRate = 0;
    b.openRate = 0;
  }
  // 高い符は刻子（とくに么九）が多いほど出やすい
  if (target !== null && target >= 50 && b.koutsuRate === undefined) b.koutsuRate = target >= 60 ? 0.7 : 0.55;
  if (target !== null && target >= 30 && b.flavor === undefined && c.shape !== 'chiitoi') b.flavor = 'free';
  return b;
}

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

function buildPlan(rng: Rng, flavor: Flavor, used: number[], koutsuOverride?: number): Plan | null {
  const suit = Math.floor(rng() * 3);
  const allowed = allowedTiles(flavor, suit);
  const groups: Plan['groups'] = [];
  const honorKoutsuRate = flavor === 'yakuhai' ? 0.6 : flavor === 'honitsu' ? 0.45 : 0.18;
  const koutsuRate = koutsuOverride ?? (flavor === 'toitoi' ? 1 : 0.32);

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

function buildStandard(rng: Rng, flavor: Flavor, openRate: number, bias: Bias = {}): Built | null {
  const used = new Array<number>(34).fill(0);
  const plan = buildPlan(rng, flavor, used, bias.koutsuRate);
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
      if (canKan && rng() < (bias.kanRate ?? 0.06)) {
        used[g.tile]++;
        kans++;
        melds.push({ type: 'minkan', tile: g.tile });
      } else melds.push({ type: 'pon', tile: g.tile });
    } else if (canKan && rng() < (bias.kanRate ?? 0.04)) {
      used[g.tile]++;
      kans++;
      melds.push({ type: 'ankan', tile: g.tile });
    } else closedTiles.push(g.tile, g.tile, g.tile);
  });

  const winIdx = pickWin(rng, closedTiles, plan.pair, bias.winOn);
  const winTile = closedTiles[winIdx];
  const concealed = closedTiles.filter((_, i) => i !== winIdx).sort((a, b) => a - b);
  return { hand: { concealed, melds, winTile, akaTiles: [] }, kans };
}

/** 和了牌の位置。winOn の指定があれば雀頭（単騎）か手の内の刻子（シャンポン）から選ぶ */
function pickWin(rng: Rng, closed: Tile[], pair: Tile, winOn?: Bias['winOn']): number {
  if (winOn) {
    const counts = toCounts(closed);
    const idx = closed.flatMap((t, i) => ((winOn === 'pair' ? t === pair : t !== pair && counts[t] >= 3) ? [i] : []));
    if (idx.length) return pick(rng, idx);
  }
  return Math.floor(rng() * closed.length);
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

/** 役満の手を直接作る（確変中の役満ブースト用） */
function buildYakuman(rng: Rng): Built | null {
  const kind = weighted(rng, [
    ['daisangen', 30],
    ['suuankou', 25],
    ['kokushi', 15],
    ['shousuushii', 15],
    ['tsuuiisou', 15],
  ] as const);
  if (kind === 'kokushi') return buildKokushi(rng);

  const used = new Array<number>(34).fill(0);
  const koutsu: Tile[] = [];
  let pair: Tile;
  const numeric = () => {
    for (;;) {
      const t = Math.floor(rng() * 27);
      if (used[t] === 0) {
        used[t] = 1;
        return t;
      }
    }
  };
  if (kind === 'daisangen') {
    koutsu.push(31, 32, 33, numeric());
    pair = numeric();
  } else if (kind === 'shousuushii') {
    const winds = [EAST, SOUTH, WEST, NORTH].sort(() => rng() - 0.5);
    koutsu.push(winds[0], winds[1], winds[2], numeric());
    pair = winds[3];
  } else if (kind === 'tsuuiisou') {
    const honors = [27, 28, 29, 30, 31, 32, 33].sort(() => rng() - 0.5);
    koutsu.push(...honors.slice(0, 4));
    pair = honors[4];
  } else {
    // 四暗刻単騎
    while (koutsu.length < 4) {
      const t = Math.floor(rng() * 34);
      if (!koutsu.includes(t)) koutsu.push(t);
    }
    do pair = Math.floor(rng() * 34);
    while (koutsu.includes(pair));
  }
  const melds: Meld[] = [];
  const closed: Tile[] = [pair, pair];
  for (const t of koutsu) {
    if (kind !== 'suuankou' && melds.length < 2 && rng() < 0.3) melds.push({ type: 'pon', tile: t });
    else closed.push(t, t, t);
  }
  // 四暗刻は単騎待ちで和了（ロンでも四暗刻が成立する）
  const winIdx = kind === 'suuankou' ? 0 : Math.floor(rng() * closed.length);
  const winTile = closed[winIdx];
  const concealed = closed.filter((_, i) => i !== winIdx).sort((a, b) => a - b);
  return { hand: { concealed, melds, winTile, akaTiles: [] }, kans: 0 };
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
  /** 超大当りの BONUS：実戦は役満が出やすい */
  premium?: boolean;
  /** 稽古の絞り込み。指定がなければ実戦寄りの分布 */
  constraints?: HandConstraints;
}

export function generateHandQuestion({
  mode,
  rules,
  filters,
  rng = Math.random,
  premium = false,
  constraints,
}: HandGenOptions): HandQuestion {
  // 均等：出せる符の区分から目標を1つ選ぶ。見つからなければ目標を外す
  const buckets = constraints?.dist === 'even' ? feasibleBuckets(constraints, filters) : [];
  let target: number | null = buckets.length ? pick(rng, buckets) : null;
  const TARGET_TRIES = 3000;
  let bias = constraints ? biasFor(constraints, target) : {};
  for (let attempt = 0; attempt < 8000; attempt++) {
    if (target !== null && attempt === TARGET_TRIES) {
      target = null;
      bias = biasFor(constraints!, null);
    }
    if (!constraints && attempt >= 5000) break;
    const flavor: Flavor = bias.flavor ?? weighted(rng, [
      ['free', 40],
      ['tanyao', 14],
      ['yakuhai', 14],
      ['honitsu', 9],
      ['chinitsu', 4],
      ['toitoi', 4],
      ['chiitoi', mode === 'fu' ? 3 : 6],
      ['kokushi', mode === 'fu' ? 0 : 0.5],
    ] as const);
    const yakumanRate = mode === 'jissen' && premium ? PREMIUM_YAKUMAN_RATE : 0;
    const yakumanBoost = rng() < yakumanRate;
    const built = yakumanBoost
      ? buildYakuman(rng)
      : flavor === 'chiitoi'
        ? buildChiitoi(rng)
        : flavor === 'kokushi'
          ? buildKokushi(rng)
          : buildStandard(rng, flavor, bias.openRate ?? (mode === 'fu' ? 0.4 : 0.45), bias);
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
    if (constraints) {
      const q: HandQuestion = { mode, hand, sit, ev };
      if (!matchesConstraints(q, constraints)) continue;
      if (target !== null && fuBucket(ev.fu.fu) !== target) continue;
    }
    // 符の分布を実戦に寄せる（役満は符と無関係なので対象外）
    if (constraints?.dist !== 'even' && !ev.yakuman && rng() >= fuAcceptRate(ev.fu.fu)) continue;
    // 役満は出すぎないように間引く（超大当りの BONUS は間引かない）
    if (ev.yakuman && !premium && rng() < 0.5) continue;
    // ドラ過多の問題は間引く
    if (ev.han >= 8 && !ev.yakuman && rng() < 0.6) continue;
    return { mode, hand, sit, ev };
  }
  throw new Error('failed to generate question');
}

export function generateQuestion(
  mode: Mode,
  rules: Rules,
  filters: Filters,
  rng: Rng = Math.random,
  premium = false,
  constraints?: HandConstraints,
): Question {
  if (mode === 'hayami') return generateHayami(rules, filters, rng, premium);
  return generateHandQuestion({ mode, rules, filters, rng, premium, constraints });
}
