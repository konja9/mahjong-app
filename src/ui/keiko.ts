import { type Diagnosis, type FuElement, ELEMENT_NAMES } from '../core/diagnose';
import { evaluate } from '../core/evaluate';
import { type CallFilter, type Filters, type HandQuestion, MAX_FU, type Question } from '../core/generator';
import { type Hand, type Situation, isMenzen } from '../core/hand';
import type { Rules } from '../core/rules';
import { EAST } from '../core/tiles';
import { load, save } from './storage';

/**
 * 稽古の記録：間違えた手（復習）と、要素ごとの正答率（苦手ドリル）。
 * パチンコで間違えた手牌の問題もここに入り、稽古の復習で段階練習として出す
 */

export type KeikoSource = 'normal' | 'review' | 'weak';

interface Stored {
  hand: Hand;
  sit: Situation;
}

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

/** 以前の要素（加符・合計・切り上げ）を今の要素に読み替える */
const OLD_ELEMENTS: Record<string, FuElement> = { kafu: 'base', total: 'fu', roundup: 'fu' };

export function migrateKeiko(raw: { reviews?: unknown; elements?: Record<string, ElementStat> }): KeikoData {
  const elements: KeikoData['elements'] = {};
  for (const [k, st] of Object.entries(raw.elements ?? {})) {
    const el = (ELEMENTS as string[]).includes(k) ? (k as FuElement) : OLD_ELEMENTS[k];
    if (!el || !st) continue;
    const cur = (elements[el] ??= { c: 0, n: 0 });
    cur.c += st.c;
    cur.n += st.n;
  }
  // 稽古に早見はないので、早見の手は復習から外す
  const reviews = (Array.isArray(raw.reviews) ? (raw.reviews as (ReviewItem & { q: { mode?: string } })[]) : []).filter(
    (r) => r?.q && r.q.mode !== 'hayami' && 'hand' in r.q,
  );
  return { reviews: reviews.map((r) => ({ key: reviewKey(r.q), q: { hand: r.q.hand, sit: r.q.sit }, hits: r.hits ?? 0 })), elements };
}

export function loadKeiko(): KeikoData {
  return migrateKeiko(load<{ reviews?: unknown; elements?: Record<string, ElementStat> }>(KEY, { reviews: [], elements: {} }));
}

export function saveKeiko(d: KeikoData): void {
  save(KEY, d);
}

export const reviewKey = (q: Stored): string => JSON.stringify({ hand: q.hand, sit: q.sit });

/** 間違えた手牌の問題を復習に入れる（同じ手ならやり直し）。早見は入れない。上限を超えたら古いものから消す */
export function addReview(d: KeikoData, q: Question): void {
  if (q.mode === 'hayami') return;
  const key = reviewKey(q);
  d.reviews = d.reviews.filter((r) => r.key !== key);
  d.reviews.push({ key, q: structuredClone({ hand: q.hand, sit: q.sit }), hits: 0 });
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

export const reviewCount = (d: KeikoData): number => d.reviews.length;

/**
 * 保存した手をいまのルールで計算し直して、段階練習の問題（実戦の手）にする。
 * 和了にならない手・役満・70符以上（以前に保存したもの）は一覧から外す
 */
export function nextReview(d: KeikoData, rules: Rules): { key: string; q: HandQuestion } | null {
  for (const item of [...d.reviews]) {
    const ev = evaluate(item.q.hand, item.q.sit, rules);
    if (ev && !ev.yakuman && ev.fu.fu <= MAX_FU) return { key: item.key, q: { mode: 'jissen', hand: item.q.hand, sit: item.q.sit, ev } };
    d.reviews = d.reviews.filter((r) => r !== item);
  }
  return null;
}

export function recordElement(d: KeikoData, el: FuElement, correct: boolean): void {
  const st = (d.elements[el] ??= { c: 0, n: 0 });
  st.n++;
  if (correct) st.c++;
}

/** この手で数える必要のある要素（七対子・役満は符の要素なし）。符計算の問題は翻・点数を含めない */
export function handElements(q: HandQuestion): FuElement[] {
  const { ev } = q;
  const out: FuElement[] = [];
  if (!ev.yakuman && ev.interp.form === 'standard') {
    out.push('base', 'wait', 'fu');
    if (ev.interp.groups.some((g) => g.kind !== 'shuntsu')) out.push('mentsu');
    if (ev.fu.rows.some((r) => r.group === -1 && r.fu > 0)) out.push('pair');
  }
  if (q.mode === 'jissen') out.push('han', 'score');
  return out;
}

/**
 * パチンコの回答の記録。正解ならこの手の要素をすべて正解に、
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

/** 絞り込みと両立する苦手ドリルの要素。副露のロンだけなら、基本符（門前ロン・ツモ）は出てこない */
export function weakAllowed(call: CallFilter, f: Filters): FuElement[] {
  return call === 'open' && f.win === 'ron' ? ELEMENTS.filter((el) => el !== 'base') : ELEMENTS;
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

/** 苦手ドリル：その要素でつまずきやすい場面がある手 */
export function weakWant(el: FuElement): (q: HandQuestion) => boolean {
  return (q) => {
    const { ev } = q;
    if (ev.yakuman) return false;
    const it = ev.interp;
    const std = it.form === 'standard';
    switch (el) {
      case 'base':
        return std && (q.sit.tsumo || isMenzen(q.hand));
      case 'mentsu':
        return std && it.groups.some((g, i) => g.kind !== 'shuntsu' && (ev.fu.rows.some((r) => r.group === i && r.fu >= 4) || (i === it.winGroup && !g.called && !g.concealed)));
      case 'pair':
        return std && ev.fu.rows.some((r) => r.group === -1 && r.fu > 0);
      case 'wait':
        return std && it.wait !== 'ryanmen';
      case 'fu':
        return ev.fu.raw % 10 !== 0 || ev.fu.items.length >= 4;
      case 'han':
        return ev.yaku.length >= 2 || ev.dora.length > 0;
      case 'score':
        return q.sit.tsumo || q.sit.seatWind === EAST;
    }
  };
}
