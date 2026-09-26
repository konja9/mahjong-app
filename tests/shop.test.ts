import { describe, expect, it } from 'vitest';
import { buyItem, equipItem, freshShop, unlockMachine } from '../src/ui/shop';

describe('交換所', () => {
  it('所持金が足りないと買えない。買うと装備される', () => {
    const s = freshShop();
    expect(buyItem(s, 'back-indigo', 3999)).toBe(0);
    expect(buyItem(s, 'back-indigo', 4000)).toBe(4000);
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
    expect(unlockMachine(s, 'middle', 7999)).toBe(0);
    expect(unlockMachine(s, 'middle', 8000)).toBe(8000);
    expect(s.machines).toContain('middle');
  });
});
