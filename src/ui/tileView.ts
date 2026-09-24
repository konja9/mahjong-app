import type { Hand, Meld } from '../core/hand';
import { type Tile, isHonor, numOf, suitOf, tileName } from '../core/tiles';

/** ミニマルな自作 SVG 牌。色は CSS 変数で与える */

const W = 60;
const H = 80;
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

function pinzu(n: number, red: boolean): string {
  const r = PIN_R[n];
  return PIN[n]
    .map(([x, y, c]) => {
      const col = red ? R : c;
      return `<circle cx="${x}" cy="${y}" r="${r}" fill="${col}"/><circle cx="${x}" cy="${y}" r="${r * 0.42}" fill="var(--tile-face)"/>`;
    })
    .join('');
}

function souzu(n: number, red: boolean): string {
  if (n === 1) {
    const c = red ? R : G;
    return `<rect x="24" y="14" width="12" height="52" rx="6" fill="${c}"/><circle cx="30" cy="14" r="7" fill="${R}"/><rect x="26" y="38" width="8" height="2.5" fill="var(--tile-face)"/>`;
  }
  const h = n >= 7 ? 18 : 24;
  const w = n === 8 ? 7 : 8;
  return SOU[n]
    .map(([x, y, c]) => {
      const col = red ? R : c;
      return `<rect x="${x - w / 2}" y="${y - h / 2}" width="${w}" height="${h}" rx="${w / 2}" fill="${col}"/><rect x="${x - w / 2 + 1.5}" y="${y - 1}" width="${w - 3}" height="2" fill="var(--tile-face)"/>`;
    })
    .join('');
}

function manzu(n: number, red: boolean): string {
  const ink = red ? R : 'var(--tile-ink)';
  return `<text x="30" y="34" text-anchor="middle" font-size="27" font-weight="700" fill="${ink}" class="tile-glyph">${KANJI[n - 1]}</text><text x="30" y="68" text-anchor="middle" font-size="27" font-weight="700" fill="${R}" class="tile-glyph">萬</text>`;
}

function honor(t: Tile): string {
  const n = numOf(t);
  if (n === 5) {
    return `<rect x="13" y="16" width="34" height="48" rx="4" fill="none" stroke="var(--tile-blue)" stroke-width="3"/>`;
  }
  const color = n === 6 ? G : n === 7 ? R : 'var(--tile-ink)';
  const ch = ['東', '南', '西', '北', '', '發', '中'][n - 1];
  return `<text x="30" y="54" text-anchor="middle" font-size="38" font-weight="700" fill="${color}" class="tile-glyph">${ch}</text>`;
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

export function tileSvg(t: Tile, opts: TileOpts = {}): string {
  const body = opts.back
    ? `<rect x="1" y="1" width="${W - 2}" height="${H - 2}" rx="7" fill="var(--tile-back)"/>`
    : `<rect x="1" y="1" width="${W - 2}" height="${H - 2}" rx="7" fill="var(--tile-face)" stroke="var(--tile-edge)" stroke-width="1.5"/>${face(t, !!opts.red)}${
        opts.red ? `<circle cx="51" cy="9" r="3" fill="${R}"/>` : ''
      }`;
  const label = opts.back ? '裏' : `${tileName(t)}${opts.red ? '（赤）' : ''}`;
  const cls = `tile${opts.sideways ? ' sideways' : ''}${opts.cls ? ` ${opts.cls}` : ''}`;
  if (opts.sideways) {
    return `<svg class="${cls}" viewBox="0 0 ${H} ${W}" role="img" aria-label="${label}"><g transform="translate(0,${W}) rotate(-90)">${body}</g></svg>`;
  }
  return `<svg class="${cls}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${label}">${body}</svg>`;
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
