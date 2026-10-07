import { describe, expect, it } from 'vitest';
import { gamesAvailable, isSignedIn, loadSnapshot, saveSnapshot, showAchievements, signIn, submitScore, unlockAchievement } from '../src/ui/games';

describe('Play Games（Web 版）', () => {
  it('アプリ版でなければ、どの呼び出しも何もせずに終わる', async () => {
    expect(await gamesAvailable()).toBe(false);
    expect(await isSignedIn()).toBe(false);
    expect(await signIn()).toBe(false);
    expect(await unlockAchievement('x')).toBe(false);
    expect(await submitScore('x', 10)).toBe(false);
    expect(await showAchievements()).toBe(false);
    expect(await saveSnapshot('{}', '', 0)).toBe(false);
    expect(await loadSnapshot()).toBeNull();
  });
});
