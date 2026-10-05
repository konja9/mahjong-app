import { type Diagnosis, type FuElement, ELEMENT_NAMES } from '../core/diagnose';
import { evaluate } from '../core/evaluate';
import { type Filters, type HandConstraints, type HandQuestion, MAX_FU, type Mode, type Question, shapeCall } from '../core/generator';
import { type Hand, type Situation, isMenzen } from '../core/hand';
import type { Rules } from '../core/rules';
import { calcScore } from '../core/score';
import { load, save } from './storage';

/**
 * 稽古の記録：間違えた手（復習）と、符の要素ごとの正答率（苦手ドリル）。
 * パチンコで間違えた手もここに入り、稽古の復習で出す
 */

export type KeikoSource = 'normal' | 'review' | 'weak';

type Stored =
  | { mode: 'hayami'; han: number; fu: number; dealer: boolean; tsumo: boolean }
  | { mode: 'fu' | 'jissen'; hand: Hand; sit: Situation };

export interface ReviewItem {
  key: string;
  q: Stored;
  /** 復習で続けて正解した回数（REVIEW_CLEAR で一覧から外す） */
  hits: number;
}

export interface ElementStat {
  c: number;
  n: number;
}

export interface KeikoData {
  reviews: ReviewItem[];
  elements: Partial<Record<FuElement, ElementStat>>;
}

const KEY = 'tensu.keiko.v1';
export const REVIEW_MAX = 100;
export const REVIEW_CLEAR = 2;
/** 苦手を選ぶのに必要な、要素ごとの回答数 */
export const WEAK_MIN = 5;

export const ELEMENTS = Object.keys(ELEMENT_NAMES) as FuElement[];

export function loadKeiko(): KeikoData {
  const d = load<KeikoData>(KEY, { reviews: [], elements: {} });
  return { reviews: Array.isArray(d.reviews) ? d.reviews : [], elements: d.elements ?? {} };
}

export function saveKeiko(d: KeikoData): void {
  save(KEY, d);
}

function stored(q: Question): Stored {
  if (q.mode === 'hayami') return { mode: 'hayami', han: q.han, fu: q.fu, dealer: q.dealer, tsumo: q.tsumo };
  return { mode: q.mode, hand: q.hand, sit: q.sit };
}

export const reviewKey = (q: Question): string => JSON.stringify(stored(q));

/** 間違えた手を復習に入れる（同じ手ならやり直し）。上限を超えたら古いものから消す */
export function addReview(d: KeikoData, q: Question): void {
  const key = reviewKey(q);
  d.reviews = d.reviews.filter((r) => r.key !== key);
  d.reviews.push({ key, q: structuredClone(stored(q)), hits: 0 });
  if (d.reviews.length > REVIEW_MAX) d.reviews.splice(0, d.reviews.length - REVIEW_MAX);
}

/** 復習の回答を記録する。続けて REVIEW_CLEAR 回正解したら一覧から外し、そうでなければ列の後ろに回す */
export function markReview(d: KeikoData, key: string, correct: boolean): void {
  const i = d.reviews.findIndex((r) => r.key === key);
  if (i < 0) return;
  const [item] = d.reviews.splice(i, 1);
  item.hits = correct ? item.hits + 1 : 0;
  if (item.hits < REVIEW_CLEAR) d.reviews.push(item);
}

export const reviewCount = (d: KeikoData, mode: Mode): number => d.reviews.filter((r) => r.q.mode === mode).length;

/** 保存した手をいまのルールで計算し直して問題にする（和了にならない手は一覧から消して null） */
export function nextReview(d: KeikoData, mode: Mode, rules: Rules): { key: string; q: Question } | null {
  for (const item of [...d.reviews]) {
    if (item.q.mode !== mode) continue;
    const s = item.q;
    if (s.mode === 'hayami') {
      return { key: item.key, q: { ...s, score: calcScore(s.han, s.fu, s.dealer, s.tsumo, rules) } };
    }
    const ev = evaluate(s.hand, s.sit, rules);
    // 以前に保存した70符以上の手は、いまは出題しないので外す
    if (ev && (ev.yakuman || ev.fu.fu <= MAX_FU)) return { key: item.key, q: { mode: s.mode, hand: s.hand, sit: s.sit, ev } };
    d.reviews = d.reviews.filter((r) => r !== item);
  }
  return null;
}

export function recordElement(d: KeikoData, el: FuElement, correct: boolean): void {
  const st = (d.elements[el] ??= { c: 0, n: 0 });
  st.n++;
  if (correct) st.c++;
}

/** この手で数える必要のある要素（七対子・役満は対象外） */
export function handElements(q: HandQuestion): FuElement[] {
  const { ev } = q;
  if (ev.yakuman || ev.interp.form !== 'standard') return [];
  const out: FuElement[] = ['wait', 'kafu', 'total', 'roundup'];
  if (ev.interp.groups.some((g) => g.kind !== 'shuntsu')) out.push('mentsu');
  if (ev.fu.rows.some((r) => r.group === -1 && r.fu > 0)) out.push('pair');
  return out;
}

/**
 * 通常の回答（段階回答でない）の記録。正解ならこの手の要素をすべて正解に、
 * 不正解なら診断が当たった要素だけを誤りにする（どこで間違えたか分からない誤答は数えない）
 */
export function recordFuAnswer(d: KeikoData, q: HandQuestion, correct: boolean, diag: Diagnosis[]): void {
  if (correct) {
    for (const el of handElements(q)) recordElement(d, el, true);
    return;
  }
  for (const el of new Set(diag.map((x) => x.element))) recordElement(d, el, false);
}

export const accuracy = (st: ElementStat | undefined): number | null => (st && st.n ? st.c / st.n : null);

/**
 * 絞り込みと両立する苦手ドリルの要素。七対子・平和・喰い平和は符の数え方がほぼ決まっているので使わない。
 * 副露のロンだけなら加符（門前ロン・ツモ）は出てこない
 */
export function weakAllowed(c: Pick<HandConstraints, 'call' | 'shape'>, f: Filters): FuElement[] {
  if (c.shape === 'chiitoi' || c.shape === 'pinfu' || c.shape === 'kuipinfu') return [];
  const call = shapeCall(c.shape) ?? c.call;
  return call === 'open' && f.win === 'ron' ? ELEMENTS.filter((el) => el !== 'kafu') : ELEMENTS;
}

/** 苦手な要素を1つ選ぶ。正答率が低いほど選ばれやすい。記録が足りなければ null */
export function pickWeak(d: KeikoData, rng: () => number = Math.random, allowed: FuElement[] = ELEMENTS): FuElement | null {
  const cands = allowed.flatMap((el) => {
    const st = d.elements[el];
    return st && st.n >= WEAK_MIN ? [[el, 1 - st.c / st.n + 0.05] as const] : [];
  });
  if (!cands.length) return null;
  const total = cands.reduce((s, [, w]) => s + w, 0);
  let r = rng() * total;
  for (const [el, w] of cands) {
    r -= w;
    if (r < 0) return el;
  }
  return cands[cands.length - 1][0];
}

/** 苦手ドリル：その要素を数える場面がある手 */
export function weakWant(el: FuElement): (q: HandQuestion) => boolean {
  return (q) => {
    const { ev } = q;
    if (ev.yakuman || ev.interp.form !== 'standard') return false;
    const it = ev.interp;
    switch (el) {
      case 'wait':
        return it.wait !== 'ryanmen';
      case 'mentsu':
        return it.groups.some((g, i) => g.kind !== 'shuntsu' && (ev.fu.rows.some((r) => r.group === i && r.fu >= 4) || (i === it.winGroup && !g.called && !g.concealed)));
      case 'pair':
        return ev.fu.rows.some((r) => r.group === -1 && r.fu > 0);
      case 'kafu':
        return q.sit.tsumo || isMenzen(q.hand);
      case 'total':
        return ev.fu.items.length >= 4;
      case 'roundup':
        return ev.fu.raw % 10 !== 0;
    }
  };
}
