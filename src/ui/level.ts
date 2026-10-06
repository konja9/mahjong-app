import { load, save } from './storage';

/**
 * 経験値とレベル。exp は yan を稼ぐと貯まり、減らない（BET・買い物・破産・所持金のリセットでも消えない）。
 * Lv が上がるたびにパチふとくんの記憶（物語）が1話ずつ読める。Lv20 で完結し、そこから先は上限なし
 */

export interface LevelState {
  exp: number;
  /** 読んだ話（1〜） */
  read: number[];
}

const KEY = 'tensu.level.v1';

/** 物語が完結する Lv */
export const FINAL_LEVEL = 20;
/** 稽古で1問を全部正解したときの exp（パチンコの中級者の1問あたり約38の4分の1ほど） */
export const KEIKO_EXP = 10;

export const freshLevel = (): LevelState => ({ exp: 0, read: [] });

export function loadLevel(): LevelState {
  const s = load<LevelState>(KEY, freshLevel());
  if (!Number.isFinite(s.exp) || s.exp < 0) return freshLevel();
  return { exp: Math.floor(s.exp), read: Array.isArray(s.read) ? s.read.filter((n) => Number.isInteger(n)) : [] };
}

export function saveLevel(s: LevelState): void {
  save(KEY, s);
}

/**
 * Lv L から L+1 に上がるのに要る exp。最初の BONUS 1回で Lv2 になり、
 * Lv1→20 の合計が約19万（中級者・甘デジで約5,000問）になるようにしている
 */
export const expToNext = (level: number): number => Math.ceil((200 * level ** 1.63) / 10) * 10;

/** Lv1 から Lv に届くまでの exp の合計 */
export function expForLevel(level: number): number {
  let sum = 0;
  for (let l = 1; l < level; l++) sum += expToNext(l);
  return sum;
}

export interface LevelInfo {
  level: number;
  /** 今の Lv に入ってから貯めた exp */
  into: number;
  /** 次の Lv までに要る exp（今の Lv の分の全体） */
  need: number;
}

export function levelOf(exp: number): LevelInfo {
  let level = 1;
  let rest = exp;
  while (rest >= expToNext(level)) {
    rest -= expToNext(level);
    level++;
  }
  return { level, into: rest, need: expToNext(level) };
}

/** exp を足す。上がった Lv（新しい Lv の一覧）を返す */
export function addExp(s: LevelState, n: number): number[] {
  if (!(n > 0)) return [];
  const before = levelOf(s.exp).level;
  s.exp += Math.floor(n);
  const after = levelOf(s.exp).level;
  return Array.from({ length: after - before }, (_, i) => before + 1 + i);
}

/** 稽古の exp：答えた段階のうち正解した割合に応じて（全部正解で KEIKO_EXP） */
export const keikoExp = (ok: number, total: number): number => (total > 0 ? Math.round((KEIKO_EXP * ok) / total) : 0);

/** 読める話（Lv N で第N話まで。完結より先は増えない） */
export const unlockedChapters = (level: number): number => Math.min(level, FINAL_LEVEL);

/** まだ読んでいない、読める話 */
export function unreadChapters(s: LevelState): number[] {
  const n = unlockedChapters(levelOf(s.exp).level);
  return Array.from({ length: n }, (_, i) => i + 1).filter((c) => !s.read.includes(c));
}

export function markRead(s: LevelState, chapter: number): void {
  if (!s.read.includes(chapter)) s.read.push(chapter);
}

// ------------------------------------------------------------ 本日の収支（朝5時で区切る）

export interface DailyNet {
  /** 朝5時で区切った日付 YYYY-MM-DD */
  day: string;
  net: number;
}

const DAILY_KEY = 'tensu.daily.v1';
/** 1日の区切りの時刻 */
export const DAY_START_HOUR = 5;

export function dayKey(now = new Date()): string {
  const d = new Date(now.getTime() - DAY_START_HOUR * 3600_000);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** 日が変わっていたら 0 から数え直す */
export const ensureDay = (d: DailyNet | undefined, day = dayKey()): DailyNet => (d && d.day === day ? d : { day, net: 0 });

export function loadDaily(): DailyNet {
  return ensureDay(load<DailyNet | undefined>(DAILY_KEY, undefined));
}

export function saveDaily(d: DailyNet): void {
  save(DAILY_KEY, d);
}
