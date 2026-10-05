import { beforeEach, describe, expect, it, vi } from 'vitest';

// Google Play の課金プラグインの代わり
const plugin = {
  isBillingSupported: vi.fn(),
  restorePurchases: vi.fn(),
  getPurchases: vi.fn(),
  getProduct: vi.fn(),
  purchaseProduct: vi.fn(),
};
vi.mock('@capgo/native-purchases', () => ({
  NativePurchases: plugin,
  PURCHASE_TYPE: { INAPP: 'inapp', SUBS: 'subs' },
}));

const bought = { productIdentifier: 'remove_ads', purchaseState: '1' };
let store: Record<string, string>;

/** モジュールの状態（購入済みかなど）をテストごとに作り直す */
async function fresh() {
  vi.resetModules();
  return import('../src/ui/purchase');
}

beforeEach(() => {
  store = {};
  Object.defineProperty(globalThis, 'localStorage', {
    value: { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => (store[k] = v) },
    configurable: true,
  });
  Object.defineProperty(globalThis, 'document', { value: { addEventListener: vi.fn() }, configurable: true });
  plugin.isBillingSupported.mockResolvedValue({ isBillingSupported: true });
  plugin.restorePurchases.mockResolvedValue(undefined);
  plugin.getPurchases.mockResolvedValue({ purchases: [] });
  plugin.getProduct.mockResolvedValue({ product: { priceString: '￥500' } });
  plugin.purchaseProduct.mockReset();
});

describe('広告削除の購入', () => {
  it('買っていなければ広告を出す。価格を取得する', async () => {
    const p = await fresh();
    expect(await p.initPurchases()).toBe(false);
    await vi.waitFor(() => expect(p.purchaseState().price).toBe('￥500'));
    expect(p.purchaseState().available).toBe(true);
  });

  it('Play に購入があれば広告を出さない（再インストール後も）', async () => {
    plugin.getPurchases.mockResolvedValue({ purchases: [bought] });
    const p = await fresh();
    expect(await p.initPurchases()).toBe(true);
  });

  it('支払い待ち（コンビニ払いなど）は購入済みにしない', async () => {
    plugin.getPurchases.mockResolvedValue({ purchases: [{ ...bought, purchaseState: '0' }] });
    const p = await fresh();
    expect(await p.initPurchases()).toBe(false);
  });

  it('返金されて一覧から消えたら広告に戻る', async () => {
    store['tensu.adfree.v1'] = 'true';
    const p = await fresh();
    expect(await p.initPurchases()).toBe(false);
    expect(store['tensu.adfree.v1']).toBe('false');
  });

  it('通信できないときは前回の結果を使う', async () => {
    store['tensu.adfree.v1'] = 'true';
    plugin.getPurchases.mockRejectedValue(new Error('offline'));
    const p = await fresh();
    expect(await p.initPurchases()).toBe(true);
  });

  it('課金が使えない端末では購入の欄を出さない', async () => {
    plugin.isBillingSupported.mockResolvedValue({ isBillingSupported: false });
    const p = await fresh();
    expect(await p.initPurchases()).toBe(false);
    expect(p.purchaseState().available).toBe(false);
  });

  it('買うと購入済みになり、変化を知らせる', async () => {
    const p = await fresh();
    await p.initPurchases();
    const seen = vi.fn();
    p.onPurchaseChange(seen);
    plugin.purchaseProduct.mockResolvedValue(bought);
    await p.buyRemoveAds();
    expect(p.purchaseState().owned).toBe(true);
    expect(p.purchaseState().busy).toBe(false);
    expect(seen).toHaveBeenCalledWith(expect.objectContaining({ owned: true }));
    expect(store['tensu.adfree.v1']).toBe('true');
  });

  it('キャンセルはエラーを出さない', async () => {
    const p = await fresh();
    await p.initPurchases();
    plugin.purchaseProduct.mockRejectedValue({ code: 'USER_CANCELED', message: 'Purchase is not purchased' });
    await p.buyRemoveAds();
    expect(p.purchaseState().owned).toBe(false);
    expect(p.purchaseState().message).toBe('');
  });

  it('支払い待ちは、完了したら消えると伝える', async () => {
    const p = await fresh();
    await p.initPurchases();
    plugin.purchaseProduct.mockRejectedValue({ message: 'Purchase is pending' });
    await p.buyRemoveAds();
    expect(p.purchaseState().owned).toBe(false);
    expect(p.purchaseState().message).toContain('支払いの完了を待っています');
  });

  it('購入済みと言われたら購入を取り込む', async () => {
    const p = await fresh();
    await p.initPurchases();
    plugin.purchaseProduct.mockRejectedValue({ code: 'ITEM_ALREADY_OWNED' });
    plugin.getPurchases.mockResolvedValue({ purchases: [bought] });
    await p.buyRemoveAds();
    expect(p.purchaseState().owned).toBe(true);
  });

  it('復元：見つからなければそう伝える。見つかれば購入済みにする', async () => {
    const p = await fresh();
    await p.initPurchases();
    await p.restoreRemoveAds();
    expect(p.purchaseState().message).toContain('見つかりませんでした');
    plugin.getPurchases.mockResolvedValue({ purchases: [bought] });
    await p.restoreRemoveAds();
    expect(p.purchaseState().owned).toBe(true);
    expect(p.purchaseState().message).toContain('復元しました');
  });
});
