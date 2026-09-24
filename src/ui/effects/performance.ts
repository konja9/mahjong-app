/**
 * 演出の抽選（DOM 非依存）。
 * 回答確定時点で正誤が分かっているので、実機のように演出を正誤と連動させる。
 * 虹・キリン柄・金PUSH は正解時のみ（確定演出）。不正解時はガセ演出になりうる。
 */

export type Rng = () => number;
export type EffectLevel = 'off' | 'lite' | 'max';

export type Cutin = 'none' | 'reach' | 'gold' | 'zebra' | 'rainbow';
export type Push = 'none' | 'normal' | 'gold';
export type Notice = 'none' | 'swarm' | 'stepup' | 'text';

export interface Suspense {
  /** quick: 即判定 / cutin: カットインのみ / reel: 図柄リール */
  kind: 'quick' | 'cutin' | 'reel';
  cutin: Cutin;
  /** 擬似連の回数（0〜2） */
  pseudo: number;
  push: Push;
  /** リールがそろうか（= 正解か） */
  hit: boolean;
}

export interface SuspenseInput {
  correct: boolean;
  /** 保留の色 0:青 1:緑 2:赤 3:金 4:虹 */
  lamp: number;
  /** 満貫以上など高打点の手 */
  highValue: boolean;
  /** 回答前の連チャン数 */
  streak: number;
  kakuhen: boolean;
  level: EffectLevel;
}

export const CONFIRMED_CUTINS: readonly Cutin[] = ['zebra', 'rainbow'];

function weighted<T>(rng: Rng, entries: readonly (readonly [T, number])[]): T {
  const total = entries.reduce((s, [, w]) => s + Math.max(0, w), 0);
  let r = rng() * total;
  for (const [v, w] of entries) {
    r -= Math.max(0, w);
    if (r < 0) return v;
  }
  return entries[entries.length - 1][0];
}

export function drawSuspense(inp: SuspenseInput, rng: Rng = Math.random): Suspense {
  const none: Suspense = { kind: 'quick', cutin: 'none', pseudo: 0, push: 'none', hit: inp.correct };
  if (inp.level === 'off') return none;

  const milestone = inp.correct && (inp.streak + 1) % 5 === 0;
  const base = inp.correct ? 0.22 : 0.14;
  const long =
    inp.lamp >= 2 || (inp.highValue && inp.correct) || milestone || rng() < base + (inp.kakuhen ? 0.1 : 0);
  if (!long) return none;

  const heat = inp.lamp + (inp.kakuhen ? 1 : 0) + (inp.highValue ? 1 : 0);
  const cutin: Cutin = inp.correct
    ? weighted(rng, [
        ['none', 26 - heat * 5],
        ['reach', 34 - heat * 3],
        ['gold', 22 + heat * 3],
        ['zebra', 9 + heat * 2],
        ['rainbow', 5 + heat * 2 + (inp.lamp >= 4 ? 30 : 0)],
      ] as const)
    : weighted(rng, [
        ['none', 45],
        ['reach', 40 + heat * 3],
        ['gold', 8 + heat * 2],
      ] as const);

  if (inp.level === 'lite') {
    return { kind: 'cutin', cutin: cutin === 'none' ? 'reach' : cutin, pseudo: 0, push: 'none', hit: inp.correct };
  }

  const pseudo = inp.correct
    ? weighted(rng, [[0, 45], [1, 32], [2, 23]] as const)
    : weighted(rng, [[0, 72], [1, 22], [2, 6]] as const);
  const push: Push = inp.correct
    ? weighted(rng, [['none', 45], ['normal', 33], ['gold', 22]] as const)
    : weighted(rng, [['none', 68], ['normal', 32]] as const);

  return { kind: 'reel', cutin, pseudo, push, hit: inp.correct };
}

/** 問題表示時の予告（回答前なので正誤は使わない） */
export function drawNotice(lamp: number, streak: number, kakuhen: boolean, level: EffectLevel, rng: Rng = Math.random): Notice {
  if (level === 'off') return 'none';
  const p = 0.1 + lamp * 0.09 + (kakuhen ? 0.15 : 0) + Math.min(streak, 10) * 0.01;
  if (rng() >= p) return 'none';
  if (level === 'lite') return 'text';
  return weighted(rng, [
    ['text', 40],
    ['swarm', 30 + lamp * 5],
    ['stepup', 30 + lamp * 5],
  ] as const);
}

export type WinTier = 0 | 1 | 2 | 3;
