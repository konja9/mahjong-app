import { describe, expect, it } from 'vitest';
import { RANKS } from '../src/ui/exam';
import {
  ANSWERS_MAX,
  DAYS_MAX,
  type AnswerInput,
  type RecordData,
  bySituation,
  dailySeries,
  examTarget,
  freshRecord,
  migrateRecord,
  missedHayami,
  recent,
  recordAnswer,
  recordExam,
  today,
  trend,
} from '../src/ui/record';
import { recordHtml, type RecordView } from '../src/ui/recordView';

const ans = (p: Partial<AnswerInput> = {}): AnswerInput => ({ mode: 'fu', ok: true, sec: 10, keiko: false, input: false, dealer: false, tsumo: false, ...p });
const fill = (r: RecordData, n: number, p: Partial<AnswerInput>, day = '2026-10-01') => {
  for (let i = 0; i < n; i++) recordAnswer(r, ans(p), day);
};

describe('成績の記録', () => {
  it('1問ずつ記録し、日ごと・累計・連続正解も数える', () => {
    const r = freshRecord('2026-10-01');
    recordAnswer(r, ans({ ok: true, sec: 12.34, dealer: true, tsumo: true }), '2026-10-01');
    recordAnswer(r, ans({ ok: false, sec: 8 }), '2026-10-01');
    recordAnswer(r, ans({ ok: true }), '2026-10-01');
    expect(r.answers[0]).toMatchObject({ m: 'fu', ok: true, t: 12.3, s: 3 });
    expect(r.days['2026-10-01'].fu).toEqual({ n: 3, c: 2, tSum: 30.3, tN: 3 });
    expect(r.total.fu).toEqual({ n: 3, c: 2 });
    expect(r.streak).toBe(1);
    expect(r.bestStreak).toBe(1);
    expect(today(r, '2026-10-01')).toEqual({ n: 3, c: 2 });
  });
  it('段階練習（秒なし）は秒を入れない', () => {
    const r = freshRecord('d');
    recordAnswer(r, ans({ sec: undefined, keiko: true }), '2026-10-01');
    expect(r.answers[0].t).toBeUndefined();
    expect(r.answers[0].k).toBe(true);
    expect(recent(r, 'fu').avg).toBeNull();
  });
  it('1問ごとの記録と日ごとの集計には上限がある', () => {
    const r = freshRecord('d');
    fill(r, ANSWERS_MAX + 20, {});
    expect(r.answers).toHaveLength(ANSWERS_MAX);
    for (let i = 0; i < DAYS_MAX + 5; i++) recordAnswer(r, ans(), `2027-${String(1 + Math.floor(i / 28)).padStart(2, '0')}-${String(1 + (i % 28)).padStart(2, '0')}`);
    expect(Object.keys(r.days)).toHaveLength(DAYS_MAX);
    expect(r.total.fu!.n).toBe(ANSWERS_MAX + 20 + DAYS_MAX + 5);
  });
  it('直近50問と、その前の50問を比べる', () => {
    const r = freshRecord('d');
    fill(r, 50, { ok: false, sec: 20 });
    fill(r, 50, { ok: true, sec: 15 });
    const t = trend(r, 'fu');
    expect(t.now.acc).toBe(1);
    expect(t.prev!.acc).toBe(0);
    expect(t.dAcc).toBe(100);
    expect(t.dSec).toBe(-5);
  });
  it('前の記録が少なければ比べない', () => {
    const r = freshRecord('d');
    fill(r, 30, {});
    expect(trend(r, 'fu').prev).toBeNull();
    expect(trend(r, 'hayami').now.n).toBe(0);
  });
  it('日ごとの推移は古い順で、その種目を解いた日だけ', () => {
    const r = freshRecord('d');
    fill(r, 4, { ok: true, sec: 10 }, '2026-10-03');
    fill(r, 2, { ok: false, mode: 'hayami' }, '2026-10-02');
    fill(r, 2, { ok: false, sec: 20 }, '2026-10-01');
    const s = dailySeries(r, 'fu');
    expect(s.map((p) => p.d)).toEqual(['2026-10-01', '2026-10-03']);
    expect(s[0]).toMatchObject({ n: 2, acc: 0, avg: 20 });
    expect(s[1]).toMatchObject({ n: 4, acc: 1, avg: 10 });
  });
  it('状況別と、早見でよく間違える点数', () => {
    const r = freshRecord('d');
    fill(r, 3, { ok: false, dealer: true, tsumo: false });
    fill(r, 1, { ok: true, dealer: false, tsumo: true });
    expect(bySituation(r).map((s) => [s.label, s.n, s.c])).toEqual([
      ['子のロン', 0, 0],
      ['子のツモ', 1, 1],
      ['親のロン', 3, 0],
      ['親のツモ', 0, 0],
    ]);
    fill(r, 3, { mode: 'hayami', ok: false, han: 3, fu: 40 });
    fill(r, 1, { mode: 'hayami', ok: false, han: 6, fu: 30 });
    fill(r, 1, { mode: 'hayami', ok: false, han: 7, fu: 40 });
    fill(r, 2, { mode: 'hayami', ok: true, han: 2, fu: 30 });
    expect(missedHayami(r).map((e) => [e.han, e.fu, e.miss])).toEqual([
      [3, 40, 3],
      [6, 0, 1],
      [7, 0, 1],
    ]);
  });
  it('昇段試験の目安：基準の正答率と速さを、同じ種目の直近と比べる', () => {
    const shodan = RANKS.find((x) => x.name === '初段')!;
    const r = freshRecord('d');
    expect(examTarget(shodan, r).verdict).toBe('few');
    fill(r, 20, { mode: 'jissen', ok: true, sec: 18 });
    expect(examTarget(shodan, r).verdict).toBe('ready');
    fill(r, 20, { mode: 'jissen', ok: true, sec: 24 });
    const close = examTarget(shodan, r);
    expect(close.verdict).toBe('close');
    expect(close.shortSec).toBeCloseTo(1);
    fill(r, 40, { mode: 'jissen', ok: false, sec: 40 });
    expect(examTarget(shodan, r).verdict).toBe('far');
    // 4級は早見と符計算をまとめて比べる
    const kyu4 = RANKS.find((x) => x.name === '4級')!;
    const r2 = freshRecord('d');
    fill(r2, 6, { mode: 'hayami' });
    fill(r2, 6, { mode: 'fu' });
    expect(examTarget(kyu4, r2).now.n).toBe(12);
    // 名人は数値入力の答えだけ
    const meijin = RANKS[RANKS.length - 1];
    expect(examTarget(meijin, r).verdict).toBe('few');
  });
  it('受験記録は不合格も残す', () => {
    const r = freshRecord('d');
    recordExam(r, { rank: 1, correct: 7, avg: 9.87, pass: false }, '2026-10-01');
    recordExam(r, { rank: 1, correct: 9, avg: 8, pass: true }, '2026-10-02');
    expect(r.exams).toEqual([
      { rank: 1, correct: 7, avg: 9.9, pass: false, d: '2026-10-01' },
      { rank: 1, correct: 9, avg: 8, pass: true, d: '2026-10-02' },
    ]);
  });
  it('壊れた記録を読んでも落ちない', () => {
    const r = migrateRecord({ answers: [null, { m: 'x' }, { m: 'fu', ok: 1, s: 9, d: '2026-10-01', t: 'a' }], days: { a: null, b: { fu: { n: 2, c: 1 } } }, exams: 'x' }, '2026-10-05');
    expect(r.since).toBe('2026-10-05');
    expect(r.answers).toEqual([{ m: 'fu', ok: true, s: 3, d: '2026-10-01' }]);
    expect(r.days.b.fu).toEqual({ n: 2, c: 1, tSum: 0, tN: 0 });
    expect(r.exams).toEqual([]);
    expect(migrateRecord(undefined, 'd').answers).toEqual([]);
  });
});

describe('成績の画面', () => {
  const view = (p: Partial<RecordView> = {}): RecordView => ({
    tab: 'skill',
    mode: 'fu',
    rec: freshRecord('2026-10-01'),
    day: '2026-10-01',
    rank: 0,
    keiko: null,
    elements: [],
    weakReady: false,
    machine: { name: '甘デジ', balance: 1000, dayNet: -200, hits: 1, maxChain: 0, bankrupts: 0, log: [] },
    ...p,
  });
  it('記録がなくても4つのタブが出る', () => {
    for (const tab of ['skill', 'trend', 'weak', 'machine'] as const) {
      const h = recordHtml(view({ tab }));
      expect(h).toContain(`data-rec-tab="${tab}"`);
      expect(h).toMatch(new RegExp(`class="cfg on"[^>]*data-rec-tab="${tab}"`));
    }
    expect(recordHtml(view())).toContain('まだ記録が少ない');
    expect(recordHtml(view())).toContain('5級');
    expect(recordHtml(view({ tab: 'trend' }))).toContain('まだありません');
  });
  it('腕前のカードと推移のグラフ、受かった日の旗', () => {
    const rec = freshRecord('2026-10-01');
    fill(rec, 20, { ok: true }, '2026-10-01');
    fill(rec, 20, { ok: false }, '2026-10-02');
    recordExam(rec, { rank: 1, correct: 9, avg: 8, pass: true }, '2026-10-02');
    expect(recordHtml(view({ rec }))).toMatch(/rc-acc"><b>50<\/b>/);
    const t = recordHtml(view({ rec, tab: 'trend' }));
    expect(t).toContain('rec-chart');
    expect(t).toContain('class="flag"');
    expect(t).toContain('合格');
  });
  it('平均の速さのグラフは、速い日ほど上に描く', () => {
    const rec = freshRecord('2026-10-01');
    fill(rec, 5, { sec: 30 }, '2026-10-01');
    fill(rec, 5, { sec: 12 }, '2026-10-02');
    const t = recordHtml(view({ rec, tab: 'trend' }));
    expect(t).toContain('上ほど速い');
    const speed = t.slice(t.indexOf('平均の速さ'));
    const cys = [...speed.matchAll(/<circle cx="[\d.]+" cy="([\d.]+)"/g)].map((m) => Number(m[1]));
    expect(cys).toHaveLength(2);
    expect(cys[1]).toBeLessThan(cys[0]);
  });
});
