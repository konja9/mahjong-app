/** Android アプリ版の買い切り「広告削除」（Google Play の課金）。Web 版では呼ばない */
import { NativePurchases, PURCHASE_TYPE, type Transaction } from '@capgo/native-purchases';
import { load, save } from './storage';

/** Play Console で作る1回限りのアイテムの ID（500円） */
export const REMOVE_ADS = 'remove_ads';
const KEY = 'tensu.adfree.v1';

export interface PurchaseState {
  /** Android 版で課金が使えるとき true（Web 版や、Play ストアの無い端末では false） */
  available: boolean;
  /** 広告削除を買ってあるか */
  owned: boolean;
  /** Play に登録した価格の表示（例 ￥500）。取れなければ空 */
  price: string;
  /** 購入・復元の処理中 */
  busy: boolean;
  /** 設定画面に出す、直前の操作の結果 */
  message: string;
}

const state: PurchaseState = { available: false, owned: false, price: '', busy: false, message: '' };
const listeners: ((s: PurchaseState) => void)[] = [];

export function purchaseState(): PurchaseState {
  return state;
}

/** 状態が変わったら呼ぶ（設定画面の再描画、広告の削除） */
export function onPurchaseChange(fn: (s: PurchaseState) => void): void {
  listeners.push(fn);
}

function set(patch: Partial<PurchaseState>): void {
  Object.assign(state, patch);
  if (patch.owned !== undefined) save(KEY, state.owned);
  listeners.forEach((fn) => fn(state));
}

/** Android の購入状態 "1" が支払い済み（"0" は コンビニ払いなどの支払い待ち） */
const isOwned = (purchases: Transaction[]) =>
  purchases.some((p) => p.productIdentifier === REMOVE_ADS && p.purchaseState === '1');

/** 端末に記録された購入を Google Play に問い合わせる。失敗したら前回の結果を使う */
async function refresh(): Promise<void> {
  try {
    // 支払い待ちから支払い済みになった購入を確定（acknowledge）する。3日以内に確定しないと自動で返金される
    await NativePurchases.restorePurchases().catch(() => undefined);
    const { purchases } = await NativePurchases.getPurchases({ productType: PURCHASE_TYPE.INAPP });
    // 返金された購入は一覧から消えるので、そのときは広告に戻る（次の起動から）
    const owned = isOwned(purchases);
    if (owned !== state.owned) set({ owned });
  } catch (e) {
    console.warn('購入状態を確認できませんでした', e);
  }
}

/** 起動時に呼ぶ。広告削除を買ってあれば true */
export async function initPurchases(): Promise<boolean> {
  state.owned = load<boolean>(KEY, false) === true;
  try {
    const { isBillingSupported } = await NativePurchases.isBillingSupported();
    if (!isBillingSupported) return state.owned;
  } catch {
    return state.owned;
  }
  state.available = true;
  await refresh();
  void NativePurchases.getProduct({ productIdentifier: REMOVE_ADS, productType: PURCHASE_TYPE.INAPP })
    .then(({ product }) => set({ price: product.priceString }))
    .catch(() => undefined);
  // 別アプリ（コンビニ払いの手続きなど）から戻ったら、支払いが済んだかを見直す
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && !state.owned && !state.busy) void refresh();
  });
  return state.owned;
}

/** 購入画面を出す */
export async function buyRemoveAds(): Promise<void> {
  if (!state.available || state.busy || state.owned) return;
  set({ busy: true, message: '' });
  try {
    const t = await NativePurchases.purchaseProduct({
      productIdentifier: REMOVE_ADS,
      productType: PURCHASE_TYPE.INAPP,
      quantity: 1,
    });
    if (t.purchaseState === '1' || t.purchaseState === undefined) {
      set({ owned: true, message: 'ご購入ありがとうございます。広告を消しました' });
    } else {
      set({ message: '支払いの完了を待っています。完了すると広告が消えます' });
    }
  } catch (e) {
    const { code, message } = (e ?? {}) as { code?: string; message?: string };
    if (code === 'USER_CANCELED') set({ message: '' });
    else if (code === 'ITEM_ALREADY_OWNED') {
      // 別の端末で買ってあるなど。購入を取り込む
      await refresh();
      set({ message: state.owned ? '購入済みでした。広告を消しました' : '購入済みですが、確認できませんでした。「購入を復元」を試してください' });
    }
    else if (message?.includes('pending')) set({ message: '支払いの完了を待っています。完了すると広告が消えます' });
    else set({ message: `購入できませんでした（${code ?? message ?? '不明なエラー'}）` });
  } finally {
    set({ busy: false });
  }
}

/** 機種変更・再インストールのあとに、前に買った広告削除を取り戻す */
export async function restoreRemoveAds(): Promise<void> {
  if (!state.available || state.busy) return;
  set({ busy: true, message: '' });
  await refresh();
  set({
    busy: false,
    message: state.owned ? '購入を復元しました。広告を消しました' : 'この Google アカウントでの購入は見つかりませんでした',
  });
}
