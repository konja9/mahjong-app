/**
 * 吹き出しの置き場所を決める（DOM に触らない純粋な関数。テストしやすいように分けている）。
 * 光らせる対象の上と下の空きを測り、広い方に置く。吹き出しはその空きに収まる高さに抑える。
 * どちらも狭すぎるときは、画面の上端に1行の帯で出す（ヘッダーに重なってよい）
 */

export interface Rect {
  top: number;
  bottom: number;
}

export interface LayoutInput {
  /** 画面の高さ */
  vh: number;
  /** 上端で避ける高さ（ノッチ・広告） */
  safeTop: number;
  /** 下端で避ける高さ（ホームバー） */
  safeBottom: number;
  /** 光らせる対象（光らせる余白を含む） */
  target: Rect;
  /** 吹き出しがほしい高さ */
  want: number;
  /** 答えさせる場面：対象のすぐ上には問題があるので、吹き出しは画面の上端の帯にする */
  answer?: boolean;
}

export type BubbleSide = 'above' | 'below' | 'bar';

export interface Layout {
  side: BubbleSide;
  /** 吹き出しの上端（画面の上から）。上に置くときは下端（bottom）で寄せる */
  top?: number;
  /** 吹き出しの下端（画面の下から） */
  bottom?: number;
  /** 吹き出しの高さの上限 */
  maxH: number;
  /** 指を対象のどちら側に出すか（吹き出しと反対側。空きがなければ対象の中） */
  finger: 'above' | 'below' | 'inside';
}

/** 吹き出しと対象・画面の端との間 */
export const GAP = 10;
/** これより狭い空きには吹き出しを置かない（2行ほど） */
export const MIN_H = 64;
/** 1行の帯の高さ */
export const BAR_H = 72;
/** 指を出すのに要る空き */
export const FINGER = 46;

export function layoutBubble(i: LayoutInput): Layout {
  const { vh, safeTop, safeBottom, target, want } = i;
  const above = target.top - safeTop - GAP * 2;
  const below = vh - safeBottom - target.bottom - GAP * 2;
  const roomFor = (space: number, finger: number) => space - finger;
  // 指は吹き出しの反対側に出す。反対側に空きがなければ対象の中
  const fingerFor = (side: BubbleSide): Layout['finger'] => {
    if (side === 'below') return above >= FINGER ? 'above' : below - Math.min(want, below) >= FINGER ? 'below' : 'inside';
    if (side === 'above') return below >= FINGER ? 'below' : 'inside';
    return below >= FINGER ? 'below' : above >= FINGER + BAR_H ? 'above' : 'inside';
  };
  if (i.answer && above >= BAR_H) return { side: 'bar', top: safeTop + 6, maxH: BAR_H, finger: fingerFor('bar') };
  const side: BubbleSide | null = below >= above ? (below >= MIN_H ? 'below' : above >= MIN_H ? 'above' : null) : above >= MIN_H ? 'above' : below >= MIN_H ? 'below' : null;
  if (!side) return { side: 'bar', top: safeTop + 6, maxH: BAR_H, finger: fingerFor('bar') };
  const space = side === 'below' ? below : above;
  // 指を吹き出しと同じ側に出すしかないときは、その分だけ吹き出しを詰める
  const finger = fingerFor(side);
  const fingerSame = (side === 'below' && finger === 'below') || (side === 'above' && finger === 'above');
  const maxH = Math.max(MIN_H, Math.min(want, fingerSame ? roomFor(space, FINGER) : space));
  if (side === 'below') {
    const top = target.bottom + GAP + (fingerSame ? FINGER : 0);
    return { side, top, maxH, finger };
  }
  // 上に置くときは対象のすぐ上に寄せる
  return { side, bottom: vh - target.top + GAP, maxH, finger };
}
