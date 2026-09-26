/**
 * 日替わりミッション（ノーマルのみ）。
 * 運（出た役・大当り・RUSH・出玉）ではなく、実力で達成できる条件だけにする
 */
import type { Mode } from '../core/generator';

/** 実力で決まる条件の種類 */
export type MissionKind = 'modeCorrect' | 'streak' | 'fast' | 'accuracy' | 'fuNoMiss' | 'splitTsumo';
export const SKILL_KINDS: readonly MissionKind[] = ['modeCorrect', 'streak', 'fast', 'accuracy', 'fuNoMiss', 'splitTsumo'];

export interface MissionDef {
  id: string;
  kind: MissionKind;
  mode?: Mode;
  target: number;
  reward: number;
  label: string;
}

export const MISSION_POOL: MissionDef[] = [
  { id: 'hayami10', kind: 'modeCorrect', mode: 'hayami', target: 10, reward: 500, label: '早見で10問正解' },
  { id: 'fu10', kind: 'modeCorrect', mode: 'fu', target: 10, reward: 700, label: '符計算で10問正解' },
  { id: 'jissen10', kind: 'modeCorrect', mode: 'jissen', target: 10, reward: 900, label: '実戦で10問正解' },
  { id: 'streak10', kind: 'streak', target: 10, reward: 800, label: '10連続正解' },
  { id: 'fast15', kind: 'fast', target: 15, reward: 700, label: '速答で15問正解' },
  { id: 'acc20', kind: 'accuracy', target: 20, reward: 1000, label: '20問を正解率90%以上で解く' },
  { id: 'funomiss10', kind: 'fuNoMiss', target: 10, reward: 1200, label: '符計算を10問連続でミスなし' },
  { id: 'split8', kind: 'splitTsumo', target: 8, reward: 800, label: '子のツモ（支払いが分かれる問題）を8問正解' },
];

export interface MissionState {
  /** YYYY-MM-DD（その日のミッション） */
  date: string;
  ids: string[];
  progress: Record<string, number>;
  done: string[];
  /** 正解率ミッション用：今のまとまり（20問）の回答数と正解数 */
  block: { n: number; c: number };
  /** 符計算の連続正解 */
  fuRun: number;
}

export interface AnswerEvent {
  mode: Mode;
  correct: boolean;
  fast: boolean;
  /** 今の連続正解数（今回を含む） */
  streak: number;
  /** 子のツモ（支払いが2つに分かれる問題） */
  splitTsumo: boolean;
}

export function dateKey(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** 日付から決まる乱数で、その日の3つを選ぶ（同じ日は同じミッション） */
export function pickMissions(date: string, count = 3): string[] {
  let h = 2166136261;
  for (const ch of date) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  const rng = () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
  const ids = MISSION_POOL.map((m) => m.id);
  const out: string[] = [];
  while (out.length < count) {
    const id = ids.splice(Math.floor(rng() * ids.length), 1)[0];
    out.push(id);
  }
  return out;
}

export function freshMissions(date = dateKey()): MissionState {
  return { date, ids: pickMissions(date), progress: {}, done: [], block: { n: 0, c: 0 }, fuRun: 0 };
}

/** 日付が変わっていたら新しい日のミッションにする */
export function ensureToday(s: MissionState | undefined, date = dateKey()): MissionState {
  return s && s.date === date ? s : freshMissions(date);
}

export const missionDef = (id: string): MissionDef => MISSION_POOL.find((m) => m.id === id)!;

/** 回答1つで進み具合を更新する。新しく達成したミッションを返す */
export function recordAnswer(s: MissionState, e: AnswerEvent): MissionDef[] {
  s.fuRun = e.mode === 'fu' ? (e.correct ? s.fuRun + 1 : 0) : s.fuRun;
  s.block.n++;
  if (e.correct) s.block.c++;
  const accDone = s.block.n >= 20 && s.block.c >= 18;
  if (s.block.n >= 20) s.block = { n: 0, c: 0 };
  const finished: MissionDef[] = [];
  for (const id of s.ids) {
    if (s.done.includes(id)) continue;
    const m = missionDef(id);
    let v = s.progress[id] ?? 0;
    switch (m.kind) {
      case 'modeCorrect':
        if (e.correct && e.mode === m.mode) v++;
        break;
      case 'streak':
        v = Math.max(v, e.correct ? e.streak : 0);
        break;
      case 'fast':
        if (e.correct && e.fast) v++;
        break;
      case 'accuracy':
        v = accDone ? m.target : s.block.n;
        break;
      case 'fuNoMiss':
        v = Math.max(v, s.fuRun);
        break;
      case 'splitTsumo':
        if (e.correct && e.splitTsumo) v++;
        break;
    }
    s.progress[id] = Math.min(v, m.target);
    if (s.progress[id] >= m.target) {
      s.done.push(id);
      finished.push(m);
    }
  }
  return finished;
}
