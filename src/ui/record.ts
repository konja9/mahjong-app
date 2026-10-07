import type { Mode } from '../core/generator';
import type { Rank } from './exam';
import { load, save } from './storage';

/**
 * 成績の記録。答えるたびに1問ずつ残し、腕前（直近50問）・日ごとの推移・苦手・昇段試験の目安を出す。
 * パチンコも稽古も記録する。チュートリアルと試験の問題は入れない（試験は受験記録として別に残す）
 */

export const MODES: Mode[] = ['hayami', 'fu', 'jissen'];
export const MODE_NAMES: Record<Mode, string> = { hayami: '早見', fu: '符計算', jissen: '実戦' };
/** 状況（0 子のロン・1 子のツモ・2 親のロン・3 親のツモ） */
export const SIT_NAMES = ['子のロン', '子のツモ', '親のロン', '親のツモ'];

/** 1問の記録 */
export interface AnswerLog {
  m: Mode;
  ok: boolean;
  /** 答えるのにかかった秒（段階練習の問題は入れない） */
  t?: number;
  /** 稽古で答えた */
  k?: boolean;
  /** 数値入力で答えた */
  i?: boolean;
  s: number;
  d: string;
  /** 早見の翻・符 */
  h?: number;
  f?: number;
}

export interface DayStat {
  n: number;
  c: number;
  tSum: number;
  tN: number;
}

export interface ExamLog {
  d: string;
  /** 段位の番号（1〜10） */
  rank: number;
  correct: number;
  avg: number;
  pass: boolean;
}

export interface RecordData {
  /** 記録をつけ始めた日 */
  since: string;
  answers: AnswerLog[];
  days: Record<string, Partial<Record<Mode, DayStat>>>;
  total: Partial<Record<Mode, { n: number; c: number }>>;
  streak: number;
  bestStreak: number;
  exams: ExamLog[];
}

const KEY = 'tensu.record.v1';
export const ANSWERS_MAX = 600;
export const DAYS_MAX = 120;
export const EXAMS_MAX = 30;
/** 腕前を出す直近の問題数 */
export const RECENT_N = 50;
/** これより少ないと「まだ記録が少ない」 */
export const RECENT_MIN = 10;

export const freshRecord = (day: string): RecordData => ({ since: day, answers: [], days: {}, total: {}, streak: 0, bestStreak: 0, exams: [] });

const isMode = (m: unknown): m is Mode => m === 'hayami' || m === 'fu' || m === 'jissen';
const num = (v: unknown, d = 0): number => (typeof v === 'number' && Number.isFinite(v) ? v : d);

/** 保存されていたものを読み直す（壊れたところは捨てる） */
export function migrateRecord(raw: unknown, day: string): RecordData {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<RecordData>;
  const answers = (Array.isArray(r.answers) ? r.answers : [])
    .filter((a): a is AnswerLog => !!a && isMode(a.m) && typeof a.d === 'string')
    .map((a) => {
      const out: AnswerLog = { m: a.m, ok: !!a.ok, s: Math.min(3, Math.max(0, Math.floor(num(a.s)))), d: a.d };
      if (typeof a.t === 'number' && Number.isFinite(a.t) && a.t >= 0) out.t = a.t;
      if (a.k) out.k = true;
      if (a.i) out.i = true;
      if (typeof a.h === 'number') out.h = a.h;
      if (typeof a.f === 'number') out.f = a.f;
      return out;
    })
    .slice(-ANSWERS_MAX);
  const days: RecordData['days'] = {};
  if (r.days && typeof r.days === 'object') {
    for (const [d, v] of Object.entries(r.days)) {
      if (!v || typeof v !== 'object') continue;
      const day: Partial<Record<Mode, DayStat>> = {};
      for (const m of MODES) {
        const s = (v as Record<string, DayStat | undefined>)[m];
        if (s && num(s.n) > 0) day[m] = { n: num(s.n), c: num(s.c), tSum: num(s.tSum), tN: num(s.tN) };
      }
      days[d] = day;
    }
  }
  const total: RecordData['total'] = {};
  for (const m of MODES) {
    const t = r.total?.[m];
    if (t && num(t.n) > 0) total[m] = { n: num(t.n), c: num(t.c) };
  }
  const exams = (Array.isArray(r.exams) ? r.exams : [])
    .filter((e): e is ExamLog => !!e && typeof e.d === 'string' && num(e.rank) >= 1)
    .map((e) => ({ d: e.d, rank: num(e.rank), correct: num(e.correct), avg: num(e.avg), pass: !!e.pass }))
    .slice(-EXAMS_MAX);
  return {
    since: typeof r.since === 'string' ? r.since : day,
    answers,
    days: trimDays(days),
    total,
    streak: num(r.streak),
    bestStreak: num(r.bestStreak),
    exams,
  };
}

function trimDays(days: RecordData['days']): RecordData['days'] {
  const keys = Object.keys(days).sort();
  if (keys.length <= DAYS_MAX) return days;
  const out: RecordData['days'] = {};
  for (const k of keys.slice(-DAYS_MAX)) out[k] = days[k];
  return out;
}

export function loadRecord(day: string): RecordData {
  return migrateRecord(load<unknown>(KEY, undefined), day);
}

export const saveRecord = (r: RecordData): void => save(KEY, r);

export interface AnswerInput {
  mode: Mode;
  ok: boolean;
  /** 秒（段階練習の問題は渡さない） */
  sec?: number;
  keiko: boolean;
  input: boolean;
  dealer: boolean;
  tsumo: boolean;
  han?: number;
  fu?: number;
}

/** 1問を記録する */
export function recordAnswer(r: RecordData, a: AnswerInput, day: string): void {
  const log: AnswerLog = { m: a.mode, ok: a.ok, s: (a.dealer ? 2 : 0) + (a.tsumo ? 1 : 0), d: day };
  if (a.sec !== undefined && Number.isFinite(a.sec)) log.t = Math.round(a.sec * 10) / 10;
  if (a.keiko) log.k = true;
  if (a.input) log.i = true;
  if (a.han !== undefined) log.h = a.han;
  if (a.fu !== undefined) log.f = a.fu;
  r.answers.push(log);
  if (r.answers.length > ANSWERS_MAX) r.answers.splice(0, r.answers.length - ANSWERS_MAX);
  const d = (r.days[day] ??= {});
  const s = (d[a.mode] ??= { n: 0, c: 0, tSum: 0, tN: 0 });
  s.n++;
  if (a.ok) s.c++;
  if (log.t !== undefined) {
    s.tSum = Math.round((s.tSum + log.t) * 10) / 10;
    s.tN++;
  }
  r.days = trimDays(r.days);
  const t = (r.total[a.mode] ??= { n: 0, c: 0 });
  t.n++;
  if (a.ok) t.c++;
  r.streak = a.ok ? r.streak + 1 : 0;
  r.bestStreak = Math.max(r.bestStreak, r.streak);
}

/** 昇段試験の結果を記録する（不合格も） */
export function recordExam(r: RecordData, e: Omit<ExamLog, 'd'>, day: string): void {
  r.exams.push({ ...e, avg: Math.round(e.avg * 10) / 10, d: day });
  if (r.exams.length > EXAMS_MAX) r.exams.splice(0, r.exams.length - EXAMS_MAX);
}

export interface Recent {
  n: number;
  c: number;
  /** 正答率（0〜1。問題がなければ null） */
  acc: number | null;
  /** 平均の秒（正解・不正解を問わない。記録がなければ null） */
  avg: number | null;
}

function summarize(list: AnswerLog[]): Recent {
  const c = list.filter((a) => a.ok).length;
  const ts = list.map((a) => a.t).filter((t): t is number => t !== undefined);
  return { n: list.length, c, acc: list.length ? c / list.length : null, avg: ts.length ? ts.reduce((x, y) => x + y, 0) / ts.length : null };
}

const ofModes = (r: RecordData, modes: Mode[], input = false) => r.answers.filter((a) => modes.includes(a.m) && (!input || a.i));

/** 直近 n 問（skip 問より前）の成績 */
export function recent(r: RecordData, mode: Mode | Mode[], n = RECENT_N, skip = 0): Recent {
  const list = ofModes(r, Array.isArray(mode) ? mode : [mode]);
  return summarize(list.slice(Math.max(0, list.length - skip - n), list.length - skip));
}

export interface Trend {
  now: Recent;
  /** その前の n 問（足りなければ null） */
  prev: Recent | null;
  /** 正答率の差（ポイント。比べられなければ null） */
  dAcc: number | null;
  /** 平均秒の差（マイナスが速くなった） */
  dSec: number | null;
}

export function trend(r: RecordData, mode: Mode, n = RECENT_N): Trend {
  const now = recent(r, mode, n);
  const total = ofModes(r, [mode]).length;
  // 前の区間は、直近の区間と同じ数だけそろっていなくても RECENT_MIN 問あれば比べる
  const prev = total - now.n >= RECENT_MIN && now.n >= RECENT_MIN ? recent(r, mode, n, now.n) : null;
  return {
    now,
    prev,
    dAcc: prev && now.acc !== null && prev.acc !== null ? Math.round((now.acc - prev.acc) * 100) : null,
    dSec: prev && now.avg !== null && prev.avg !== null ? Math.round((now.avg - prev.avg) * 10) / 10 : null,
  };
}

export interface DayPoint {
  d: string;
  n: number;
  acc: number;
  avg: number | null;
}

/** 遊んだ日ごとの成績（古い順、直近 days 日分） */
export function dailySeries(r: RecordData, mode: Mode, days = 30): DayPoint[] {
  return Object.keys(r.days)
    .sort()
    .map((d) => ({ d, s: r.days[d][mode] }))
    .filter((x): x is { d: string; s: DayStat } => !!x.s && x.s.n > 0)
    .slice(-days)
    .map(({ d, s }) => ({ d, n: s.n, acc: s.c / s.n, avg: s.tN ? s.tSum / s.tN : null }));
}

/** 状況ごとの成績（直近 n 問。mode を省くとすべての種目） */
export function bySituation(r: RecordData, mode?: Mode, n = 200): { label: string; n: number; c: number }[] {
  const list = (mode ? ofModes(r, [mode]) : r.answers).slice(-n);
  return SIT_NAMES.map((label, s) => {
    const xs = list.filter((a) => a.s === s);
    return { label, n: xs.length, c: xs.filter((a) => a.ok).length };
  });
}

/** 早見でよく間違える翻・符（間違えた数の多い順） */
export function missedHayami(r: RecordData, top = 5): { han: number; fu: number; miss: number; n: number }[] {
  const map = new Map<string, { han: number; fu: number; miss: number; n: number }>();
  for (const a of r.answers) {
    if (a.m !== 'hayami' || a.h === undefined) continue;
    // 満貫以上は符を問わないのでまとめる
    const fu = a.h >= 5 ? 0 : (a.f ?? 0);
    const key = `${a.h}-${fu}`;
    const e = map.get(key) ?? { han: a.h, fu, miss: 0, n: 0 };
    e.n++;
    if (!a.ok) e.miss++;
    map.set(key, e);
  }
  return [...map.values()]
    .filter((e) => e.miss > 0)
    .sort((a, b) => b.miss - a.miss || b.miss / b.n - a.miss / a.n)
    .slice(0, top);
}

export type TargetVerdict = 'few' | 'ready' | 'close' | 'far';

export interface ExamTarget {
  rank: Rank;
  /** 求められる正答率（0〜1）と平均秒 */
  needAcc: number;
  needSec: number | null;
  now: Recent;
  verdict: TargetVerdict;
  /** 足りないもの */
  shortAcc: number;
  shortSec: number;
}

/** 段位の基準と、同じ種目の直近の成績を比べる（名人は数値入力の答えだけで比べる） */
export function examTarget(rank: Rank, r: RecordData, n = RECENT_N): ExamTarget {
  const modes = [...new Set(rank.modes)];
  const list = ofModes(r, modes, rank.input);
  const now = summarize(list.slice(-n));
  const needAcc = rank.pass / rank.modes.length;
  const needSec = rank.avgSec;
  const shortAcc = now.acc === null ? needAcc : Math.max(0, needAcc - now.acc);
  const shortSec = needSec === null || now.avg === null ? 0 : Math.max(0, now.avg - needSec);
  let verdict: TargetVerdict;
  // 2つの種目を出す段位（4級・2級）は、どちらの種目も数問ずつ解いていないと判断しない
  const each = modes.every((m) => list.filter((x) => x.m === m).length >= Math.ceil(RECENT_MIN / modes.length));
  if (now.n < RECENT_MIN || !each || (needSec !== null && now.avg === null)) verdict = 'few';
  else if (shortAcc === 0 && shortSec === 0) verdict = 'ready';
  else if (shortAcc <= 0.1 && shortSec <= 3) verdict = 'close';
  else verdict = 'far';
  return { rank, needAcc, needSec, now, verdict, shortAcc, shortSec };
}

/** 今日の成績（すべての種目） */
export function today(r: RecordData, day: string): { n: number; c: number } {
  const d = r.days[day] ?? {};
  return MODES.reduce((s, m) => ({ n: s.n + (d[m]?.n ?? 0), c: s.c + (d[m]?.c ?? 0) }), { n: 0, c: 0 });
}
