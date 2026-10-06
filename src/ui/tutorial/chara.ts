/**
 * パチふとくん：麻雀牌スロットの妖精。
 * 昔のパチンコ屋の人気台がスクラップ置き場から掘り起こされ、世紀末の地下で目を覚ました姿。
 * - 体は使い込まれた金の筐体（傷・へこみ・鋲）。頭に回転灯、肩にトゲの鋲（世紀末の名残）
 * - 顔は黒いガラスの液晶。左右のリール窓が目（麻雀牌の絵柄）、払い出し口が口。頬にばんそうこう、画面の角にひび
 * - おでこは保留ランプ4つ（表情で点き方と色が変わる）
 * - 右手はレバー（赤い玉）、左手は小さな鉄の手
 * 表情は、目のリールの絵柄・眉の鉄板の角度・口で変える。30px ほどの小ささでも読めるよう、太い線で描く
 */
export type Face = 'neutral' | 'grin' | 'surprise' | 'proud' | 'sweat';

const INK = '#140b05';
let seq = 0;

/**
 * 目の麻雀牌：ふつう＝發、ニヤリ＝中（当たりの赤）、驚き＝一筒（まん丸に見開く）、
 * ドヤ顔＝赤五筒（赤ドラ）、冷や汗＝白（頭が真っ白）
 */
const RED = '#d4142e';
const GREEN = '#178a4a';
const BLUE = '#2458a6';

function tileFace(x: number, face: Face): string {
  const cx = x + 10.5;
  const cy = 58;
  const kanji = (ch: string, color: string, size = 16) =>
    `<text x="${cx}" y="${cy + size * 0.4}" text-anchor="middle" font-size="${size}" font-weight="900" fill="${color}" font-family="'Noto Sans JP', sans-serif">${ch}</text>`;
  switch (face) {
    case 'grin':
      return kanji('中', RED, 17);
    case 'surprise':
      // 一筒：大きな丸（赤・緑・青の輪）
      return `<circle cx="${cx}" cy="${cy}" r="8.4" fill="${GREEN}"/><circle cx="${cx}" cy="${cy}" r="6.2" fill="#f6f1e3"/>
        <circle cx="${cx}" cy="${cy}" r="4.6" fill="${RED}"/><circle cx="${cx}" cy="${cy}" r="2.6" fill="#f6f1e3"/><circle cx="${cx}" cy="${cy}" r="1.3" fill="${BLUE}"/>`;
    case 'proud': {
      // 赤五筒（赤ドラ）
      const dot = (dx: number, dy: number) =>
        `<circle cx="${cx + dx}" cy="${cy + dy}" r="3.3" fill="${RED}"/><circle cx="${cx + dx}" cy="${cy + dy}" r="1.3" fill="#f6f1e3"/>`;
      return dot(-5, -6.5) + dot(5, -6.5) + dot(0, 0) + dot(-5, 6.5) + dot(5, 6.5);
    }
    case 'sweat':
      // 白：青い枠だけ
      return `<rect x="${x + 4}" y="${cy - 8.5}" width="13" height="17" rx="1.5" fill="none" stroke="#3a7bd5" stroke-width="2"/>`;
    default:
      return kanji('發', GREEN, 16);
  }
}

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
  const half = face === 'sweat' ? `<rect x="${x}" y="46" width="21" height="9" fill="#5a5446" opacity=".55"/>` : '';
  return `<g class="pf-eye">
    <rect x="${x}" y="46" width="21" height="24" rx="3.5" fill="#f6f1e3" stroke="${INK}" stroke-width="2.6"/>
    <rect x="${x + 1.5}" y="47.5" width="18" height="5" rx="2" fill="#000" opacity=".12"/>
    ${tileFace(x, face)}
    ${half}
  </g>`;
}

function brows(face: Face): string {
  const [li, lo, ri, ro] = BROWS[face];
  const bar = (x1: number, y1: number, x2: number, y2: number) =>
    `<path d="M${x1} ${y1} L${x2} ${y2}" stroke="#c4ccd8" stroke-width="3.6" stroke-linecap="round"/>`;
  return bar(21, lo, 39, li) + bar(61, ri, 79, ro);
}

/** おでこの保留ランプ4つ。点き方と色は表情に合わせる（ふつう＝青2つ、ニヤリ＝赤、驚き＝金で全部、ドヤ顔＝虹、冷や汗＝青1つ） */
const HOLDS: Record<Face, (string | null)[]> = {
  neutral: ['#3a8bff', '#3a8bff', null, null],
  grin: ['#ff3344', '#ff3344', '#3a8bff', null],
  surprise: ['#ffcf2e', '#ffcf2e', '#ffcf2e', '#ffcf2e'],
  proud: ['#ff3344', '#ffcf2e', '#2fd27a', '#3a8bff'],
  sweat: ['#3a8bff', null, null, null],
};

function holds(face: Face): string {
  return HOLDS[face]
    .map((c, i) => {
      const cx = 29.5 + i * 13.7;
      return c
        ? `<circle cx="${cx}" cy="27" r="3.9" fill="${c}" stroke="${INK}" stroke-width="1.2"/><circle cx="${cx - 1.2}" cy="25.8" r="1.2" fill="#fff" opacity=".8"/>`
        : `<circle cx="${cx}" cy="27" r="3.9" fill="#3a3027" stroke="${INK}" stroke-width="1.2"/>`;
    })
    .join('');
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
  <!-- おでこの保留ランプ -->
  <rect x="21" y="21" width="58" height="12" rx="6" fill="#1a0d08" stroke="${INK}" stroke-width="2.2"/>
  ${holds(face)}
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
