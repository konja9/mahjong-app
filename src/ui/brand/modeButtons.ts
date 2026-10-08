import { TITLE } from './glyphs';

/**
 * スタート画面の「パチンコ」「稽古」のボタンの絵（SVG）。
 * ロゴと同じく、牌のような面（パチンコは赤、稽古は緑）に金の縁と緑の背、
 * 文字は劇画の荒い筆致（Reggae One）を金箔で塗り、黒い縁と影を付ける。
 * 枠は水平。縁や面のふちには文字と同じ筆のゆらぎ（かすれ）を付ける。文字はパスなので、どの環境でも同じ形になる
 */

export type ModeButton = 'pachinko' | 'keiko' | 'start';

interface Look {
  chars: string;
  /** 面のグラデーション（上、下） */
  face: [string, string];
  /** 縁（金／若草色） */
  edge: string;
  /** 牌の背（下にのぞく） */
  back: string;
  /** 文字の金箔（上、中、下） */
  foil: [string, string, string];
}

const LOOKS: Record<ModeButton, Look> = {
  pachinko: { chars: 'パチンコ', face: ['#4a1218', '#2a0a0e'], edge: '#e8b93a', back: '#0e3a2c', foil: ['#fff6c8', '#e8b93a', '#7a4f0a'] },
  // 初回の「スタート」：金の面に金の縁。そのままチュートリアルへ進む
  start: { chars: 'スタート', face: ['#6b4a0c', '#33220a'], edge: '#ffe08a', back: '#0e3a2c', foil: ['#fffbe0', '#f5c842', '#8a5a0c'] },
  keiko: { chars: '稽古', face: ['#13281f', '#0b1813'], edge: '#7fc7a0', back: '#06201a', foil: ['#f1ffd9', '#8fd6a8', '#1f6a4a'] },
};

/** 文字パスの1em（tools/glyphs.py：1em=1000、字形は y 300〜1250 あたり） */
const EM = 1000;
const SCALE = 0.12;

const LABEL: Record<ModeButton, string> = { pachinko: 'パチンコ', keiko: '稽古', start: 'スタート' };

let seq = 0;

export interface ModeButtonOpts {
  /** 絵の中に小さな説明文を書き込む（単体の SVG ファイル用。アプリでは HTML の文字を重ねる） */
  sub?: string;
  className?: string;
}

export function modeButtonSvg(mode: ModeButton, o: ModeButtonOpts = {}): string {
  const k = LOOKS[mode];
  const id = `pf-btn-${++seq}`;
  const chars = [...k.chars];
  const adv = EM * SCALE;
  const w = chars.length * adv;
  const x0 = 500 - w / 2;
  // 字形の縦の中心（y=775）を、説明文があれば面の上寄り（84）、なければ面の真ん中（115）に置く
  const ty = (o.sub !== undefined || mode !== 'start' ? 84 : 115) - 775 * SCALE;
  const L = chars.map((c, i) => ({ d: TITLE[c], x: x0 + i * adv }));
  const glyphs = (attrs: string) => L.map((l) => `<path d="${l.d}" transform="translate(${l.x} ${ty}) scale(${SCALE})" ${attrs}/>`).join('');
  // 文字のまわり：ずらした黒い影、黒い縁、金箔、ひび（ロゴと同じ重ね方）
  const text = `<g filter="url(#${id}-rough)">
      <g transform="translate(5 5)">${glyphs(`fill="#000" stroke="#000" stroke-width="${70}" stroke-linejoin="round"`)}</g>
      ${glyphs(`fill="none" stroke="#000" stroke-width="70" stroke-linejoin="round"`)}
      ${glyphs(`fill="url(#${id}-foil)"`)}
    </g>`;
  const sub = o.sub
    ? `<text x="500" y="203" text-anchor="middle" font-family="'Noto Sans JP', sans-serif" font-size="30" font-weight="700" fill="#d9cfae" stroke="#000" stroke-width="5" paint-order="stroke">${o.sub}</text>`
    : '';
  // 面とふちは、筆でなぞったようにゆらがせる（文字と同じ種類の細かいゆらぎ。ふちのほうが少し強い）
  const brushEdge = (n: number) => `<rect x="${24 + n}" y="${4 + n}" width="${952 - n * 2}" height="${222 - n * 2}" rx="${30 - n}" fill="none"`;
  const face = `<g filter="url(#${id}-brush)">
      <rect x="16" y="-4" width="968" height="238" rx="36" fill="#000"/>
      <rect x="20" y="0" width="960" height="230" rx="34" fill="url(#${id}-face)"/>
      ${brushEdge(0)} stroke="${k.edge}" stroke-width="9"/>
      ${brushEdge(11)} stroke="${k.edge}" stroke-opacity=".3" stroke-width="5"/>
    </g>
    <path d="M44 24 H380 Q240 70 44 140 Z" fill="#fff" opacity=".05"/>
    <g filter="url(#${id}-dry)" opacity=".55"><path d="M60 8 H300 M520 8 H940 M70 222 H420 M600 222 H930" stroke="#000" stroke-width="4" stroke-linecap="round"/></g>`;
  const back = `<g filter="url(#${id}-drop)">
      <rect x="20" y="16" width="960" height="230" rx="34" fill="#000" filter="url(#${id}-brush)"/>
      <rect x="20" y="10" width="960" height="230" rx="34" fill="${k.back}" filter="url(#${id}-brush)"/>
    </g>`;
  return `<svg class="pf-mode-btn ${o.className ?? ''}" viewBox="-12 -14 1024 276" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${LABEL[mode]}">
  <defs>
    <linearGradient id="${id}-face" x1="0" y1="0" x2="0" y2="230" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="${k.face[0]}"/><stop offset="1" stop-color="${k.face[1]}"/></linearGradient>
    <linearGradient id="${id}-foil" x1="0" y1="300" x2="0" y2="1250" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="${k.foil[0]}"/><stop offset=".55" stop-color="${k.foil[1]}"/><stop offset="1" stop-color="${k.foil[2]}"/></linearGradient>
    <filter id="${id}-rough" x="-5%" y="-10%" width="110%" height="120%"><feTurbulence type="fractalNoise" baseFrequency=".22" numOctaves="3" seed="3"/><feDisplacementMap in="SourceGraphic" scale="5.5"/></filter>
    <filter id="${id}-brush" x="-3%" y="-8%" width="106%" height="116%"><feTurbulence type="fractalNoise" baseFrequency=".018 .05" numOctaves="2" seed="11"/><feDisplacementMap in="SourceGraphic" scale="6"/></filter>
    <filter id="${id}-dry" x="-3%" y="-300%" width="106%" height="700%"><feTurbulence type="fractalNoise" baseFrequency=".03 .3" numOctaves="2" seed="5"/><feDisplacementMap in="SourceGraphic" scale="5"/></filter>
    <filter id="${id}-drop" x="-5%" y="-5%" width="110%" height="130%"><feDropShadow dx="0" dy="14" stdDeviation="9" flood-color="#000" flood-opacity=".5"/></filter>
  </defs>
  ${back}
  ${face}
  ${text}
  ${sub}
</svg>`;
}

