import { GLYPHS } from './glyphs';

/**
 * タイトルロゴ「パチふと」。
 * 世界観：昔のパチンコ屋の看板がスクラップから掘り起こされ、世紀末の地下でネオンを灯した姿。
 * - 文字は厚みのある金属（パチ＝金、ふと＝銀）。黒い縁と赤いネオン管で囲み、細かい傷を入れる
 * - 下に、鋲で留めた鉄板の副題「パチンコ符計算トレーニング」
 * 文字はフォントに頼らずパスで描くので、どの環境でも同じ形になる
 */

let seq = 0;

/** 文字のパスを並べる。間隔は少し詰める */
function word(chars: string, x0: number, kern = 905): { d: string; x: number }[] {
  return [...chars].map((ch, i) => ({ d: GLYPHS[ch].d, x: x0 + i * kern }));
}

const LETTERS = [...word('パチ', 0), ...word('ふと', 1870)];
/** 金属の傷（文字の中だけに見える） */
const SCRATCHES = [
  'M120 520 L300 470',
  'M600 860 L760 900',
  'M980 600 L1060 560',
  'M1300 980 L1500 930',
  'M2050 520 L2260 600',
  'M2400 900 L2520 860',
  'M2900 640 L3080 690',
  'M3300 1000 L3420 950',
];

export interface LogoOpts {
  /** 副題の鉄板を出すか */
  sub?: boolean;
  /** 光（ネオンのにじみ）を出すか。小さく出すときは切ると軽い */
  glow?: boolean;
  className?: string;
}

/** ロゴの SVG。幅いっぱいに伸びる（高さは比率で決まる） */
export function logoSvg(o: LogoOpts = {}): string {
  const { sub = true, glow = true, className = '' } = o;
  const id = `pf-logo-${++seq}`;
  const W = 3800;
  const H = sub ? 1820 : 1420;
  const use = (cls: string, extra = '') => LETTERS.map((l) => `<path d="${l.d}" transform="translate(${l.x} 0)" class="${cls}"${extra}/>`).join('');
  const usePart = (from: number, to: number, fill: string) =>
    LETTERS.slice(from, to)
      .map((l) => `<path d="${l.d}" transform="translate(${l.x} 0)" fill="${fill}"/>`)
      .join('');
  // 奥行き：少しずつ右下にずらした影を重ねる
  const depth = Array.from({ length: 7 }, (_, i) => `<g transform="translate(${(i + 1) * 9} ${(i + 1) * 13})">${use('', ` fill="${i === 6 ? '#000' : '#2a1305'}"`)}</g>`).join('');
  const subPlate = sub
    ? `<g transform="translate(${W / 2} 1540)">
        <rect x="-1500" y="-150" width="3000" height="300" rx="40" fill="url(#${id}-iron)" stroke="#000" stroke-width="22"/>
        <rect x="-1460" y="-112" width="2920" height="224" rx="24" fill="none" stroke="#ffffff" stroke-opacity=".14" stroke-width="8"/>
        ${[-1400, 1400].map((x) => `<circle cx="${x}" cy="0" r="38" fill="url(#${id}-rivet)" stroke="#000" stroke-width="10"/>`).join('')}
        <text x="0" y="62" text-anchor="middle" font-family="'Noto Sans JP', sans-serif" font-weight="900" font-size="168" letter-spacing="18" fill="#f2c94c" stroke="#000" stroke-width="10" paint-order="stroke">パチンコ符計算トレーニング</text>
      </g>`
    : '';
  return `<svg class="pf-logo ${className}" viewBox="-120 -60 ${W + 240} ${H + 120}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="パチふと">
  <defs>
    <linearGradient id="${id}-gold" x1="0" y1="250" x2="0" y2="1250" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#fff6c8"/><stop offset=".28" stop-color="#ffd447"/><stop offset=".5" stop-color="#c47a12"/>
      <stop offset=".54" stop-color="#ffe38a"/><stop offset=".78" stop-color="#e2a024"/><stop offset="1" stop-color="#7a4708"/>
    </linearGradient>
    <linearGradient id="${id}-chrome" x1="0" y1="250" x2="0" y2="1250" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#ffffff"/><stop offset=".3" stop-color="#dfe6ef"/><stop offset=".5" stop-color="#6c7686"/>
      <stop offset=".54" stop-color="#f4f7fb"/><stop offset=".8" stop-color="#aab4c2"/><stop offset="1" stop-color="#4d5563"/>
    </linearGradient>
    <linearGradient id="${id}-iron" x1="0" y1="-150" x2="0" y2="150" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#4a3a2a"/><stop offset=".5" stop-color="#2a1d12"/><stop offset="1" stop-color="#150d07"/>
    </linearGradient>
    <radialGradient id="${id}-rivet" cx=".35" cy=".35" r=".7"><stop offset="0" stop-color="#fff"/><stop offset=".4" stop-color="#b9b29c"/><stop offset="1" stop-color="#3a3326"/></radialGradient>
    ${glow ? `<filter id="${id}-neon" x="-10%" y="-20%" width="120%" height="140%"><feGaussianBlur stdDeviation="38"/></filter>` : ''}
    <clipPath id="${id}-clip">${use('')}</clipPath>
  </defs>
  <g transform="skewX(-9) translate(220 0)">
    ${glow ? `<g filter="url(#${id}-neon)" opacity=".85">${use('', ' fill="none" stroke="#ff2a3c" stroke-width="150" stroke-linejoin="round"')}</g>` : ''}
    ${depth}
    ${use('', ' fill="none" stroke="#000" stroke-width="112" stroke-linejoin="round"')}
    ${use('', ' fill="none" stroke="#ff3b4a" stroke-width="62" stroke-linejoin="round"')}
    ${use('', ' fill="none" stroke="#ffd0d4" stroke-width="16" stroke-linejoin="round" opacity=".9"')}
    ${use('', ' fill="none" stroke="#000" stroke-width="30" stroke-linejoin="round"')}
    ${usePart(0, 2, `url(#${id}-gold)`)}
    ${usePart(2, 4, `url(#${id}-chrome)`)}
    <g clip-path="url(#${id}-clip)">
      <rect x="-400" y="260" width="4600" height="250" fill="#fff" opacity=".16"/>
      <rect x="-400" y="300" width="4600" height="40" fill="#fff" opacity=".22"/>
      ${SCRATCHES.map((d) => `<path d="${d}" stroke="#3b1d02" stroke-opacity=".55" stroke-width="9" stroke-linecap="round"/><path d="${d}" transform="translate(0 7)" stroke="#fff" stroke-opacity=".5" stroke-width="5" stroke-linecap="round"/>`).join('')}
    </g>
  </g>
  ${subPlate}
</svg>`;
}
