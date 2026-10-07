import { describe, expect, it } from 'vitest';
import { type KeyStore, applySave, decide, packSave, parseSave, progressOf } from '../src/ui/cloudSave';

/** localStorage の代わり */
function store(init: Record<string, string> = {}): KeyStore & { dump(): Record<string, string> } {
  const m = new Map(Object.entries(init));
  return {
    get length() {
      return m.size;
    },
    key: (i) => [...m.keys()][i] ?? null,
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, v),
    removeItem: (k) => void m.delete(k),
    dump: () => Object.fromEntries(m),
  };
}

const lv = (exp: number) => JSON.stringify({ exp, read: [] });
const exam = (rank: number) => JSON.stringify({ rank, passedAt: [] });
const rec = (c: number) => JSON.stringify({ total: { fu: { n: c, c } } });

describe('クラウドセーブ', () => {
  it('tensu.* をまとめ、広告削除の購入状態とほかのアプリのキーは入れない', () => {
    const s = store({ 'tensu.level.v1': lv(500), 'tensu.adfree.v1': 'true', 'other.key': 'x', 'tensu.wallet.v1': '{"balance":1}' });
    const save = packSave(s, 123);
    expect(save.at).toBe(123);
    expect(Object.keys(save.data).sort()).toEqual(['tensu.level.v1', 'tensu.wallet.v1']);
  });
  it('まとめて戻すと同じになり、広告削除の購入状態は端末のものを残す', () => {
    const a = store({ 'tensu.level.v1': lv(900), 'tensu.shop.v1': '{"owned":["x"]}' });
    const b = store({ 'tensu.level.v1': lv(10), 'tensu.tips.v1': '[]', 'tensu.adfree.v1': 'true' });
    applySave(b, parseSave(JSON.stringify(packSave(a)))!);
    expect(b.dump()).toEqual({ 'tensu.level.v1': lv(900), 'tensu.shop.v1': '{"owned":["x"]}', 'tensu.adfree.v1': 'true' });
  });
  it('壊れたデータは読まない', () => {
    expect(parseSave('')).toBeNull();
    expect(parseSave('{oops')).toBeNull();
    expect(parseSave('{"v":1}')).toBeNull();
    expect(parseSave('{"data":{"tensu.a":1,"x.b":"2","tensu.c":"3"}}')!.data).toEqual({ 'tensu.c': '3' });
  });
  it('進み具合は 経験値 → 段位 → 累計正解数 で比べ、説明を付ける', () => {
    const save = (exp: number, rank: number, c: number) => packSave(store({ 'tensu.level.v1': lv(exp), 'tensu.exam.v1': exam(rank), 'tensu.record.v1': rec(c) }));
    expect(progressOf(save(52000, 6, 10)).label).toBe('Lv 12・初段');
    expect(progressOf(save(0, 0, 0)).label).toBe('Lv 1');
    expect(decide(save(100, 0, 0), null)).toBe('push');
    expect(decide(save(100, 0, 0), save(200, 0, 0))).toBe('ask');
    expect(decide(save(300, 0, 0), save(200, 5, 0))).toBe('push');
    expect(decide(save(200, 1, 0), save(200, 2, 0))).toBe('ask');
    expect(decide(save(200, 2, 50), save(200, 2, 40))).toBe('push');
    expect(decide(save(200, 2, 50), save(200, 2, 50))).toBe('same');
    // 壊れた中身でも落ちない
    expect(progressOf({ v: 1, at: 0, data: { 'tensu.level.v1': '{oops' } }).exp).toBe(0);
  });
});
