import type { AchievementId } from './achievements';

/**
 * Google Play Games Services の ID。Play Console で実績・ランキングを作ると発行される文字列（例：CgkI…EAIQAQ）を貼る。
 * 空のものは送らない（作る前でもゲームはそのまま動く）。手順は store/play-games.md
 */
export const ACHIEVEMENT_IDS: Record<AchievementId, string> = {
  firstBonus: '',
  firstRush: '',
  premium: '',
  rank5kyu: '',
  rankShodan: '',
  rankMeijin: '',
  allSlots: '',
  allParts: '',
  storyEnd: '',
  allNotes: '',
  streak20: '',
  correct100: '',
  correct1000: '',
  correct5000: '',
  yakuman: '',
};

export const LEADERBOARD_IDS = {
  /** 最大連続正解 */
  bestStreak: '',
  /** 累計正解数 */
  totalCorrect: '',
};
