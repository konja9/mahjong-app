import type { Mode } from './generator';

/** プラクティスのスコア：基本点 × 速さ倍率（即答で最大3倍、目安時間以上で1倍） */
export const SCORE_TABLE: Record<Mode, { base: number; par: number }> = {
  hayami: { base: 100, par: 8 },
  fu: { base: 150, par: 20 },
  jissen: { base: 200, par: 25 },
};

export function speedMultiplier(mode: Mode, seconds: number): number {
  const { par } = SCORE_TABLE[mode];
  return 1 + 2 * Math.max(0, 1 - seconds / par);
}

export function practiceScore(mode: Mode, correct: boolean, seconds: number): number {
  if (!correct) return 0;
  return Math.round((SCORE_TABLE[mode].base * speedMultiplier(mode, seconds)) / 10) * 10;
}
