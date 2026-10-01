/** Android アプリ版の上部バナー広告（AdMob）。Web 版では呼ばない */
import {
  AdMob,
  AdmobConsentStatus,
  BannerAdPluginEvents,
  BannerAdPosition,
  BannerAdSize,
  MaxAdContentRating,
} from '@capacitor-community/admob';

/**
 * 本番の広告ユニット ID は .env.release の VITE_ADMOB_BANNER_ID に書き、npm run android:release のときだけ読む。
 * 無いとき（npm run android の開発ビルド）は Google のテスト広告を出す（開発中に本番広告を表示・タップするとアカウント停止の対象になるため）
 */
const BANNER_ID: string = import.meta.env.VITE_ADMOB_BANNER_ID ?? '';
const TEST_BANNER_ID = 'ca-app-pub-3940256099942544/9214589741';

/** バナーと液晶帯の間の余白（px）。液晶帯はタップで台選びが開くので、誤タップを防ぐために離す */
const GAP = 8;

let privacyRequired = false;
let started = false;

/** 広告の高さ分だけ画面を下げる（バナーはアプリの画面の上に重なって表示されるため） */
function setBannerHeight(h: number): void {
  document.documentElement.style.setProperty('--ad-h', h > 0 ? `${h + GAP}px` : '0px');
  document.body.classList.toggle('has-ad', h > 0);
}

/** 同意の確認（EEA・英国など）をしてからバナーを出す。失敗しても遊べるよう、エラーは握りつぶす */
export async function startAds(): Promise<void> {
  if (started) return;
  started = true;
  try {
    await AdMob.initialize({ maxAdContentRating: MaxAdContentRating.ParentalGuidance });
    let consent = await AdMob.requestConsentInfo();
    if (consent.status === AdmobConsentStatus.REQUIRED && consent.isConsentFormAvailable) {
      consent = await AdMob.showConsentForm();
    }
    // PrivacyOptionsRequirementStatus はパッケージの入口から export されていないので文字列で比べる
    privacyRequired = String(consent.privacyOptionsRequirementStatus) === 'REQUIRED';
    if (!consent.canRequestAds) return;
    await AdMob.addListener(BannerAdPluginEvents.SizeChanged, ({ height }) => setBannerHeight(height));
    await AdMob.showBanner({
      adId: BANNER_ID || TEST_BANNER_ID,
      isTesting: !BANNER_ID,
      adSize: BannerAdSize.ADAPTIVE_BANNER,
      position: BannerAdPosition.TOP_CENTER,
      margin: 0,
    });
  } catch (e) {
    console.warn('広告を表示できませんでした', e);
  }
}

/** バナーを消す（広告削除を買ったとき） */
export async function stopAds(): Promise<void> {
  if (!started) return;
  await AdMob.removeBanner().catch(() => undefined);
  setBannerHeight(0);
}

/** 同意の変更（プライバシー設定）を設定画面に出す必要があるか。EEA・英国などで true */
export function adPrivacyRequired(): boolean {
  return privacyRequired;
}

export function showAdPrivacyOptions(): void {
  void AdMob.showPrivacyOptionsForm().catch(() => undefined);
}
