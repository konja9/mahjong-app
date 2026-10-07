/**
 * 画面のスクロールの扱い。
 * スマホ幅では html・body・#app を overflow: hidden にして main（とダイアログの本文）だけをスクロールさせる。
 * ところが scrollIntoView は overflow: hidden の先祖まで動かすので、ページ全体が少しずつ上にずれて
 * ヘッダーが隠れてしまう。要素を見せるときは scrollToView を使い、スクロールしてよい箱だけを動かす
 */

/** スクロールしてよい箱か（overflow-y が auto か scroll で、中身があふれている） */
function scrollable(el: Element): boolean {
  const oy = getComputedStyle(el).overflowY;
  return (oy === 'auto' || oy === 'scroll') && el.scrollHeight > el.clientHeight + 1;
}

/** いちばん近い、スクロールしてよい先祖（なければ null） */
export function scrollBox(el: Element): HTMLElement | null {
  for (let p = el.parentElement; p && p !== document.body && p !== document.documentElement; p = p.parentElement) {
    if (scrollable(p)) return p;
  }
  return null;
}

/**
 * 要素が見えるように、スクロールしてよい箱だけを動かす。
 * block：'center' は箱の中央へ、'start' は上端へ、'nearest' は見えていれば動かさない。
 * 箱がない（PC 幅でページ自体がスクロールする）ときはページを動かすが、見えていれば動かさない
 */
export function scrollToView(el: Element | null, block: 'center' | 'start' | 'nearest' = 'nearest', smooth = true): void {
  if (!el) return;
  const box = scrollBox(el);
  const r = el.getBoundingClientRect();
  const behavior: ScrollBehavior = smooth && !matchMedia('(prefers-reduced-motion: reduce)').matches ? 'smooth' : 'auto';
  if (box) {
    const b = box.getBoundingClientRect();
    const inView = r.top >= b.top && r.bottom <= b.bottom;
    if (block === 'nearest' && inView) return;
    const offset = r.top - b.top + box.scrollTop;
    const top = block === 'start' ? offset - 8 : block === 'center' ? offset - (b.height - r.height) / 2 : r.top < b.top ? offset - 8 : offset - b.height + r.height + 8;
    box.scrollTo({ top: Math.max(0, top), behavior });
    return;
  }
  // ページ自体がスクロールする（PC 幅）：見えていれば動かさない
  const vh = window.innerHeight;
  if (r.top >= 0 && r.bottom <= vh) return;
  const top = window.scrollY + r.top - (block === 'start' ? 16 : (vh - r.height) / 2);
  window.scrollTo({ top: Math.max(0, top), behavior });
}

/**
 * スマホ幅で、動かしてはいけない外側（window・html・body・#app）がスクロールしたら元に戻す。
 * フォーカスの移動など、scrollToView 以外の原因でずれたときの保険
 */
export function lockPageScroll(app: HTMLElement, isCompact: () => boolean): void {
  const reset = (el: Element) => {
    if (isCompact() && el.scrollTop !== 0) el.scrollTop = 0;
  };
  window.addEventListener(
    'scroll',
    () => {
      if (isCompact() && (window.scrollY || window.scrollX)) window.scrollTo(0, 0);
      reset(document.documentElement);
      reset(document.body);
    },
    { passive: true },
  );
  app.addEventListener('scroll', () => reset(app), { passive: true });
  // body と html は scroll イベントが window に来ないこともあるので、まとめて監視する
  document.addEventListener('scroll', (e) => {
    const t = e.target;
    if (t === document || t === document.body || t === document.documentElement) {
      reset(document.documentElement);
      reset(document.body);
    }
  }, { capture: true, passive: true });
}
