import type { AchievementId } from './achievements';

/**
 * Google Play Games Services の ID。Play Console で実績・ランキングを作ると発行される文字列（例：CgkI…EAIQAQ）を貼る。
 * 空のものは送らない（作る前でもゲームはそのまま動く）。手順は store/play-games.md
 */
export const ACHIEVEMENT_IDS: Record<AchievementId, string> = {
  firstBonus: 'CgkIy5DXiMwFEAIQAQ',
  firstRush: 'CgkIy5DXiMwFEAIQAg',
  premium: 'CgkIy5DXiMwFEAIQAw',
  rank5kyu: 'CgkIy5DXiMwFEAIQBA',
  rankShodan: 'CgkIy5DXiMwFEAIQBQ',
  rankMeijin: 'CgkIy5DXiMwFEAIQBg',
  allSlots: 'CgkIy5DXiMwFEAIQBw',
  allParts: 'CgkIy5DXiMwFEAIQCA',
  storyEnd: 'CgkIy5DXiMwFEAIQCQ',
  allNotes: 'CgkIy5DXiMwFEAIQCg',
  streak20: 'CgkIy5DXiMwFEAIQCw',
  correct100: 'CgkIy5DXiMwFEAIQDA',
  correct1000: 'CgkIy5DXiMwFEAIQDQ',
  correct5000: 'CgkIy5DXiMwFEAIQDg',
  yakuman: 'CgkIy5DXiMwFEAIQDw',
};

export const LEADERBOARD_IDS = {
  /** 最大連続正解 */
  bestStreak: 'CgkIy5DXiMwFEAIQEA',
  /** 累計正解数 */
  totalCorrect: 'CgkIy5DXiMwFEAIQEQ',
};
