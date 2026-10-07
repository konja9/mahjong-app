import { describe, expect, it } from 'vitest';
import { hasBadge, menuBadges, menuHtml } from '../src/ui/menu';
import { examTabHtml } from '../src/ui/exam';
import { gossipLine } from '../src/ui/news';
import { startHtml } from '../src/ui/start';

const base = { canExam: false, slots: 1, equipped: 1, owned: 1, unread: 0 };

describe('メニュー', () => {
  it('NEW：受けられる試験・付けられるパーツ・読んでいない話', () => {
    expect(hasBadge(menuBadges(base))).toBe(false);
    expect(menuBadges({ ...base, canExam: true }).exam).toBe(true);
    expect(menuBadges({ ...base, slots: 2, owned: 2 }).parts).toBe(true);
    // 枠が空いていても、付けるパーツがなければ印は出さない
    expect(menuBadges({ ...base, slots: 2, owned: 1 }).parts).toBe(false);
    expect(menuBadges({ ...base, unread: 1 }).story).toBe(true);
  });
  it('項目がそろっていて、自分の状態が出る', () => {
    const h = menuHtml({
      level: 5, into: 100, need: 400, rank: '5級', title: '符読み', balance: 1320, dayNet: 320,
      slots: 2, equipped: 1, machine: '甘デジ', keiko: false, badges: menuBadges({ ...base, canExam: true }),
    });
    for (const m of ['machine', 'parts', 'exam', 'shop', 'story', 'summary', 'help', 'settings', 'start']) expect(h).toContain(`data-menu="${m}"`);
    expect(h).toContain('Lv 5');
    expect(h).toContain('5級');
    expect(h).toContain('+320');
    expect(h).toContain('mn-new');
  });
});

describe('昇段試験のタブ', () => {
  it('合格済み・受けられる・Lv 不足が分かる', () => {
    const h = examTabHtml({ rank: 1, passedAt: ['2026-10-06'] }, 4, true);
    expect(h).toContain('合格 2026-10-06');
    expect(h).toContain('受けられる');
    expect(h).toContain('Lv 6');
    expect(h).toContain('data-exam-start');
    expect(examTabHtml({ rank: 1, passedAt: [] }, 3, true)).not.toContain('data-exam-start');
    expect(examTabHtml({ rank: 1, passedAt: [] }, 4, false)).toMatch(/data-exam-start disabled/);
  });
});

describe('世間話とスタート画面', () => {
  it('ニュースはしゃべり言葉にする（自分の言葉はそのまま）', () => {
    expect(gossipLine('yan 相場、高止まり', () => 0)).toBe('聞いたか？　yan 相場、高止まり');
    expect(gossipLine('目が回らないのかって？　毎日回ってりゃ慣れるさ')).toBe('目が回らないのかって？　毎日回ってりゃ慣れるさ');
  });
  it('スタート画面に昇段試験の入り口はない（メニューから）', () => {
    expect(startHtml({ first: false, balance: 1000, level: 10, cleared: false })).not.toContain('昇段試験');
  });
});

describe('台のダイアログ', () => {
  it('タブはなく、メニューで選んだ画面の見出しだけが出る', async () => {
    const { shopHtml, freshShop } = await import('../src/ui/shop');
    const view = { state: { owned: [], equip: [] }, slots: 1, rank: '', nextSlotRank: '5級', slotRanks: ['5級', '3級', '1級', '二段', '名人'], canChange: true };
    for (const [tab, title] of [['machines', '台選び'], ['parts', '改造'], ['exam', '昇段試験']] as const) {
      const h = shopHtml(freshShop(), 'machine', 1000, true, 'title', { view, tab, examHtml: '<p>exam</p>' });
      expect(h).toContain(`<span>${title}</span>`);
      expect(h).not.toContain('data-machine-tab');
    }
  });
});
