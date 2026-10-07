import { describe, expect, it } from 'vitest';
import {
  FINAL_LEVEL,
  MODE_EXP,
  addExp,
  dayKey,
  ensureDay,
  expForLevel,
  expToNext,
  freshLevel,
  expFor,
  levelOf,
  markRead,
  unlockedChapters,
  unreadChapters,
} from '../src/ui/level';
import { STORY, chapterLength, storyChapterHtml, storyIndexHtml, storyLead } from '../src/ui/story';

describe('経験値と Lv', () => {
  it('次の Lv までの exp は Lv ごとに増える。Lv1→2 は最初の BONUS 1回で届く量', () => {
    expect(expToNext(1)).toBeLessThanOrEqual(250);
    for (let l = 1; l < 40; l++) expect(expToNext(l + 1)).toBeGreaterThan(expToNext(l));
  });

  it('Lv20 までの合計は約19万（中級者・甘デジで約5,000問）', () => {
    const total = expForLevel(FINAL_LEVEL);
    expect(total).toBeGreaterThan(170000);
    expect(total).toBeLessThan(210000);
  });

  it('levelOf：Lv の境目', () => {
    expect(levelOf(0)).toEqual({ level: 1, into: 0, need: expToNext(1) });
    expect(levelOf(expToNext(1) - 1).level).toBe(1);
    expect(levelOf(expToNext(1)).level).toBe(2);
    expect(levelOf(expForLevel(FINAL_LEVEL)).level).toBe(FINAL_LEVEL);
    // 上限はない
    expect(levelOf(expForLevel(40)).level).toBe(40);
  });

  it('addExp は上がった Lv をすべて返し、exp は減らない', () => {
    const s = freshLevel();
    expect(addExp(s, -100)).toEqual([]);
    expect(s.exp).toBe(0);
    expect(addExp(s, expForLevel(4))).toEqual([2, 3, 4]);
    expect(addExp(s, 1)).toEqual([]);
  });

  it('正解の exp：早見1・符計算2・実戦3。段階練習は正解の割合に応じて', () => {
    expect(MODE_EXP.fu).toBe(MODE_EXP.hayami * 2);
    expect(MODE_EXP.jissen).toBe(MODE_EXP.hayami * 3);
    expect(expFor('jissen')).toBe(MODE_EXP.jissen);
    expect(expFor('fu', 8, 8)).toBe(MODE_EXP.fu);
    expect(expFor('fu', 4, 8)).toBe(MODE_EXP.fu / 2);
    expect(expFor('hayami', 0, 8)).toBe(0);
    expect(expFor('hayami', 0, 0)).toBe(0);
  });

  it('早見の正解10問で Lv2', () => {
    expect(levelOf(MODE_EXP.hayami * 9).level).toBe(1);
    expect(levelOf(MODE_EXP.hayami * 10).level).toBe(2);
  });

  it('Lv N で第N話まで読める（完結より先は増えない）。読んでいない話を数える', () => {
    expect(unlockedChapters(1)).toBe(1);
    expect(unlockedChapters(35)).toBe(FINAL_LEVEL);
    const s = freshLevel();
    addExp(s, expForLevel(3));
    expect(unreadChapters(s)).toEqual([1, 2, 3]);
    markRead(s, 2);
    expect(unreadChapters(s)).toEqual([1, 3]);
  });

  it('3種目を同じだけ解く（1問平均 40 exp）と、Lv20 は正解 4,000〜5,500 問', () => {
    const avg = (MODE_EXP.hayami + MODE_EXP.fu + MODE_EXP.jissen) / 3;
    const questions = expForLevel(FINAL_LEVEL) / avg;
    expect(questions).toBeGreaterThan(4000);
    expect(questions).toBeLessThan(5500);
  });
});

describe('本日の収支（朝5時で区切る）', () => {
  it('4:59 までは前の日、5:00 から次の日', () => {
    expect(dayKey(new Date(2026, 9, 7, 4, 59))).toBe('2026-10-06');
    expect(dayKey(new Date(2026, 9, 7, 5, 0))).toBe('2026-10-07');
  });
  it('日が変わったら 0 から数え直す', () => {
    expect(ensureDay({ day: '2026-10-06', net: 500 }, '2026-10-06').net).toBe(500);
    expect(ensureDay({ day: '2026-10-06', net: 500 }, '2026-10-07')).toEqual({ day: '2026-10-07', net: 0 });
    expect(ensureDay(undefined, '2026-10-07').net).toBe(0);
  });
});

describe('物語の目次の文', () => {
  it('「Lv 20 で完結」は出さず、進み具合で文が変わる', () => {
    const leads = [1, 3, 7, 12, 17, 20].map(storyLead);
    expect(new Set(leads).size).toBe(6);
    for (const l of leads) expect(l).not.toContain('完結');
  });
});

describe('物語', () => {
  it('20話で完結し、各話は読み切れる長さ', () => {
    expect(STORY).toHaveLength(FINAL_LEVEL);
    for (const c of STORY) {
      expect(c.title.length).toBeGreaterThan(0);
      expect(chapterLength(c)).toBeGreaterThanOrEqual(200);
      expect(chapterLength(c)).toBeLessThanOrEqual(600);
    }
  });
  it('目次は読める話だけタイトルを出し、まだの話は Lv を示して伏せる', () => {
    const s = freshLevel();
    addExp(s, expForLevel(2));
    const h = storyIndexHtml(s);
    expect(h).toContain(STORY[0].title);
    expect(h).toContain(STORY[1].title);
    expect(h).not.toContain(STORY[2].title);
    expect(h).toContain('Lv 3 で読める');
    expect(h.match(/sc-new/g)).toHaveLength(2);
  });
  it('最終話は「完」で終わり、完結すると目次に完結の印', () => {
    const s = freshLevel();
    addExp(s, expForLevel(FINAL_LEVEL));
    expect(storyChapterHtml(FINAL_LEVEL, s)).toContain('― 完 ―');
    expect(storyIndexHtml(s)).toContain('完結');
  });
});
