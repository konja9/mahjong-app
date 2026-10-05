import { describe, expect, it } from 'vitest';
import { freshMissions, missionDef } from '../src/ui/missions';
import { ITEMS, buyItem, checkUnlocks, equipItem, freshShop, loadShop, missionStrip, unlockMachine } from '../src/ui/shop';

describe('交換所', () => {
  it('所持金が足りないと買えない。買うと装備される', () => {
    const s = freshShop();
    expect(buyItem(s, 'back-indigo', 1499)).toBe(0);
    expect(buyItem(s, 'back-indigo', 1500)).toBe(1500);
    expect(s.equip.back).toBe('back-indigo');
    expect(buyItem(s, 'back-indigo', 99999)).toBe(0);
  });
  it('持っている景品だけ装備を切り替えられる', () => {
    const s = freshShop();
    expect(equipItem(s, 'skin-rainbow')).toBe(false);
    expect(equipItem(s, 'skin-gold')).toBe(true);
  });
  it('台の解放', () => {
    const s = freshShop();
    expect(unlockMachine(s, 'middle', 2999)).toBe(0);
    expect(unlockMachine(s, 'middle', 3000)).toBe(3000);
    expect(s.machines).toContain('middle');
  });
});

describe('ミッションの帯', () => {
  it('未達成のうち最も進んでいるものを出し、全部達成で完了表示', () => {
    const s = freshShop();
    const m = freshMissions();
    s.missions = m;
    const [a, b] = m.ids;
    m.progress[a] = 1;
    m.progress[b] = missionDef(b).target - 1;
    expect(missionStrip(s).text).toContain(missionDef(b).label);
    m.done = [...m.ids];
    const all = missionStrip(s);
    expect(all.done).toBe(all.total);
    expect(all.ratio).toBe(1);
  });
});

describe('称号と BGM', () => {
  it('称号は25個以上あり、実力の称号は買えない・最初は持っていない', () => {
    const titles = ITEMS.filter((i) => i.kind === 'title');
    expect(titles.length).toBeGreaterThanOrEqual(25);
    const s = freshShop();
    const earned = titles.filter((i) => i.unlock);
    expect(earned.length).toBeGreaterThanOrEqual(10);
    for (const i of earned) {
      expect(s.owned).not.toContain(i.id);
      expect(buyItem(s, i.id, 1e9)).toBe(0);
    }
  });
  it('条件を満たすと実力の称号が手に入る（一度だけ）', () => {
    const s = freshShop();
    expect(checkUnlocks(s)).toEqual([]);
    s.stats.maxStreak = 20;
    s.stats.perfectBonus = 1;
    const got = checkUnlocks(s).map((i) => i.name);
    expect(got).toContain('連チャン職人');
    expect(got).toContain('初陣');
    expect(got).not.toContain('不動心');
    expect(checkUnlocks(s)).toEqual([]);
    expect(equipItem(s, 'title-streak20')).toBe(true);
  });
  it('古い保存データ（stats・BGM なし）を読み込んでも動く', () => {
    const store = new Map<string, string>();
    const ls = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) };
    Object.defineProperty(globalThis, 'localStorage', { value: ls, configurable: true });
    store.set('tensu.shop.v1', JSON.stringify({ machine: 'ama', machines: ['ama'], owned: ['back-green', 'skin-gold', 'title-none', 'title-fast'], equip: { back: 'back-green', skin: 'skin-gold', title: 'title-fast' } }));
    const s = loadShop();
    expect(s.stats.correct.fu).toBe(0);
    expect(s.owned).toContain('bgm-standard');
    expect(s.equip.bgm).toBe('bgm-standard');
    expect(s.equip.title).toBe('title-fast');
  });
  it('BGM を買って装備できる', () => {
    const s = freshShop();
    expect(buyItem(s, 'bgm-euro', 2500)).toBe(2500);
    expect(s.equip.bgm).toBe('bgm-euro');
  });
});

describe('交換所のタブ', () => {
  it('各タブには該当する景品だけが出る', async () => {
    const { itemsHtml } = await import('../src/ui/shop');
    const s = freshShop();
    const title = itemsHtml(s, 0, true, 'title');
    expect(title).toContain('連チャン職人');
    expect(title).not.toContain('ユーロビート');
    const skin = itemsHtml(s, 0, true, 'skin');
    expect(skin).toContain('朱漆');
    expect(skin).not.toContain('連チャン職人');
    const bgm = itemsHtml(s, 0, true, 'bgm');
    expect(bgm).toContain('ユーロビート');
    expect(bgm).not.toContain('朱漆');
  });
});
