import { describe, expect, it } from 'vitest';
import { ACHIEVEMENTS, type AchievementState, earnedAchievements, newAchievements } from '../src/ui/achievements';
import { ACHIEVEMENT_IDS, LEADERBOARD_IDS } from '../src/ui/gamesIds';

const zero: AchievementState = { hits: 0, rushes: 0, premiums: 0, rank: 0, slots: 0, ownedParts: 0, level: 1, notesRead: 0, bestStreak: 0, totalCorrect: 0, yakuman: 0 };

describe('Play Games の実績', () => {
  it('15個あり、名前と説明があり、ID の表とそろっている', () => {
    expect(ACHIEVEMENTS).toHaveLength(15);
    for (const a of ACHIEVEMENTS) expect(a.name && a.desc).toBeTruthy();
    expect(Object.keys(ACHIEVEMENT_IDS).sort()).toEqual(ACHIEVEMENTS.map((a) => a.id).sort());
    expect(Object.keys(LEADERBOARD_IDS)).toEqual(['bestStreak', 'totalCorrect']);
  });
  it('はじめは何も取れていない', () => {
    expect(earnedAchievements(zero)).toEqual([]);
  });
  it('状態に応じて取れる', () => {
    expect(earnedAchievements({ ...zero, hits: 1, rank: 1, slots: 1, totalCorrect: 120 })).toEqual(['firstBonus', 'rank5kyu', 'correct100']);
    const all = earnedAchievements({ hits: 9, rushes: 3, premiums: 1, rank: 10, slots: 5, ownedParts: 12, level: 20, notesRead: 10, bestStreak: 25, totalCorrect: 6000, yakuman: 1 });
    expect(all).toHaveLength(15);
  });
  it('送ったものは返さない', () => {
    const s = { ...zero, hits: 1, rushes: 1, bestStreak: 20 };
    expect(newAchievements(s, ['firstBonus'])).toEqual(['firstRush', 'streak20']);
  });
});
