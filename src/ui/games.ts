import { Capacitor, registerPlugin } from '@capacitor/core';

/**
 * Google Play Games Services（アプリ版だけ）。ネイティブ側は android/…/PlayGamesPlugin.java。
 * Web 版・Play Console の ID がまだ入っていないとき・通信できないときは、どの呼び出しも何もせずに終わる（ゲームは止めない）
 */

interface PlayGamesPlugin {
  isAvailable(): Promise<{ available: boolean }>;
  isAuthenticated(): Promise<{ authenticated: boolean }>;
  signIn(): Promise<{ authenticated: boolean }>;
  unlock(o: { id: string }): Promise<void>;
  submitScore(o: { id: string; score: number }): Promise<void>;
  showAchievements(): Promise<void>;
  showLeaderboard(o: { id?: string }): Promise<void>;
  saveSnapshot(o: { name: string; data: string; description: string; progress: number }): Promise<void>;
  loadSnapshot(o: { name: string }): Promise<{ found: boolean; data?: string; modified?: number }>;
}

const plugin = Capacitor.isNativePlatform() ? registerPlugin<PlayGamesPlugin>('PlayGames') : null;
/** クラウドセーブの名前（1人1つ） */
export const SNAPSHOT_NAME = 'pachifuto-main';

let available: boolean | null = null;

/** この端末で Play Games を使えるか（アプリ版で、ID が入っている） */
export async function gamesAvailable(): Promise<boolean> {
  if (!plugin) return false;
  if (available === null) available = await plugin.isAvailable().then((r) => r.available).catch(() => false);
  return available;
}

const safe = async <T>(f: (p: PlayGamesPlugin) => Promise<T>, fallback: T): Promise<T> => {
  if (!plugin || !(await gamesAvailable())) return fallback;
  try {
    return await f(plugin);
  } catch {
    return fallback;
  }
};

export const isSignedIn = () => safe((p) => p.isAuthenticated().then((r) => r.authenticated), false);
export const signIn = () => safe((p) => p.signIn().then((r) => r.authenticated), false);
export const unlockAchievement = (id: string) => (id ? safe((p) => p.unlock({ id }).then(() => true), false) : Promise.resolve(false));
export const submitScore = (id: string, score: number) =>
  id ? safe((p) => p.submitScore({ id, score: Math.floor(score) }).then(() => true), false) : Promise.resolve(false);
export const showAchievements = () => safe((p) => p.showAchievements().then(() => true), false);
export const showLeaderboard = (id?: string) => safe((p) => p.showLeaderboard({ id }).then(() => true), false);
export const saveSnapshot = (data: string, description: string, progress: number) =>
  safe((p) => p.saveSnapshot({ name: SNAPSHOT_NAME, data, description, progress }).then(() => true), false);
export const loadSnapshot = () => safe((p) => p.loadSnapshot({ name: SNAPSHOT_NAME }).then((r) => (r.found ? (r.data ?? null) : null)), null as string | null);
