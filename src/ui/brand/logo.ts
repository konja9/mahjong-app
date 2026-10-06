import { SUB, TITLE } from './glyphs';

/**
 * タイトルロゴ「パチふと」。
 * - 文字は劇画の荒い筆致（Reggae One）を金箔で塗り、黒い縁と影、かすれ・ひび、墨の飛び散り
 * - 1文字ずつ、黒い麻雀牌（金の縁・緑の背）の上に乗せる
 * - 副題「パチンコ符計算トレーニング」はパチンコ台の LED の電光表示（DotGothic16 の粒）
 * 2つの形：stack（パチ／ふと の2段。スタート画面）、wide（横1列。ヘッダー）
 * 文字はフォントに頼らずパスと粒の表で描くので、どの環境でも同じ形になる（tools/glyphs.py）
 */

let seq = 0;

const GOLD = ['#fff6c8', '#e8b93a', '#7a4f0a'];
const TILE = { face: '#1a1712', edge: '#c9962a', back: '#0e3a2c' };
const LED = { on: '#ffd54a', off: '#2a210a' };
const TILT = [-8, 5, -4, 7];

interface Letter {
  d: string;
  x: number;
  y: number;
}

/** 決まった乱数（毎回同じ絵になるように） */
function rng(seed: number): () => number {
  return () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
}

const paths = (L: Letter[], attrs: string) => L.map((l) => `<path d="${l.d}" transform="translate(${l.x} ${l.y})" ${attrs}/>`).join('');

/** 牌（1文字ずつ。少しずつ傾ける） */
function tiles(L: Letter[]): string {
  return L.map((l, k) => {
    const x = l.x + 500;
    const y = l.y + 790;
    return `<g transform="rotate(${TILT[k]} ${x} ${y})">
      <rect x="${x - 470}" y="${y - 560}" width="940" height="1140" rx="90" fill="${TILE.back}" stroke="#000" stroke-width="16"/>
      <rect x="${x - 470}" y="${y - 600}" width="940" height="1140" rx="90" fill="${TILE.face}" stroke="${TILE.edge}" stroke-width="22"/>
      <rect x="${x - 420}" y="${y - 550}" width="840" height="1040" rx="60" fill="none" stroke="${TILE.edge}" stroke-opacity=".35" stroke-width="8"/>
      <path d="M${x - 420} ${y - 500} Q${x - 420} ${y - 550} ${x - 370} ${y - 550} H${x - 40} Q${x - 300} ${y - 470} ${x - 420} ${y - 200} Z" fill="#fff" opacity=".06"/>
    </g>`;
  }).join('');
}

/** 劇画の文字：墨の飛び散り・影・黒い縁・金箔・ひび */
function letters(id: string, L: Letter[], splat: boolean): string {
  const R = rng(7);
  const dots = splat
    ? Array.from({ length: 46 }, () => {
        const x = R() * 3900 - 100;
        const y = 250 + R() * 1100;
        const r = 6 + R() ** 3 * 60;
        return `<circle cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="${r.toFixed(1)}" fill="${R() < 0.6 ? '#000' : '#5a4a2a'}" opacity="${(0.5 + R() * 0.5).toFixed(2)}"/>`;
      }).join('')
    : '';
  const cracks = ['M300 500 l120 90 l-40 110 l90 80', 'M1150 420 l-60 120 l80 70', 'M2050 700 l140 -60 l60 120', 'M2900 520 l-90 110 l100 90 l-30 120'];
  return `<clipPath id="${id}-clip">${paths(L, '')}</clipPath>
    ${tiles(L)}${dots}
    <g transform="translate(60 54)" filter="url(#${id}-rough)">${paths(L, 'fill="#000" stroke="#000" stroke-width="60" stroke-linejoin="round"')}</g>
    <g filter="url(#${id}-rough)">${paths(L, 'fill="none" stroke="#000" stroke-width="70" stroke-linejoin="round"')}${paths(L, `fill="url(#${id}-gold)"`)}</g>
    <g clip-path="url(#${id}-clip)" filter="url(#${id}-rough)">${cracks.map((d) => `<path d="${d}" stroke="#5a3a08" stroke-width="12" fill="none" opacity=".8"/>`).join('')}</g>`;
}

/** 副題の LED の帯。x,y は帯の文字の左上、size は1文字の幅 */
function ledBand(id: string, x: number, y: number, size: number): string {
  const step = size / 16;
  const on: string[] = [];
  const off: string[] = [];
  SUB.forEach((rows, k) =>
    rows.forEach((row, r) =>
      [...row].forEach((bit, c) => {
        const cx = (x + (k * 16 + c + 0.5) * step).toFixed(1);
        const cy = (y + (r + 0.5) * step - size * 0.1).toFixed(1);
        if (bit === '1') on.push(`<circle cx="${cx}" cy="${cy}" r="${(step * 0.42).toFixed(1)}"/>`);
        else off.push(`<circle cx="${cx}" cy="${cy}" r="${(step * 0.32).toFixed(1)}"/>`);
      }),
    ),
  );
  const W = SUB.length * size;
  const H = size * 1.32;
  return `<rect x="${x - 60}" y="${y - 50}" width="${W + 120}" height="${H + 60}" rx="20" fill="#0a0603" stroke="#3b2a14" stroke-width="12"/>
    <g fill="${LED.off}">${off.join('')}</g>
    <g fill="${LED.on}" filter="url(#${id}-glow)" opacity=".75">${on.join('')}</g>
    <g fill="${LED.on}">${on.join('')}</g>`;
}

export interface LogoOpts {
  /** stack：パチ／ふと の2段（スタート画面）。wide：横1列（ヘッダー） */
  layout?: 'stack' | 'wide';
  /** 副題（LED の帯）を出すか */
  sub?: boolean;
  className?: string;
}

export function logoSvg(o: LogoOpts = {}): string {
  const { layout = 'wide', sub = layout === 'stack', className = '' } = o;
  const id = `pf-logo-${++seq}`;
  const defs = `<defs>
    <filter id="${id}-rough" x="-5%" y="-10%" width="110%" height="120%"><feTurbulence type="fractalNoise" baseFrequency=".03" numOctaves="4" seed="3"/><feDisplacementMap in="SourceGraphic" scale="46"/></filter>
    <filter id="${id}-glow"><feGaussianBlur stdDeviation="8"/></filter>
    <linearGradient id="${id}-gold" x1="0" y1="300" x2="0" y2="1250" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="${GOLD[0]}"/><stop offset=".55" stop-color="${GOLD[1]}"/><stop offset="1" stop-color="${GOLD[2]}"/></linearGradient>
  </defs>`;
  const svg = (viewBox: string, body: string) =>
    `<svg class="pf-logo ${className}" viewBox="${viewBox}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="パチふと">${defs}${body}</svg>`;
  const chars = [...'パチふと'];
  if (layout === 'stack') {
    const L = chars.map((c, i) => ({ d: TITLE[c], x: i < 2 ? i * 960 : 700 + (i - 2) * 960, y: i < 2 ? 0 : 900 }));
    const band = sub ? ledBand(id, (2660 - SUB.length * 150) / 2 + 40, 2200, 150) : '';
    return svg(`-300 120 3500 ${sub ? 2420 : 2180}`, `<g transform="skewX(-10) translate(300 0)">${letters(id, L, true)}</g>${band}`);
  }
  const L = chars.map((c, i) => ({ d: TITLE[c], x: i * 910, y: 0 }));
  const band = sub ? ledBand(id, (3700 - SUB.length * 190) / 2, 1520, 190) : '';
  return svg(`-260 80 4440 ${sub ? 1760 : 1360}`, `<g transform="skewX(-12) translate(300 0)">${letters(id, L, sub)}</g>${band}`);
}
