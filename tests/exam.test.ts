import { describe, expect, it } from 'vitest';
import { NOTEBOOK, RANKS, canTakeExam, certText, examIntro, judge, loadExam, nextRank, notebookHtml, notebookName, rankName, recordPass, saveExam, unreadNotes } from '../src/ui/exam';

describe('昇段試験', () => {
  it('2 Lv ごとに全10段階。Lv 2 で5級、Lv 20 で名人', () => {
    expect(RANKS).toHaveLength(10);
    expect(RANKS.map((r) => r.level)).toEqual([2, 4, 6, 8, 10, 12, 14, 16, 18, 20]);
    expect(RANKS[0].name).toBe('5級');
    expect(RANKS[9].name).toBe('名人');
    for (const r of RANKS) expect(r.modes).toHaveLength(10);
    expect(RANKS[9].input).toBe(true);
  });
  it('出題の内訳（早見 → 符計算 → 実戦）', () => {
    expect(new Set(RANKS[0].modes)).toEqual(new Set(['hayami']));
    expect(RANKS[1].modes.filter((m) => m === 'fu')).toHaveLength(5);
    expect(new Set(RANKS[2].modes)).toEqual(new Set(['fu']));
    expect(new Set(RANKS[4].modes)).toEqual(new Set(['jissen']));
  });
  it('受けられるのは、次の段位の Lv に届いてから', () => {
    expect(canTakeExam(0, 1)).toBe(false);
    expect(canTakeExam(0, 2)).toBe(true);
    expect(canTakeExam(1, 3)).toBe(false);
    expect(canTakeExam(1, 4)).toBe(true);
    expect(canTakeExam(10, 30)).toBe(false);
    expect(nextRank(10)).toBe(null);
    expect(rankName(0)).toBe('');
    expect(rankName(6)).toBe('初段');
  });
  it('合否：正解数と平均の速さ（境目を含む）', () => {
    const t = (sec: number) => Array.from({ length: 10 }, () => sec);
    expect(judge(RANKS[0], { correct: 8, times: t(30) }).pass).toBe(true);
    const f = judge(RANKS[0], { correct: 7, times: t(5) });
    expect(f.pass).toBe(false);
    expect(f.shortCorrect).toBe(1);
    const shodan = RANKS[5];
    expect(judge(shodan, { correct: 9, times: t(20) }).pass).toBe(true);
    const slow = judge(shodan, { correct: 10, times: t(21) });
    expect(slow.pass).toBe(false);
    expect(slow.shortSec).toBeCloseTo(1);
  });
  it('保存と読み込み（受かった段位の数）', () => {
    const store = new Map<string, string>();
    (globalThis as { localStorage?: unknown }).localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => store.set(k, v),
    };
    const s = loadExam();
    expect(s.rank).toBe(0);
    recordPass(s, '2026-10-06');
    saveExam(s);
    expect(loadExam()).toEqual({ rank: 1, passedAt: ['2026-10-06'], notesRead: [] });
    store.set('tensu.exam.v1', JSON.stringify({ rank: 99 }));
    expect(loadExam().rank).toBe(10);
    delete (globalThis as { localStorage?: unknown }).localStorage;
  });
});

describe('昇段試験と物語', () => {
  it('帳面は段位と同じ10頁', () => {
    expect(NOTEBOOK).toHaveLength(RANKS.length);
    for (const p of NOTEBOOK) expect(p.tip.length + p.scene.length).toBeLessThanOrEqual(200);
  });
  it('第4話を読む前は、前口上・認定証・帳面にゲンさんの名前を出さない', () => {
    const before = [1, 2, 3];
    expect(examIntro(RANKS[0], before)).not.toContain('ゲン');
    expect(certText('5級', before)).not.toContain('ゲン');
    expect(notebookName(before)).toBe('誰かの帳面');
    expect(notebookHtml({ rank: 1, passedAt: [] }, before)).not.toContain('ゲンさん');
    expect(certText('5級', [4])).toContain('ゲンさん');
    expect(notebookName([4])).toBe('ゲンさんの帳面');
  });
  it('前口上は物語の進み具合で変わる', () => {
    const r = RANKS[3];
    const lines = [[], [4], [4, 11], [4, 11, 18]].map((read) => examIntro(r, read));
    expect(new Set(lines).size).toBe(4);
    expect(lines[3]).toContain('約束');
  });
  it('読んでいない帳面の頁を数える', () => {
    expect(unreadNotes({ rank: 3, passedAt: [], notesRead: [1] })).toBe(2);
    expect(unreadNotes({ rank: 3, passedAt: [], notesRead: [1, 2, 3] })).toBe(0);
  });
});
