import { levelOf } from './level';
import { rankName } from './exam';

/**
 * クラウドセーブ（Google Play Games の Saved Games）に入れる中身。
 * localStorage の tensu.* をまとめて1つの JSON にする。端末ごとのもの（広告削除の購入状態）は入れない。
 * どちらが進んでいるかは、経験値 → 段位 → 累計正解数 の順で比べる
 */

export const SAVE_PREFIX = 'tensu.';
/** 入れないキー：広告削除の購入状態は、端末ごとに Google Play から読み直す */
const SKIP = new Set(['tensu.adfree.v1']);
export const SAVE_VERSION = 1;

export interface CloudSave {
  v: number;
  /** 保存した時刻（ミリ秒） */
  at: number;
  data: Record<string, string>;
}

/** localStorage のような入れ物（テストでは Map を包む） */
export interface KeyStore {
  readonly length: number;
  key(i: number): string | null;
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem(k: string): void;
}

export function packSave(store: KeyStore, now = Date.now()): CloudSave {
  const data: Record<string, string> = {};
  for (let i = 0; i < store.length; i++) {
    const k = store.key(i);
    if (!k || !k.startsWith(SAVE_PREFIX) || SKIP.has(k)) continue;
    const v = store.getItem(k);
    if (v !== null) data[k] = v;
  }
  return { v: SAVE_VERSION, at: now, data };
}

/** クラウドから読んだ文字列を CloudSave に（壊れていれば null） */
export function parseSave(text: string | null | undefined): CloudSave | null {
  if (!text) return null;
  try {
    const o = JSON.parse(text) as Partial<CloudSave>;
    if (!o || typeof o !== 'object' || !o.data || typeof o.data !== 'object') return null;
    const data: Record<string, string> = {};
    for (const [k, v] of Object.entries(o.data)) if (k.startsWith(SAVE_PREFIX) && !SKIP.has(k) && typeof v === 'string') data[k] = v;
    return { v: Number(o.v) || SAVE_VERSION, at: Number(o.at) || 0, data };
  } catch {
    return null;
  }
}

/** クラウドの中身で端末の記録を置き換える（tensu.* を消してから書く。広告削除の購入状態は残す） */
export function applySave(store: KeyStore, save: CloudSave): void {
  const old: string[] = [];
  for (let i = 0; i < store.length; i++) {
    const k = store.key(i);
    if (k && k.startsWith(SAVE_PREFIX) && !SKIP.has(k)) old.push(k);
  }
  for (const k of old) store.removeItem(k);
  for (const [k, v] of Object.entries(save.data)) store.setItem(k, v);
}

export interface Progress {
  exp: number;
  rank: number;
  correct: number;
  /** 「Lv 12・初段」のような説明 */
  label: string;
}

const json = (s: string | undefined): Record<string, unknown> => {
  try {
    const o = s ? JSON.parse(s) : null;
    return o && typeof o === 'object' ? (o as Record<string, unknown>) : {};
  } catch {
    return {};
  }
};
const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

/** 記録の進み具合 */
export function progressOf(save: CloudSave): Progress {
  const exp = Math.max(0, Math.floor(n(json(save.data['tensu.level.v1']).exp)));
  const rank = Math.max(0, Math.floor(n(json(save.data['tensu.exam.v1']).rank)));
  const total = json(save.data['tensu.record.v1']).total as Record<string, { c?: unknown }> | undefined;
  const correct = total && typeof total === 'object' ? Object.values(total).reduce((s, t) => s + n(t?.c), 0) : 0;
  const lv = levelOf(exp).level;
  const name = rankName(Math.min(10, rank));
  return { exp, rank, correct, label: `Lv ${lv}${name ? `・${name}` : ''}` };
}

/** 端末とクラウドのどちらを使うか：push は端末をクラウドへ、ask はクラウドの方が進んでいるので聞く */
export function decide(local: CloudSave, cloud: CloudSave | null): 'push' | 'ask' | 'same' {
  if (!cloud) return 'push';
  const a = progressOf(local);
  const b = progressOf(cloud);
  const cmp = b.exp - a.exp || b.rank - a.rank || b.correct - a.correct;
  if (cmp > 0) return 'ask';
  if (cmp < 0) return 'push';
  return 'same';
}

/** スナップショットの「進み具合」（Play Games の画面で並べ替えに使われる数） */
export const progressValue = (save: CloudSave): number => progressOf(save).exp;
