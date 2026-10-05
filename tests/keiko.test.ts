import { describe, expect, it } from 'vitest';
import { diagnose } from '../src/core/diagnose';
import { evaluate } from '../src/core/evaluate';
import type { HandQuestion } from '../src/core/generator';
import { defaultSituation } from '../src/core/hand';
import { DEFAULT_RULES } from '../src/core/rules';
import { calcScore } from '../src/core/score';
import {
  type KeikoData,
  migrateKeiko,
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
  it('間違えた手を入れ、段階練習（実戦の手）として出す。2回続けて正解したら外す', () => {
    const d = empty();
    const q = fuQ('234m555p345s99s11m', '9s', { riichi: true });
    addReview(d, q);
    expect(reviewCount(d)).toBe(1);
    const r = nextReview(d, R)!;
    expect(r.key).toBe(reviewKey(q));
    expect(r.q.mode).toBe('jissen');
    expect(r.q.ev.fu.fu).toBe(40);
    markReview(d, r.key, true);
    markReview(d, r.key, false);
    markReview(d, r.key, true);
    expect(reviewCount(d)).toBe(1);
    markReview(d, r.key, true);
    expect(reviewCount(d)).toBe(0);
  });
  it('同じ手は重複させず、上限を超えたら古いものから消す。早見は入れない', () => {
    const d = empty();
    addReview(d, hayami(1, 30));
    expect(d.reviews.length).toBe(0);
    const first = fuQ('234m555p345s99s11m', '9s', { riichi: true });
    addReview(d, first);
    addReview(d, { ...first, mode: 'jissen' });
    expect(d.reviews.length).toBe(1);
    for (let i = 0; i < REVIEW_MAX + 5; i++) addReview(d, { ...first, sit: { ...first.sit, doraIndicators: [i % 34, Math.floor(i / 34)] } });
    expect(d.reviews.length).toBe(REVIEW_MAX);
    expect(d.reviews.some((r) => r.key === reviewKey(first))).toBe(false);
  });
  it('以前の記録を読み替える（早見の手を外し、加符→基本符、合計・切り上げ→符）', () => {
    const q = fuQ('234m555p345s99s11m', '9s', { riichi: true });
    const d = migrateKeiko({
      reviews: [
        { key: 'x', q: { mode: 'hayami', han: 1, fu: 30, dealer: false, tsumo: false }, hits: 0 },
        { key: 'y', q: { mode: 'fu', hand: q.hand, sit: q.sit }, hits: 1 },
      ],
      elements: { kafu: { c: 1, n: 2 }, total: { c: 2, n: 3 }, roundup: { c: 1, n: 1 }, wait: { c: 4, n: 5 } },
    });
    expect(d.reviews.length).toBe(1);
    expect(d.reviews[0].hits).toBe(1);
    expect(d.elements).toEqual({ base: { c: 1, n: 2 }, fu: { c: 3, n: 4 }, wait: { c: 4, n: 5 } });
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
    d.elements = { wait: { c: 1, n: 10 }, base: { c: 10, n: 10 }, pair: { c: 0, n: 3 } };
    let wait = 0;
    let i = 0;
    const rng = () => ((i = (i * 9301 + 49297) % 233280), i / 233280);
    for (let k = 0; k < 500; k++) if (pickWeak(d, rng) === 'wait') wait++;
    expect(wait).toBeGreaterThan(400);
    expect(weakAllowed('any', { seat: 'any', win: 'any' })).toHaveLength(7);
    expect(weakAllowed('open', { seat: 'any', win: 'ron' })).not.toContain('base');
  });
  it('苦手ドリルの条件', () => {
    expect(weakWant('mentsu')(q)).toBe(true);
    expect(weakWant('wait')(q)).toBe(true);
    const pinfu = fuQ('234m567p345s78s55p', '9s', { riichi: true });
    expect(weakWant('wait')(pinfu)).toBe(false);
    expect(weakWant('fu')(pinfu)).toBe(false);
    expect(weakWant('han')(pinfu)).toBe(true);
  });
});

describe('タブの移行', () => {
  it('旧バージョンのノーマル・プラクティスを、パチンコ・稽古に読み替える', async () => {
    const { migratePlayMode } = await import('../src/ui/settings');
    expect(migratePlayMode('normal')).toBe('pachinko');
    expect(migratePlayMode('practice')).toBe('keiko');
    expect(migratePlayMode('keiko')).toBe('keiko');
    expect(migratePlayMode(undefined)).toBe('pachinko');
  });
});

describe('設定の移行', () => {
  it('「段階」は選択に、制限時間と形・分布の絞り込みは消す', async () => {
    const store = new Map<string, string>();
    (globalThis as { localStorage?: unknown }).localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => store.set(k, v),
    };
    store.set('tensu.settings.v1', JSON.stringify({ playMode: 'practice', answerStyle: 'steps', timeLimit: 15, keikoFilters: { call: 'open', shape: 'pinfu', dist: 'even' } }));
    const { loadSettings } = await import('../src/ui/settings');
    const s = loadSettings();
    expect(s.playMode).toBe('keiko');
    expect(s.answerStyle).toBe('choice');
    expect('timeLimit' in s).toBe(false);
    expect(s.keikoFilters).toEqual({ call: 'open' });
    expect(s.keikoStudy).toBe('focus');
    delete (globalThis as { localStorage?: unknown }).localStorage;
  });
});
