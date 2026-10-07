import type { PartId } from './parts';

/**
 * 改造パーツの絵。パチふとくん（tutorial/chara.ts）と同じ画風：太い黒の縁取り、使い込まれた金・鉄・赤。
 * スクラップ置き場から拾ってきた台の部品に見えるよう、鋲や傷を少し入れる。
 * 18px ほどの小ささでも形が分かるよう、輪郭を大きく取り、細部は控えめにする
 */

const INK = '#140b05';
const RED = '#d4142e';
const STEEL = '#c4ccd8';
const W = 2.6;
let seq = 0;

/** 共通のグラデーション（金・鉄・赤）。id は呼ぶたびに変える */
function defs(id: string): string {
  return `<defs>
    <linearGradient id="${id}-g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe9a0"/><stop offset=".25" stop-color="#f2c94c"/><stop offset=".65" stop-color="#d9a52a"/><stop offset="1" stop-color="#9c6a14"/></linearGradient>
    <linearGradient id="${id}-s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#eef1f6"/><stop offset=".5" stop-color="${STEEL}"/><stop offset="1" stop-color="#6b7383"/></linearGradient>
    <linearGradient id="${id}-r" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff5a66"/><stop offset=".55" stop-color="${RED}"/><stop offset="1" stop-color="#7c0b18"/></linearGradient>
    <radialGradient id="${id}-b" cx=".35" cy=".32" r=".75"><stop offset="0" stop-color="#fff"/><stop offset=".4" stop-color="${STEEL}"/><stop offset="1" stop-color="#4d5563"/></radialGradient>
    <radialGradient id="${id}-o" cx=".35" cy=".32" r=".75"><stop offset="0" stop-color="#fffbe0"/><stop offset=".35" stop-color="#ffd84a"/><stop offset=".8" stop-color="#d9a52a"/><stop offset="1" stop-color="#8a5a0c"/></radialGradient>
  </defs>`;
}

const rivet = (x: number, y: number, r = 1.6) => `<circle cx="${x}" cy="${y}" r="${r}" fill="#fff4b8" stroke="${INK}" stroke-width="1"/>`;
/** 4方向に光る小さなきらめき */
const sparkle = (x: number, y: number, s = 4) =>
  `<path d="M${x} ${y - s} L${x + s * 0.3} ${y - s * 0.3} L${x + s} ${y} L${x + s * 0.3} ${y + s * 0.3} L${x} ${y + s} L${x - s * 0.3} ${y + s * 0.3} L${x - s} ${y} L${x - s * 0.3} ${y - s * 0.3}Z" fill="#fff4b8" stroke="${INK}" stroke-width="1"/>`;
/** 右下の丸い札（＋や数字） */
const badge = (text: string, f: (k: string) => string) =>
  `<circle cx="50" cy="50" r="10" fill="${f('r')}" stroke="${INK}" stroke-width="${W}"/><text x="50" y="54.6" text-anchor="middle" font-size="${text.length > 1 ? 11 : 14}" font-weight="900" fill="#fff" font-family="'Noto Sans JP', sans-serif">${text}</text>`;

type Draw = (f: (k: string) => string) => string;

const ART: Record<PartId, Draw> = {
  // 速答センサー：指紋を読む金のセンサー板と、赤い感知ランプ、稲妻
  fast: (f) => `
    <rect x="6" y="18" width="34" height="38" rx="6" fill="${f('g')}" stroke="${INK}" stroke-width="${W}"/>
    <rect x="11" y="24" width="24" height="26" rx="4" fill="#141a24" stroke="${INK}" stroke-width="1.6"/>
    <g fill="none" stroke="#7fd6ff" stroke-width="1.6" stroke-linecap="round"><path d="M17 44 Q15 36 23 32 Q31 34 29 44"/><path d="M21 44 Q20 38 23 36 Q26 38 25 44"/></g>
    <circle cx="14" cy="13" r="5" fill="${f('r')}" stroke="${INK}" stroke-width="${W}"/><circle cx="12.6" cy="11.6" r="1.5" fill="#fff" opacity=".85"/>
    <path d="M46 4 L33 30 L43 30 L36 58 L59 24 L48 24 L55 4 Z" fill="#ffe14a" stroke="${INK}" stroke-width="${W}" stroke-linejoin="round"/>`,
  // 保留タンク：ガラスの筒に玉が5つ
  tank: (f) => `
    <rect x="20" y="10" width="24" height="44" rx="7" fill="#9fd3ff" fill-opacity=".28" stroke="${INK}" stroke-width="${W}"/>
    ${[17, 24.5, 32, 39.5, 47].map((y) => `<circle cx="32" cy="${y}" r="3.9" fill="${f('b')}" stroke="${INK}" stroke-width="1.3"/>`).join('')}
    <path d="M24 14 V50" stroke="#fff" stroke-width="2" opacity=".55" stroke-linecap="round"/>
    <rect x="15" y="4" width="34" height="9" rx="3" fill="${f('g')}" stroke="${INK}" stroke-width="${W}"/>
    <rect x="15" y="51" width="34" height="9" rx="3" fill="${f('g')}" stroke="${INK}" stroke-width="${W}"/>
    ${rivet(20, 8.5)}${rivet(44, 8.5)}${rivet(20, 55.5)}${rivet(44, 55.5)}`,
  // クッション：鋲打ちの赤い革
  cushion: (f) => `
    <path d="M8 22 Q8 12 18 13 Q32 9 46 13 Q56 12 56 22 L56 42 Q56 52 46 51 Q32 55 18 51 Q8 52 8 42 Z" fill="${f('r')}" stroke="${INK}" stroke-width="${W}" stroke-linejoin="round"/>
    <g stroke="#7c0b18" stroke-width="1.4" fill="none" stroke-linecap="round"><path d="M20 24 L26 30 M32 24 L26 30 M32 24 L38 30 M44 24 L38 30 M26 30 L20 37 M26 30 L32 37 M38 30 L32 37 M38 30 L44 37"/></g>
    ${[
      [20, 24],
      [32, 24],
      [44, 24],
      [26, 30],
      [38, 30],
      [20, 37],
      [32, 37],
      [44, 37],
    ]
      .map(([x, y]) => rivet(x, y, 2.1))
      .join('')}
    <path d="M14 18 Q24 14 34 15" stroke="#ffb3b8" stroke-width="2" fill="none" stroke-linecap="round" opacity=".8"/>`,
  // 先読みレンズ：真鍮のルーペ。中に保留ランプの光
  lens: (f) => `
    <path d="M38 38 L56 56" stroke="${INK}" stroke-width="10" stroke-linecap="round"/>
    <path d="M38 38 L56 56" stroke="${f('s')}" stroke-width="5.6" stroke-linecap="round"/>
    <circle cx="26" cy="26" r="20" fill="${f('g')}" stroke="${INK}" stroke-width="${W}"/>
    <circle cx="26" cy="26" r="14" fill="#10243a" stroke="${INK}" stroke-width="2"/>
    <circle cx="19" cy="28" r="3.6" fill="#ff3344"/><circle cx="27" cy="22" r="3.6" fill="#3a8bff"/><circle cx="33" cy="30" r="3.6" fill="#2fd27a"/>
    <path d="M16 18 Q20 13 26 13" stroke="#fff" stroke-width="2.2" fill="none" stroke-linecap="round" opacity=".8"/>
    ${rivet(26, 8.5)}${rivet(43.5, 26)}${rivet(8.5, 26)}`,
  // 電チュー増強：開いた赤いチューリップと太いばね
  denchu: (f) => `
    <path d="M32 34 L24 37 L40 40 L24 43 L40 46 L24 49 L32 52" fill="none" stroke="${INK}" stroke-width="6" stroke-linejoin="round" stroke-linecap="round"/>
    <path d="M32 34 L24 37 L40 40 L24 43 L40 46 L24 49 L32 52" fill="none" stroke="${f('g')}" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round"/>
    <path d="M8 8 L20 30 Q32 38 44 30 L56 8 L44 16 L32 5 L20 16 Z" fill="${f('r')}" stroke="${INK}" stroke-width="${W}" stroke-linejoin="round"/>
    <path d="M24 18 L32 10 L40 18" stroke="#ffb3b8" stroke-width="1.8" fill="none" stroke-linecap="round" opacity=".85"/>
    <rect x="16" y="52" width="32" height="8" rx="2.5" fill="${f('s')}" stroke="${INK}" stroke-width="${W}"/>${rivet(21, 56)}${rivet(43, 56)}`,
  // ST 延長：回転灯と＋
  st: (f) => `
    <g stroke="#ff4a4a" stroke-width="2.6" stroke-linecap="round" opacity=".9"><path d="M12 14 L6 9"/><path d="M52 14 L58 9"/><path d="M32 6 V1"/><path d="M8 28 H3"/><path d="M56 28 H61"/></g>
    <path d="M14 42 Q14 12 32 12 Q50 12 50 42 Z" fill="${f('r')}" stroke="${INK}" stroke-width="${W}" stroke-linejoin="round"/>
    <path d="M21 34 Q21 19 31 17" stroke="#ffd0d4" stroke-width="3" fill="none" stroke-linecap="round" opacity=".85"/>
    <rect x="9" y="40" width="46" height="10" rx="3" fill="${f('s')}" stroke="${INK}" stroke-width="${W}"/>
    ${rivet(15, 45)}${rivet(49, 45)}
    ${badge('+', f)}`,
  // 連続ブースター：右上がりの3本のメーターと矢印
  combo: (f) => `
    <rect x="6" y="40" width="13" height="18" rx="2.5" fill="${f('g')}" stroke="${INK}" stroke-width="${W}"/>
    <rect x="24" y="30" width="13" height="28" rx="2.5" fill="${f('g')}" stroke="${INK}" stroke-width="${W}"/>
    <rect x="42" y="18" width="13" height="40" rx="2.5" fill="${f('r')}" stroke="${INK}" stroke-width="${W}"/>
    <path d="M6 30 L22 18 L30 23 L44 8" fill="none" stroke="${INK}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M6 30 L22 18 L30 23 L44 8" fill="none" stroke="#7fffb0" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M36 6 L48 3 L45 15 Z" fill="#7fffb0" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>`,
  // 確変ユニット：鉄の箱の基板、紫の確変ランプ、出どころ不明のテープ
  kakuhen: (f) => `
    <rect x="6" y="14" width="52" height="40" rx="5" fill="${f('s')}" stroke="${INK}" stroke-width="${W}"/>
    <rect x="12" y="20" width="26" height="28" rx="2" fill="#16502f" stroke="${INK}" stroke-width="1.6"/>
    <g stroke="#e8c76a" stroke-width="1.4" fill="none"><path d="M15 26 H24 V32 H34"/><path d="M15 40 H22 V36 H34"/><path d="M28 44 H35"/></g>
    <rect x="18" y="29" width="7" height="6" fill="${INK}"/><rect x="27" y="38" width="6" height="5" fill="${INK}"/>
    <circle cx="48" cy="28" r="6.5" fill="#c86bff" stroke="${INK}" stroke-width="${W}"/><circle cx="46" cy="26" r="2" fill="#fff" opacity=".85"/>
    <circle cx="48" cy="28" r="10" fill="none" stroke="#c86bff" stroke-width="1.4" opacity=".55"/>
    <path d="M36 50 L58 38 L60 44 L39 56 Z" fill="#e9dfb8" stroke="${INK}" stroke-width="1.8" stroke-linejoin="round"/>
    <path d="M44 45 L50 49 M50 43 L45 50" stroke="${RED}" stroke-width="1.8" stroke-linecap="round"/>
    ${rivet(10, 18)}${rivet(10, 50)}${rivet(54, 18)}`,
  // 上乗せ強化：積み上がる金のコインと＋
  uwanose: (f) => {
    const coin = (y: number) =>
      `<path d="M10 ${y} V${y + 5} Q26 ${y + 12} 42 ${y + 5} V${y}" fill="#b07d18" stroke="${INK}" stroke-width="${W}"/><ellipse cx="26" cy="${y}" rx="16" ry="6" fill="${f('o')}" stroke="${INK}" stroke-width="${W}"/>`;
    return `${coin(50)}${coin(42)}${coin(34)}${coin(26)}
      <path d="M18 25 Q26 22 34 25" stroke="#fff" stroke-width="1.6" fill="none" stroke-linecap="round" opacity=".7"/>
      <circle cx="49" cy="15" r="10" fill="${f('r')}" stroke="${INK}" stroke-width="${W}"/>
      <path d="M49 9.5 V20.5 M43.5 15 H54.5" stroke="#fff" stroke-width="3.2" stroke-linecap="round"/>
      ${sparkle(12, 12, 4.5)}`;
  },
  // 赤五筒センサー：赤五筒の牌と、それを見つめる目玉のセンサー
  premium: (f) => `
    <rect x="31" y="10" width="26" height="36" rx="4" fill="#f6f1e3" stroke="${INK}" stroke-width="${W}"/>
    <rect x="31" y="40" width="26" height="6" rx="2" fill="#1f5c45" stroke="${INK}" stroke-width="1.6"/>
    ${[
      [38, 18],
      [50, 18],
      [44, 26],
      [38, 34],
      [50, 34],
    ]
      .map(([x, y]) => `<circle cx="${x}" cy="${y}" r="3.6" fill="${RED}"/><circle cx="${x}" cy="${y}" r="1.4" fill="#f6f1e3"/>`)
      .join('')}
    <path d="M22 32 L32 28" stroke="#ff4a4a" stroke-width="2" stroke-dasharray="2 2" opacity=".9"/>
    <circle cx="15" cy="36" r="12" fill="${f('g')}" stroke="${INK}" stroke-width="${W}"/>
    <circle cx="16" cy="35" r="7.5" fill="#fff" stroke="${INK}" stroke-width="1.8"/>
    <circle cx="18" cy="33.6" r="4" fill="${RED}"/><circle cx="18.8" cy="33" r="1.6" fill="${INK}"/><circle cx="16.6" cy="32" r="1" fill="#fff"/>
    <rect x="9" y="47" width="12" height="11" rx="2" fill="${f('s')}" stroke="${INK}" stroke-width="2"/>`,
  // ラウンド追加：R の刻印の歯車と＋1
  round: (f) => {
    const teeth = Array.from({ length: 8 }, (_, i) => `<rect x="25" y="2" width="12" height="12" rx="2" transform="rotate(${i * 45} 31 29)" fill="${f('g')}" stroke="${INK}" stroke-width="${W}"/>`).join('');
    return `${teeth}<circle cx="31" cy="29" r="20" fill="${f('g')}" stroke="${INK}" stroke-width="${W}"/>
      <circle cx="31" cy="29" r="13" fill="#3a3027" stroke="${INK}" stroke-width="2"/>
      <text x="31" y="35.5" text-anchor="middle" font-size="18" font-weight="900" fill="#ffe14a" font-family="'Noto Sans JP', sans-serif">R</text>
      ${badge('+1', f)}`;
  },
  // 金の玉：伝説の大当りの玉と同じ色
  gold: (f) => `
    <circle cx="32" cy="34" r="20" fill="#ffd84a" opacity=".25"/>
    <circle cx="32" cy="34" r="16" fill="${f('o')}" stroke="${INK}" stroke-width="${W}"/>
    <ellipse cx="26" cy="27" rx="5.5" ry="3.6" fill="#fff" opacity=".9" transform="rotate(-30 26 27)"/>
    <path d="M40 44 Q44 40 45 34" stroke="#8a5a0c" stroke-width="1.8" fill="none" stroke-linecap="round" opacity=".7"/>
    ${sparkle(51, 13, 6)}${sparkle(11, 16, 4)}${sparkle(54, 50, 3.5)}`,
};

/** パーツの絵（viewBox 64×64）。label を渡すと読み上げ用の名前を付ける */
export function partSvg(id: PartId, label?: string): string {
  const pid = `pa${++seq}`;
  const f = (k: string) => `url(#${pid}-${k})`;
  const aria = label ? ` role="img" aria-label="${label}"` : ' aria-hidden="true"';
  return `<svg class="part-art" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg"${aria}>${defs(pid)}${ART[id](f)}</svg>`;
}

/** 鍵のかかった枠の南京錠（viewBox 64×64） */
export function lockSvg(): string {
  const pid = `pa${++seq}`;
  const f = (k: string) => `url(#${pid}-${k})`;
  return `<svg class="part-art lock-art" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${defs(pid)}
    <path d="M20 30 V22 Q20 9 32 9 Q44 9 44 22 V30" fill="none" stroke="${INK}" stroke-width="10" stroke-linecap="round"/>
    <path d="M20 30 V22 Q20 9 32 9 Q44 9 44 22 V30" fill="none" stroke="${f('s')}" stroke-width="5" stroke-linecap="round"/>
    <rect x="12" y="28" width="40" height="30" rx="6" fill="${f('g')}" stroke="${INK}" stroke-width="${W}"/>
    <circle cx="32" cy="40" r="4.6" fill="${INK}"/><path d="M30 42 L29 50 H35 L34 42 Z" fill="${INK}"/>
    ${rivet(17, 33)}${rivet(47, 33)}${rivet(17, 53)}${rivet(47, 53)}
    <path d="M16 31 Q24 29 30 30" stroke="#fff4b8" stroke-width="1.6" fill="none" stroke-linecap="round" opacity=".8"/>
  </svg>`;
}

export interface SlotRowView {
  /** 付けているパーツ（前から順に枠に入る） */
  equip: PartId[];
  /** 開いている枠の数 */
  slots: number;
  /** 枠ごとの、鍵が開く段位の名前（5つ） */
  ranks: string[];
  /** 新しく開いた枠（0 始まり。鍵が外れる動きを付ける） */
  opened?: number;
  /** 鍵の枠の下に段位の名前を書く */
  labels?: boolean;
  /** 次の鍵の枠を開ける昇段試験を今受けられる（そのときだけ次の鍵を光らせる） */
  nextReady?: boolean;
  /** 付けているパーツの名前（title 用） */
  names?: Partial<Record<PartId, string>>;
}

/** 台の改造の5つの枠：付けているパーツ・開いた空の枠・鍵のかかった枠。次に開く鍵は、その試験を受けられるときだけ光らせる */
export function slotRowHtml(v: SlotRowView): string {
  return v.ranks
    .map((rank, i) => {
      const id = v.equip[i];
      const label = v.labels ? `<small>${i < v.slots ? '&nbsp;' : rank}</small>` : '';
      if (i < v.slots && id) return `<span class="slot on" title="${v.names?.[id] ?? ''}"><i>${partSvg(id)}</i>${label}</span>`;
      if (i < v.slots) return `<span class="slot open${i === v.opened ? ' opened' : ''}" title="空いている枠"><i>${i === v.opened ? lockSvg() : ''}</i>${label}</span>`;
      return `<span class="slot locked${i === v.slots && v.nextReady ? ' next' : ''}" title="${rank}の昇段試験で開く"><i>${lockSvg()}</i>${label}</span>`;
    })
    .join('');
}
