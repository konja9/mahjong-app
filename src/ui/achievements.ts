import { load, save } from './storage';

/**
 * Google Play Games の実績（15個）。今の状態から「取れている実績」を出す純粋関数と、送った実績の控え。
 * 名前と説明は Play Console に入れる文（store/play-games.md にも同じ表）
 */

export type AchievementId =
  | 'firstBonus'
  | 'firstRush'
  | 'premium'
  | 'rank5kyu'
  | 'rankShodan'
  | 'rankMeijin'
  | 'allSlots'
  | 'allParts'
  | 'storyEnd'
  | 'allNotes'
  | 'streak20'
  | 'correct100'
  | 'correct1000'
  | 'correct5000'
  | 'yakuman';

export interface AchievementDef {
  id: AchievementId;
  name: string;
  desc: string;
  /** すぐ取れる（序盤）か、やり込み用か */
  hard: boolean;
}

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'firstBonus', name: '初めての大当り', desc: 'パチンコで初めて BONUS を引く', hard: false },
  { id: 'firstRush', name: 'RUSH 突入', desc: '確変を引いて RUSH に入る', hard: false },
  { id: 'premium', name: '赤五筒', desc: 'PREMIUM（赤五筒）の超大当りを引く', hard: true },
  { id: 'rank5kyu', name: '5級', desc: '昇段試験の5級に受かる', hard: false },
  { id: 'rankShodan', name: '初段', desc: '昇段試験の初段に受かる', hard: false },
  { id: 'rankMeijin', name: '名人', desc: '昇段試験の名人に受かる', hard: true },
  { id: 'allSlots', name: '台の鍵をすべて開く', desc: '改造の枠を5つとも開く', hard: true },
  { id: 'allParts', name: '改造パーツ一式', desc: '改造パーツを12種類すべて手に入れる', hard: false },
  { id: 'storyEnd', name: 'すべて思い出した', desc: 'パチふとくんの記憶（全20話）が戻る', hard: true },
  { id: 'allNotes', name: '帳面の最後の頁', desc: '帳面を10頁すべて読む', hard: true },
  { id: 'streak20', name: '20連続正解', desc: '20問続けて正解する', hard: false },
  { id: 'correct100', name: '正解 100問', desc: '合わせて100問に正解する', hard: false },
  { id: 'correct1000', name: '正解 1000問', desc: '合わせて1000問に正解する', hard: false },
  { id: 'correct5000', name: '正解 5000問', desc: '合わせて5000問に正解する', hard: true },
  { id: 'yakuman', name: '役満を数えた', desc: '役満の手の点数に正解する', hard: false },
];

/** 実績を判定するのに要る今の状態 */
export interface AchievementState {
  /** 大当りの回数・RUSH に入った回数・PREMIUM の回数（これまでの合計） */
  hits: number;
  rushes: number;
  premiums: number;
  /** 受かった段位の数（1 で5級 … 6 で初段 … 10 で名人） */
  rank: number;
  slots: number;
  ownedParts: number;
  level: number;
  notesRead: number;
  bestStreak: number;
  totalCorrect: number;
  yakuman: number;
}

const RULES: Record<AchievementId, (s: AchievementState) => boolean> = {
  firstBonus: (s) => s.hits >= 1,
  firstRush: (s) => s.rushes >= 1,
  premium: (s) => s.premiums >= 1,
  rank5kyu: (s) => s.rank >= 1,
  rankShodan: (s) => s.rank >= 6,
  rankMeijin: (s) => s.rank >= 10,
  allSlots: (s) => s.slots >= 5,
  allParts: (s) => s.ownedParts >= 12,
  storyEnd: (s) => s.level >= 20,
  allNotes: (s) => s.notesRead >= 10,
  streak20: (s) => s.bestStreak >= 20,
  correct100: (s) => s.totalCorrect >= 100,
  correct1000: (s) => s.totalCorrect >= 1000,
  correct5000: (s) => s.totalCorrect >= 5000,
  yakuman: (s) => s.yakuman >= 1,
};

/** 今の状態で取れている実績 */
export function earnedAchievements(s: AchievementState): AchievementId[] {
  return ACHIEVEMENTS.map((a) => a.id).filter((id) => RULES[id](s));
}

/** 取れている実績のうち、まだ送っていないもの */
export const newAchievements = (s: AchievementState, sent: AchievementId[]): AchievementId[] =>
  earnedAchievements(s).filter((id) => !sent.includes(id));

// ------------------------------------------------------------ 実績のための数え（大当り・RUSH・PREMIUM・役満）と、送った実績の控え

export interface AchievementLog {
  hits: number;
  rushes: number;
  premiums: number;
  yakuman: number;
  /** Play Games に送った実績 */
  sent: AchievementId[];
}

const KEY = 'tensu.achievements.v1';
const IDS = new Set(ACHIEVEMENTS.map((a) => a.id));
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0);

export function loadAchievementLog(): AchievementLog {
  const r = load<Partial<AchievementLog>>(KEY, {});
  return {
    hits: num(r.hits),
    rushes: num(r.rushes),
    premiums: num(r.premiums),
    yakuman: num(r.yakuman),
    sent: (Array.isArray(r.sent) ? r.sent : []).filter((id): id is AchievementId => IDS.has(id as AchievementId)),
  };
}

export const saveAchievementLog = (l: AchievementLog): void => save(KEY, l);
