import { describe, expect, it } from 'vitest';
import { diagnose } from '../src/core/diagnose';
import { evaluate } from '../src/core/evaluate';
import type { HandQuestion } from '../src/core/generator';
import { defaultSituation } from '../src/core/hand';
import { DEFAULT_RULES } from '../src/core/rules';
import { calcScore } from '../src/core/score';
import {
  type KeikoData,
  REVIEW_MAX,
  addReview,
  handElements,
  markReview,
  nextReview,
  pickWeak,
  recordFuAnswer,
  reviewCount,
  reviewKey,
  weakAllowed,
  weakWant,
} from '../src/ui/keiko';
import { hand } from './helpers';

const R = DEFAULT_RULES;
const empty = (): KeikoData => ({ reviews: [], elements: {} });
const hayami = (han: number, fu: number) => ({ mode: 'hayami' as const, han, fu, dealer: false, tsumo: false, score: calcScore(han, fu, false, false, R) });

function fuQ(concealed: string, win: string, sit = {}): HandQuestion {
  const s = defaultSituation(sit);
  const ev = evaluate(hand(concealed, win), s, R)!;
  return { mode: 'fu', hand: hand(concealed, win), sit: s, ev };
}

describe('復習', () => {
  it('間違えた手を入れ、2回続けて正解したら外す', () => {
    const d = empty();
    const q = fuQ('234m555p345s99s11m', '9s', { riichi: true });
    addReview(d, q);
    expect(reviewCount(d, 'fu')).toBe(1);
    const r = nextReview(d, 'fu', R)!;
    expect(r.key).toBe(reviewKey(q));
    expect(r.q.mode === 'fu' && r.q.ev.fu.fu).toBe(40);
    markReview(d, r.key, true);
    markReview(d, r.key, false);
    markReview(d, r.key, true);
    expect(reviewCount(d, 'fu')).toBe(1);
    markReview(d, r.key, true);
    expect(reviewCount(d, 'fu')).toBe(0);
  });
  it('同じ手は重複させず、上限を超えたら古いものから消す', () => {
    const d = empty();
    addReview(d, hayami(1, 30));
    addReview(d, hayami(1, 30));
    expect(d.reviews.length).toBe(1);
    for (let i = 0; i < REVIEW_MAX + 5; i++) addReview(d, { ...hayami(2, 30), dealer: i % 2 === 0, fu: 30 + i });
    expect(d.reviews.length).toBe(REVIEW_MAX);
    expect(d.reviews.some((r) => r.key === reviewKey(hayami(1, 30)))).toBe(false);
  });
  it('出題中のモードの手だけを出す', () => {
    const d = empty();
    addReview(d, hayami(3, 30));
    expect(nextReview(d, 'fu', R)).toBeNull();
    expect(nextReview(d, 'hayami', R)?.q.mode).toBe('hayami');
  });
});

describe('要素別の正答率', () => {
  const q = fuQ('234m555p345s99s11m', '9s', { riichi: true });
  it('正解なら手に出てくる要素をすべて正解にする', () => {
    const d = empty();
    recordFuAnswer(d, q, true, []);
    expect(Object.keys(d.elements).sort()).toEqual(handElements(q).sort());
    expect(handElements(q)).toContain('mentsu');
  });
  it('不正解は診断が当たった要素だけを誤りにする', () => {
    const d = empty();
    recordFuAnswer(d, q, false, diagnose(q, R, (fu) => fu === 50));
    expect(d.elements).toEqual({ mentsu: { c: 0, n: 1 } });
    recordFuAnswer(d, q, false, []);
    expect(d.elements).toEqual({ mentsu: { c: 0, n: 1 } });
  });
  it('苦手は記録が5問以上の要素から選び、正答率の低い方を多く選ぶ', () => {
    const d = empty();
    expect(pickWeak(d)).toBeNull();
    d.elements = { wait: { c: 1, n: 10 }, kafu: { c: 10, n: 10 }, pair: { c: 0, n: 3 } };
    let wait = 0;
    let i = 0;
    const rng = () => ((i = (i * 9301 + 49297) % 233280), i / 233280);
    for (let k = 0; k < 500; k++) if (pickWeak(d, rng) === 'wait') wait++;
    expect(wait).toBeGreaterThan(400);
    expect(weakAllowed('pinfu')).toEqual([]);
  });
  it('苦手ドリルの条件', () => {
    expect(weakWant('mentsu')(q)).toBe(true);
    expect(weakWant('wait')(q)).toBe(true);
    const pinfu = fuQ('234m567p345s78s55p', '9s', { riichi: true });
    expect(weakWant('wait')(pinfu)).toBe(false);
    expect(weakWant('roundup')(pinfu)).toBe(false);
  });
});
