import type { Hand, Meld } from '../core/hand';
import { type Tile, isHonor, numOf, suitOf, tileName } from '../core/tiles';

/**
 * 自作 SVG 牌。色は CSS 変数で与える。
 * 面（60×80）の下に骨色の層と深緑の背を重ねて厚みを出す（全体 60×87、横向きは 80×67）
 */

const W = 60;
const H = 80;
/** 厚み（骨色の層＋背） */
const D = 7;
const KANJI = ['一', '二', '三', '四', '五', '六', '七', '八', '九'];

type Dot = [number, number, string];
const B = 'var(--tile-blue)';
const G = 'var(--tile-green)';
const R = 'var(--tile-red)';

const PIN: Record<number, Dot[]> = {
  1: [[30, 40, R]],
  2: [
    [30, 23, G],
    [30, 57, B],
  ],
  3: [
    [16, 19, B],
    [30, 40, R],
    [44, 61, G],
  ],
  4: [
    [19, 24, B],
    [41, 24, G],
    [19, 56, G],
    [41, 56, B],
  ],
  5: [
    [18, 20, B],
    [42, 20, G],
    [30, 40, R],
    [18, 60, G],
    [42, 60, B],
  ],
  6: [
    [19, 17, G],
    [41, 17, G],
    [19, 42, R],
    [41, 42, R],
    [19, 63, R],
    [41, 63, R],
  ],
  7: [
    [15, 13, G],
    [30, 21, G],
    [45, 29, G],
    [19, 48, R],
    [41, 48, R],
    [19, 66, R],
    [41, 66, R],
  ],
  8: [
    [19, 14, B],
    [41, 14, B],
    [19, 31, B],
    [41, 31, B],
    [19, 49, B],
    [41, 49, B],
    [19, 66, B],
    [41, 66, B],
  ],
  9: [
    [15, 17, B],
    [30, 17, B],
    [45, 17, B],
    [15, 40, R],
    [30, 40, R],
    [45, 40, R],
    [15, 63, G],
    [30, 63, G],
    [45, 63, G],
  ],
};
const PIN_R = [0, 15, 11, 9, 9, 8.5, 7.5, 6.5, 6.5, 6.5];

type Stick = [number, number, string];
const SOU: Record<number, Stick[]> = {
  2: [
    [30, 24, G],
    [30, 56, G],
  ],
  3: [
    [30, 24, G],
    [20, 56, G],
    [40, 56, G],
  ],
  4: [
    [20, 24, G],
    [40, 24, G],
    [20, 56, G],
    [40, 56, G],
  ],
  5: [
    [16, 24, G],
    [44, 24, G],
    [30, 40, R],
    [16, 56, G],
    [44, 56, G],
  ],
  6: [
    [16, 24, G],
    [30, 24, G],
    [44, 24, G],
    [16, 56, G],
    [30, 56, G],
    [44, 56, G],
  ],
  7: [
    [30, 15, R],
    [16, 41, G],
    [30, 41, G],
    [44, 41, G],
    [16, 65, G],
    [30, 65, G],
    [44, 65, G],
  ],
  8: [
    [12, 24, G],
    [24, 24, G],
    [36, 24, G],
    [48, 24, G],
    [12, 56, G],
    [24, 56, G],
    [36, 56, G],
    [48, 56, G],
  ],
  9: [
    [16, 16, G],
    [30, 16, R],
    [44, 16, G],
    [16, 40, G],
    [30, 40, R],
    [44, 40, G],
    [16, 64, G],
    [30, 64, R],
    [44, 64, G],
  ],
};

const F = 'var(--tile-face)';

/** 筒子の1つ：外輪・内輪・中心の点の同心円（硬貨のような質感） */
function coin(x: number, y: number, r: number, outer: string, inner = outer): string {
  // 小さい円は輪を減らして、手牌の大きさでも読みやすくする
  if (r < 10) {
    return `<circle cx="${x}" cy="${y}" r="${r}" fill="${outer}"/><circle cx="${x}" cy="${y}" r="${r * 0.7}" fill="${F}"/><circle cx="${x}" cy="${y}" r="${r * 0.44}" fill="${inner}"/>`;
  }
  return `<circle cx="${x}" cy="${y}" r="${r}" fill="${outer}"/><circle cx="${x}" cy="${y}" r="${r * 0.78}" fill="${F}"/><circle cx="${x}" cy="${y}" r="${r * 0.62}" fill="${inner}"/><circle cx="${x}" cy="${y}" r="${r * 0.36}" fill="${F}"/><circle cx="${x}" cy="${y}" r="${r * 0.2}" fill="${inner}"/>`;
}

function pinzu(n: number, red: boolean): string {
  if (n === 1) {
    // 一筒：大きな同心円の周りに花弁
    const petals = Array.from({ length: 12 }, (_, i) => {
      const a = (i / 12) * Math.PI * 2;
      return `<circle cx="${(30 + Math.cos(a) * 21.5).toFixed(1)}" cy="${(40 + Math.sin(a) * 21.5).toFixed(1)}" r="2.6" fill="${red ? R : i % 2 ? B : G}"/>`;
    }).join('');
    return `${petals}${coin(30, 40, 16, red ? R : G, R)}`;
  }
  const r = PIN_R[n];
  return PIN[n].map(([x, y, c]) => coin(x, y, r, red ? R : c)).join('');
}

/** 一索：簡略化した鳥（尾羽・胴・頭） */
const BIRD = `<g>
  <ellipse cx="17" cy="58" rx="5" ry="13" transform="rotate(-32 17 58)" fill="${B}"/>
  <ellipse cx="23" cy="62" rx="4.6" ry="12" transform="rotate(-12 23 62)" fill="${G}"/>
  <ellipse cx="30" cy="63" rx="4.4" ry="11" transform="rotate(8 30 63)" fill="${R}"/>
  <path d="M34 58 L32 70 M38 57 L40 70" stroke="${R}" stroke-width="2" stroke-linecap="round"/>
  <ellipse cx="34" cy="45" rx="11" ry="14" transform="rotate(22 34 45)" fill="${G}"/>
  <ellipse cx="32" cy="48" rx="5.5" ry="8.5" transform="rotate(22 32 48)" fill="${B}"/>
  <path d="M35 33 Q37 25 41 23 L46 26 Q42 31 42 37 Z" fill="${G}"/>
  <circle cx="43" cy="21" r="6.5" fill="${G}"/>
  <circle cx="39" cy="13.5" r="2.6" fill="${R}"/>
  <path d="M48.5 19 L55 22 L48.5 24.5 Z" fill="${R}"/>
  <circle cx="44.5" cy="20" r="1.7" fill="${F}"/>
</g>`;

/** 索子の1本：竹の節（上・中・下）とハイライト */
function stick(x: number, y: number, w: number, h: number, col: string): string {
  const x0 = x - w / 2;
  const y0 = y - h / 2;
  const band = (yy: number) => `<rect x="${x0}" y="${yy - 0.9}" width="${w}" height="1.8" fill="#000" opacity="0.32"/>`;
  return `<rect x="${x0}" y="${y0}" width="${w}" height="${h}" rx="${w / 2}" fill="${col}"/>${band(y0 + 3.2)}${band(y)}${band(y0 + h - 3.2)}<rect x="${x0 + 1.4}" y="${y0 + 2.5}" width="1.3" height="${h - 5}" rx="0.6" fill="#fff" opacity="0.35"/>`;
}

/** 竹1本を任意の向きで：こぶのある両端と、白い節の帯 */
function bamboo(x1: number, y1: number, x2: number, y2: number, col: string): string {
  const L = Math.hypot(x2 - x1, y2 - y1);
  const a = (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI - 90;
  const h = L / 2;
  return `<g transform="translate(${(x1 + x2) / 2} ${(y1 + y2) / 2}) rotate(${a.toFixed(1)})"><rect x="-2.8" y="${-h}" width="5.6" height="${L}" rx="2.8" fill="${col}"/><circle cx="0" cy="${-h}" r="3.5" fill="${col}"/><circle cx="0" cy="${h}" r="3.5" fill="${col}"/><rect x="-6" y="-2.3" width="12" height="4.6" rx="2.3" fill="${F}" stroke="${col}" stroke-width="1.5"/></g>`;
}

/** 八索：左右の縦2本と、上は「∧」・下は「∨」に組んだ斜め2本ずつ */
function eightSou(col: string): string {
  return [
    bamboo(16.5, 31, 30, 13.5, col),
    bamboo(30, 13.5, 43.5, 31, col),
    bamboo(16.5, 49, 30, 66.5, col),
    bamboo(30, 66.5, 43.5, 49, col),
    bamboo(10.5, 8, 10.5, 36, col),
    bamboo(49.5, 8, 49.5, 36, col),
    bamboo(10.5, 44, 10.5, 72, col),
    bamboo(49.5, 44, 49.5, 72, col),
  ].join('');
}

function souzu(n: number, red: boolean): string {
  if (n === 1) return BIRD;
  if (n === 8) return eightSou(red ? R : G);
  const h = n >= 7 ? 18 : 24;
  const w = n === 8 ? 7 : 8;
  return SOU[n].map(([x, y, c]) => stick(x, y, w, h, red ? R : c)).join('');
}

function manzu(n: number, red: boolean): string {
  const ink = red ? R : 'var(--tile-ink)';
  return `<text x="30" y="34" text-anchor="middle" font-size="27" font-weight="700" fill="${ink}" class="tile-glyph">${KANJI[n - 1]}</text><text x="30" y="69" text-anchor="middle" font-size="29" font-weight="700" fill="${R}" class="tile-glyph">萬</text>`;
}

function honor(t: Tile): string {
  const n = numOf(t);
  if (n === 5) {
    // 白：青の二重枠
    return `<rect x="12" y="14" width="36" height="52" rx="4" fill="none" stroke="${B}" stroke-width="2.6"/><rect x="16.5" y="18.5" width="27" height="43" rx="2" fill="none" stroke="${B}" stroke-width="1.1"/>`;
  }
  const color = n === 6 ? G : n === 7 ? R : 'var(--tile-ink)';
  const ch = ['東', '南', '西', '北', '', '發', '中'][n - 1];
  return `<text x="30" y="54" text-anchor="middle" font-size="40" font-weight="700" fill="${color}" class="tile-glyph">${ch}</text>`;
}

function face(t: Tile, red: boolean): string {
  if (isHonor(t)) return honor(t);
  const n = numOf(t);
  switch (suitOf(t)) {
    case 0:
      return manzu(n, red);
    case 1:
      return pinzu(n, red);
    default:
      return souzu(n, red);
  }
}

export interface TileOpts {
  red?: boolean;
  back?: boolean;
  sideways?: boolean;
  cls?: string;
}

/**
 * 面の陰影・光沢のグラデーション。アプリで1回だけ DOM に置き、全部の牌で共有する。
 * 無くても牌は描ける（陰影が付かないだけ）
 */
export const TILE_DEFS = `<svg class="tile-defs" width="0" height="0" aria-hidden="true" focusable="false"><defs>
  <linearGradient id="tile-shade" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#fff" stop-opacity="0.55"/>
    <stop offset="0.35" stop-color="#fff" stop-opacity="0"/>
    <stop offset="0.8" stop-color="#000" stop-opacity="0"/>
    <stop offset="1" stop-color="#000" stop-opacity="0.12"/>
  </linearGradient>
  <linearGradient id="tile-gloss" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#fff" stop-opacity="0.8"/>
    <stop offset="1" stop-color="#fff" stop-opacity="0"/>
  </linearGradient>
  <linearGradient id="tile-back-shade" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#fff" stop-opacity="0.18"/>
    <stop offset="1" stop-color="#000" stop-opacity="0.25"/>
  </linearGradient>
</defs></svg>`;

export function tileSvg(t: Tile, opts: TileOpts = {}): string {
  const side = !!opts.sideways;
  // 面の外形（横向きなら縦横を入れ替える）
  const fw = side ? H : W;
  const fh = side ? W : H;
  const layers = `<rect x="1" y="${D}" width="${fw - 2}" height="${fh - 1}" rx="8" fill="var(--tile-back)"/><rect x="1" y="${D / 2}" width="${fw - 2}" height="${fh - 1}" rx="8" fill="var(--tile-bone)"/>`;
  const content = opts.back
    ? ''
    : `${face(t, !!opts.red)}${opts.red ? `<circle cx="51" cy="9" r="3" fill="${R}"/>` : ''}`;
  const faceRect = `<rect x="1" y="1" width="${fw - 2}" height="${fh - 2}" rx="7" fill="${opts.back ? 'var(--tile-back)' : F}" stroke="${opts.back ? 'rgba(0,0,0,0.3)' : 'var(--tile-edge)'}" stroke-width="1"/>`;
  const drawn = side ? `<g transform="translate(0,${W}) rotate(-90)">${content}</g>` : content;
  const shade = `<rect x="1" y="1" width="${fw - 2}" height="${fh - 2}" rx="7" fill="url(#${opts.back ? 'tile-back-shade' : 'tile-shade'})"/>`;
  const gloss = `<path d="M4 8 Q4 4 8 4 H${(fw * 0.62).toFixed(0)} Q${(fw * 0.3).toFixed(0)} 9 4 ${(fh * 0.32).toFixed(0)} Z" fill="url(#tile-gloss)" opacity="0.35"/>`;
  const bevel = `<rect x="2.6" y="2.6" width="${fw - 5.2}" height="${fh - 5.2}" rx="5.8" fill="none" stroke="#fff" stroke-opacity="0.55" stroke-width="0.9"/>`;
  const label = opts.back ? '裏' : `${tileName(t)}${opts.red ? '（赤）' : ''}`;
  const cls = `tile${side ? ' sideways' : ''}${opts.cls ? ` ${opts.cls}` : ''}`;
  return `<svg class="${cls}" viewBox="0 0 ${fw} ${fh + D}" role="img" aria-label="${label}">${layers}${faceRect}${drawn}${shade}${gloss}${bevel}</svg>`;
}

/** 手牌中の赤5を割り当てるためのカウンタ */
class AkaAllocator {
  private remaining: Map<Tile, number>;
  constructor(aka: Tile[]) {
    this.remaining = new Map();
    for (const t of aka) this.remaining.set(t, (this.remaining.get(t) ?? 0) + 1);
  }
  take(t: Tile): boolean {
    const n = this.remaining.get(t) ?? 0;
    if (n <= 0) return false;
    this.remaining.set(t, n - 1);
    return true;
  }
}

function meldSvg(m: Meld, aka: AkaAllocator): string {
  const tiles =
    m.type === 'chi' ? [m.tile, m.tile + 1, m.tile + 2] : m.type === 'pon' ? [m.tile, m.tile, m.tile] : [m.tile, m.tile, m.tile, m.tile];
  // 見た目上の「鳴いた牌」の位置（チーは上家から＝左）
  const side = m.type === 'chi' ? 0 : m.type === 'ankan' ? -1 : m.tile % 3;
  const reds = tiles.map((t) => aka.take(t));
  const html = tiles
    .map((t, i) =>
      tileSvg(t, {
        red: reds[i],
        sideways: i === side,
        back: m.type === 'ankan' && (i === 0 || i === 3),
      }),
    )
    .join('');
  const label = { chi: 'チー', pon: 'ポン', minkan: '明槓', ankan: '暗槓' }[m.type];
  return `<div class="meld" data-type="${m.type}"><div class="meld-tiles">${html}</div><span class="meld-label">${label}</span></div>`;
}

export function handHtml(hand: Hand, tsumo: boolean): string {
  const aka = new AkaAllocator(hand.akaTiles);
  // 副露・和了牌に赤を優先的に割り当てず、手の内から順に割り当てる
  const concealed = hand.concealed.map((t) => tileSvg(t, { red: aka.take(t) })).join('');
  const win = tileSvg(hand.winTile, { red: aka.take(hand.winTile), cls: 'win' });
  const melds = hand.melds.map((m) => meldSvg(m, aka)).join('');
  return `<div class="hand">
    <div class="concealed">${concealed}</div>
    <div class="win-wrap"><div class="win-tile">${win}</div><span class="win-label">${tsumo ? 'ツモ' : 'ロン'}</span></div>
    ${melds ? `<div class="melds">${melds}</div>` : ''}
  </div>`;
}

export function tilesInline(tiles: Tile[]): string {
  return `<span class="tiles-inline">${tiles.map((t) => tileSvg(t)).join('')}</span>`;
}
