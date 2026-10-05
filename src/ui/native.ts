/** Android アプリ版（Capacitor）だけで使う処理。Web 版では何もしない */
import { Capacitor } from '@capacitor/core';
import { App as NativeApp } from '@capacitor/app';
import { startAds, stopAds } from './ads';
import { initPurchases, onPurchaseChange } from './purchase';

interface BackHandler {
  /** 開いているダイアログやシートを1つ閉じる。閉じるものがなければ false */
  back(): boolean;
}

export function setupNative(app: BackHandler): void {
  if (!Capacitor.isNativePlatform()) return;
  document.body.classList.add('native');
  // 戻るボタン：開いているものを閉じる。何もなければアプリを背面へ（終了はせず、所持金や BONUS をそのまま残す）
  void NativeApp.addListener('backButton', () => {
    if (!app.back()) void NativeApp.minimizeApp();
  });
  // 広告削除を買ってあれば広告を出さない。買った瞬間に消す（返金で戻るのは次の起動から）
  onPurchaseChange((p) => {
    if (p.owned) void stopAds();
  });
  void initPurchases().then((owned) => {
    if (!owned) void startAds();
  });
}
