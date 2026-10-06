import { describe, expect, it } from 'vitest';
import { NEWS, availableNews, pickNews } from '../src/ui/news';
import { ITEMS } from '../src/ui/shop';
import { SPECS } from '../src/ui/machine/specs';

const ctx = { level: 1, balance: 1000, dayNet: 0, machine: 'ama' as const, rush: false };

describe('液晶の世紀末ニュース', () => {
  it('物語に触れる見出しは、その話を読める Lv になるまで出ない', () => {
    const gated = NEWS.filter((n) => (n.minLevel ?? 1) > 1 && typeof n.text === 'string').map((n) => n.text as string);
    expect(gated.length).toBeGreaterThan(5);
    const lv1 = availableNews(ctx);
    for (const t of gated) expect(lv1).not.toContain(t);
    const lv20 = availableNews({ ...ctx, level: 20 });
    for (const t of gated) expect(lv20).toContain(t);
  });
  it('直近に出した見出しは続けて出さない', () => {
    const all = availableNews(ctx);
    const recent = all.slice(0, all.length - 1);
    expect(pickNews(ctx, recent, () => 0)).toBe(all[all.length - 1]);
  });
  it('プレイヤーの数字（Lv・収支）が文に入る', () => {
    const c = { ...ctx, level: 7, dayNet: 320 };
    const all = availableNews(c);
    expect(all.some((t) => t.includes('Lv 7'))).toBe(true);
    expect(all.some((t) => t.includes('+320 yan'))).toBe(true);
    expect(availableNews({ ...ctx, rush: true }).some((t) => t.includes('RUSH'))).toBe(true);
  });
  it('液晶帯に流せる長さ（60字以内）', () => {
    for (const t of availableNews({ ...ctx, level: 20, balance: 99999, dayNet: -1234, rush: true })) {
      expect(t.length).toBeLessThanOrEqual(60);
    }
  });
});

describe('台・景品の世界観の一言', () => {
  it('すべての台・景品（なし以外）に一言がある', () => {
    for (const s of Object.values(SPECS)) expect(s.flavor.length).toBeGreaterThan(5);
    for (const i of ITEMS.filter((i) => i.value !== '')) expect(i.flavor, i.id).toBeTruthy();
  });
});
