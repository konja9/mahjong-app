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

/** 開発ビルド（テスト広告）だけ、広告の状態を画面の下端に文字で出す。実機で広告が出ない原因を見るため */
function debug(msg: string): void {
  if (BANNER_ID) return;
  console.info('[ads]', msg);
  let el = document.getElementById('ad-debug');
  if (!el) {
    el = document.createElement('div');
    el.id = 'ad-debug';
    el.style.cssText =
      'position:fixed;left:8px;right:8px;bottom:calc(env(safe-area-inset-bottom,0px) + 4px);z-index:9999;padding:4px 8px;border-radius:6px;background:rgba(0,0,0,.8);color:#9ef;font:11px/1.4 monospace;pointer-events:none;white-space:pre-wrap';
    document.body.appendChild(el);
  }
  el.textContent = `広告: ${msg}`;
}

function errText(e: unknown): string {
  if (e && typeof e === 'object') {
    const { code, message } = e as { code?: unknown; message?: unknown };
    return [code, message].filter((v) => v !== undefined).join(' ') || JSON.stringify(e);
  }
  return String(e);
}

/**
 * 同意の確認（EEA・英国など）をしてからバナーを出す。
 * 同意の確認が失敗しても（登録したばかりの AdMob アプリでは失敗することがある）バナーは出す。
 * どこで失敗してもゲームは遊べるよう、エラーは画面を止めない
 */
export async function startAds(): Promise<void> {
  if (started) return;
  started = true;
  try {
    debug('初期化中…');
    await AdMob.initialize({ maxAdContentRating: MaxAdContentRating.ParentalGuidance });
  } catch (e) {
    debug(`初期化に失敗：${errText(e)}`);
    return;
  }
  try {
    let consent = await AdMob.requestConsentInfo();
    if (consent.status === AdmobConsentStatus.REQUIRED && consent.isConsentFormAvailable) {
      consent = await AdMob.showConsentForm();
    }
    // PrivacyOptionsRequirementStatus はパッケージの入口から export されていないので文字列で比べる
    privacyRequired = String(consent.privacyOptionsRequirementStatus) === 'REQUIRED';
    if (!consent.canRequestAds) {
      debug(`同意が得られていないため表示しません（${consent.status}）`);
      return;
    }
  } catch (e) {
    debug(`同意の確認に失敗（バナーは出します）：${errText(e)}`);
  }
  try {
    await AdMob.addListener(BannerAdPluginEvents.SizeChanged, ({ height }) => setBannerHeight(height));
    await AdMob.addListener(BannerAdPluginEvents.Loaded, () => {
      debug('表示しました');
      setTimeout(() => document.getElementById('ad-debug')?.remove(), 5000);
    });
    await AdMob.addListener(BannerAdPluginEvents.FailedToLoad, (e) => debug(`読み込みに失敗：${errText(e)}`));
    debug('読み込み中…');
    await AdMob.showBanner({
      adId: BANNER_ID || TEST_BANNER_ID,
      isTesting: !BANNER_ID,
      adSize: BannerAdSize.ADAPTIVE_BANNER,
      position: BannerAdPosition.TOP_CENTER,
      margin: 0,
    });
  } catch (e) {
    debug(`バナーを出せませんでした：${errText(e)}`);
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
