/** Android アプリ版（Capacitor）だけで使う処理。Web 版では何もしない */
import { Capacitor } from '@capacitor/core';
import { App as NativeApp } from '@capacitor/app';
import { startAds } from './ads';

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
  void startAds();
}
