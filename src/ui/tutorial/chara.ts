/**
 * パチふとくん：麻雀牌スロットの妖精。
 * 昔のパチンコ屋の人気台がスクラップ置き場から掘り起こされ、世紀末の地下で目を覚ました姿。
 * - 体は使い込まれた金の筐体（傷・へこみ・鋲）。頭に回転灯、肩にトゲの鋲（世紀末の名残）
 * - 顔は黒いガラスの液晶。左右のリール窓が目、払い出し口が口。頬にばんそうこう、画面の角にひび
 * - 右手はレバー（赤い玉）、左手は小さな鉄の手
 * 表情は、目のリールの絵柄・眉の鉄板の角度・口で変える。30px ほどの小ささでも読めるよう、太い線で描く
 */
export type Face = 'neutral' | 'grin' | 'surprise' | 'proud' | 'sweat';

const INK = '#140b05';
let seq = 0;

const EYES: Record<Face, { sym: string; color: string }> = {
  neutral: { sym: '發', color: '#178a4a' },
  grin: { sym: '7', color: '#d4142e' },
  surprise: { sym: '!', color: '#d4142e' },
  proud: { sym: '★', color: '#d99a00' },
  sweat: { sym: '－', color: '#2b4f9e' },
};

/** 眉（鉄板）：左右の [内側の高さ, 外側の高さ]（小さいほど上） */
const BROWS: Record<Face, [number, number, number, number]> = {
  neutral: [41, 41, 41, 41],
  grin: [42, 40, 39, 37], // 片方を上げて、ニヤリ
  surprise: [38, 38, 38, 38],
  proud: [43, 38, 43, 38], // 内側を下げて自信満々
  sweat: [38, 43, 38, 43], // 内側を上げて困り顔
};

function mouth(face: Face): string {
  switch (face) {
    case 'grin':
      // 歯を見せて笑う。金歯が1本
      return `<path d="M35 84 Q50 99 65 84 Z" fill="${INK}"/>
        <path d="M38.5 85.2 H61.5 L60 88.5 H40 Z" fill="#fff"/>
        <rect x="52" y="85.2" width="4.6" height="3.3" fill="#ffc83a"/>
        <path d="M44 85.2 V88.4 M48 85.2 V88.4 M56.6 85.2 V88.4" stroke="#b9b29c" stroke-width=".8"/>`;
    case 'surprise':
      return `<ellipse cx="50" cy="89" rx="6.5" ry="7.5" fill="${INK}"/><ellipse cx="50" cy="91.5" rx="3.6" ry="3" fill="#c8323c"/>`;
    case 'proud':
      return `<path d="M37 87 Q50 95 63 84" fill="none" stroke="${INK}" stroke-width="4.2" stroke-linecap="round"/>`;
    case 'sweat':
      return `<path d="M37 91 Q42 86 46.5 90 T56 90 T64 88" fill="none" stroke="${INK}" stroke-width="3.6" stroke-linecap="round"/>`;
    default:
      return `<path d="M38 88 H62" stroke="${INK}" stroke-width="4.2" stroke-linecap="round"/>`;
  }
}

function eye(x: number, face: Face): string {
  const e = EYES[face];
  const half = face === 'sweat' ? `<rect x="${x}" y="46" width="21" height="9" fill="#5a5446" opacity=".55"/>` : '';
  return `<g class="pf-eye">
    <rect x="${x}" y="46" width="21" height="24" rx="3.5" fill="#f6f1e3" stroke="${INK}" stroke-width="2.6"/>
    <rect x="${x + 1.5}" y="47.5" width="18" height="5" rx="2" fill="#000" opacity=".12"/>
    <text x="${x + 10.5}" y="${face === 'sweat' ? 66 : 64.5}" text-anchor="middle" font-size="${face === 'grin' ? 18 : 16}" font-weight="900" fill="${e.color}" font-family="'Noto Sans JP', sans-serif">${e.sym}</text>
    ${half}
  </g>`;
}

function brows(face: Face): string {
  const [li, lo, ri, ro] = BROWS[face];
  const bar = (x1: number, y1: number, x2: number, y2: number) =>
    `<path d="M${x1} ${y1} L${x2} ${y2}" stroke="#c4ccd8" stroke-width="3.6" stroke-linecap="round"/>`;
  return bar(21, lo, 39, li) + bar(61, ri, 79, ro);
}

/** 頭の回転灯。驚き・ドヤ顔のときは光る */
function lamp(face: Face): string {
  const lit = face === 'surprise' || face === 'proud' || face === 'grin';
  const rays = lit
    ? `<g stroke="#ff4a4a" stroke-width="2.4" stroke-linecap="round" opacity=".9"><path d="M38 6 L33 2"/><path d="M62 6 L67 2"/><path d="M50 1 V-3"/></g>`
    : '';
  return `${rays}<path d="M41 15 Q41 4 50 4 Q59 4 59 15 Z" fill="${lit ? '#ff3344' : '#a8232c'}" stroke="${INK}" stroke-width="2.6"/>
    <path d="M45 13 Q45 7 49 6.5" stroke="#fff" stroke-opacity=".7" stroke-width="2" fill="none" stroke-linecap="round"/>
    <rect x="38" y="14" width="24" height="5" rx="2" fill="#c4ccd8" stroke="${INK}" stroke-width="2.2"/>`;
}

/** パチふとくんの SVG（viewBox 0 0 100 120） */
export function charaSvg(face: Face = 'neutral'): string {
  const id = `pf-c${++seq}`;
  const sweatDrop =
    face === 'sweat' ? `<path d="M86 38 q6 9 0 14 q-6 -5 0 -14z" fill="#8fd0ff" stroke="${INK}" stroke-width="1.8"/><path d="M85 45 q-1 3 1 4" stroke="#fff" stroke-width="1.2" fill="none"/>` : '';
  const shock =
    face === 'surprise' ? `<g stroke="${INK}" stroke-width="2.4" stroke-linecap="round"><path d="M5 36 L-1 32"/><path d="M4 46 L-3 46"/><path d="M95 36 L101 32"/></g>` : '';
  const sparkle =
    face === 'proud' ? `<path d="M90 50 l1.8 4.4 4.4 1.8 -4.4 1.8 -1.8 4.4 -1.8 -4.4 -4.4 -1.8 4.4 -1.8z" fill="#fff4b8" stroke="${INK}" stroke-width="1.2"/>` : '';
  // レバー：笑う・ドヤ顔のときは振り上げる
  const leverUp = face === 'grin' || face === 'proud';
  const lever = leverUp
    ? `<path d="M93 62 L100 44" stroke="${INK}" stroke-width="7" stroke-linecap="round"/><path d="M93 62 L100 44" stroke="#c4ccd8" stroke-width="3.4" stroke-linecap="round"/><circle cx="101" cy="38.5" r="7" fill="#e0262f" stroke="${INK}" stroke-width="2.6"/><circle cx="98.8" cy="36.3" r="2" fill="#fff" opacity=".8"/>`
    : `<path d="M93 62 L100 76" stroke="${INK}" stroke-width="7" stroke-linecap="round"/><path d="M93 62 L100 76" stroke="#c4ccd8" stroke-width="3.4" stroke-linecap="round"/><circle cx="101" cy="81" r="7" fill="#e0262f" stroke="${INK}" stroke-width="2.6"/><circle cx="98.8" cy="78.8" r="2" fill="#fff" opacity=".8"/>`;
  return `<svg class="pf-chara" data-face="${face}" viewBox="-8 -6 118 128" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <defs>
    <linearGradient id="${id}-g" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ffe9a0"/><stop offset=".18" stop-color="#f2c94c"/><stop offset=".62" stop-color="#d9a52a"/><stop offset="1" stop-color="#9c6a14"/>
    </linearGradient>
    <linearGradient id="${id}-s" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#2a2f3a"/><stop offset=".5" stop-color="#0d0f14"/><stop offset="1" stop-color="#05060a"/>
    </linearGradient>
    <radialGradient id="${id}-r" cx=".35" cy=".35" r=".7"><stop offset="0" stop-color="#fff"/><stop offset=".45" stop-color="#c4ccd8"/><stop offset="1" stop-color="#4d5563"/></radialGradient>
  </defs>
  <!-- 影 -->
  <ellipse cx="50" cy="116" rx="34" ry="3.5" fill="#000" opacity=".35"/>
  <!-- 足 -->
  <rect x="25" y="103" width="15" height="11" rx="3" fill="#3b4250" stroke="${INK}" stroke-width="2.6"/>
  <rect x="60" y="103" width="15" height="11" rx="3" fill="#3b4250" stroke="${INK}" stroke-width="2.6"/>
  <!-- 肩のトゲ（世紀末の名残） -->
  <path d="M10 26 L5 15 L18 21 Z" fill="#c4ccd8" stroke="${INK}" stroke-width="2.2" stroke-linejoin="round"/>
  <path d="M90 26 L95 15 L82 21 Z" fill="#c4ccd8" stroke="${INK}" stroke-width="2.2" stroke-linejoin="round"/>
  ${lamp(face)}
  <!-- 筐体 -->
  <rect x="7" y="18" width="86" height="88" rx="15" fill="url(#${id}-g)" stroke="${INK}" stroke-width="3.2"/>
  <path d="M14 24 Q50 19 86 24" stroke="#fff" stroke-opacity=".55" stroke-width="2.4" fill="none" stroke-linecap="round"/>
  <!-- 傷とへこみ -->
  <path d="M12 92 L20 88 M78 96 L86 92 M15 40 L18 33" stroke="#7a4f0a" stroke-width="1.3" stroke-linecap="round" opacity=".8"/>
  <path d="M74 99 q4 -3 8 0" stroke="#7a4f0a" stroke-width="1.6" fill="none" opacity=".7"/>
  <!-- 看板（パチふと） -->
  <rect x="19" y="21.5" width="62" height="11" rx="3" fill="#7d1018" stroke="${INK}" stroke-width="2.2"/>
  <text x="50" y="30.4" text-anchor="middle" font-size="8.2" font-weight="900" letter-spacing=".5" fill="#ffd447" font-family="'Noto Sans JP', sans-serif">パチふと</text>
  ${[
    [12, 24],
    [88, 24],
    [12, 100],
    [88, 100],
  ]
    .map(([x, y]) => `<circle cx="${x}" cy="${y}" r="2.3" fill="url(#${id}-r)" stroke="${INK}" stroke-width="1.1"/>`)
    .join('')}
  <!-- 顔の液晶（黒いガラス。角にひび） -->
  <rect x="14" y="35" width="72" height="41" rx="7" fill="url(#${id}-s)" stroke="${INK}" stroke-width="2.4"/>
  <path d="M80 36.5 L76 42 L80 45 L75 51" stroke="#9fb3c8" stroke-width="1" fill="none" opacity=".7"/>
  ${eye(19, face)}${eye(60, face)}
  <circle cx="50" cy="58" r="3.2" fill="url(#${id}-r)" stroke="${INK}" stroke-width="1.2"/>
  ${brows(face)}
  <!-- 頬のばんそうこう -->
  <g transform="rotate(-18 22 82)"><rect x="14" y="78.5" width="16" height="7" rx="3" fill="#f3d7b0" stroke="${INK}" stroke-width="1.6"/><path d="M20 80.5 L24 84 M24 80.5 L20 84" stroke="#a8754a" stroke-width="1.1"/></g>
  <!-- 払い出し口（口） -->
  <rect x="30" y="80" width="40" height="17" rx="7" fill="#e7ecf2" stroke="${INK}" stroke-width="2.4"/>
  <rect x="32" y="81.5" width="36" height="4" rx="2" fill="#fff" opacity=".7"/>
  ${mouth(face)}
  <!-- 左手（小さな鉄の手）と右手のレバー：体の横から出す -->
  <path d="M7 64 L0 74" stroke="${INK}" stroke-width="7" stroke-linecap="round"/><path d="M7 64 L0 74" stroke="#c4ccd8" stroke-width="3.4" stroke-linecap="round"/>
  <circle cx="-1" cy="77" r="5.2" fill="#c4ccd8" stroke="${INK}" stroke-width="2.4"/>
  <circle cx="7" cy="64" r="3" fill="url(#${id}-r)" stroke="${INK}" stroke-width="1.4"/>
  ${lever}
  <circle cx="93" cy="62" r="3.4" fill="url(#${id}-r)" stroke="${INK}" stroke-width="1.4"/>
  ${sweatDrop}${shock}${sparkle}
</svg>`;
}
