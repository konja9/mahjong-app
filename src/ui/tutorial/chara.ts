/**
 * パチふとくん：麻雀牌スロットの妖精。3つのリール窓のうち左右が目、下の払い出し口が口。
 * 表情は目のリールの絵柄と口の形で変える。絵を差し替えるときは、この関数だけを直す
 */
export type Face = 'neutral' | 'grin' | 'surprise' | 'proud' | 'sweat';

const EYES: Record<Face, string> = { neutral: '發', grin: '7', surprise: '!', proud: '★', sweat: '－' };

function mouth(face: Face): string {
  switch (face) {
    case 'grin':
      return '<path d="M38 86 Q50 98 62 86" fill="none" stroke="#1b1206" stroke-width="4" stroke-linecap="round"/>';
    case 'surprise':
      return '<ellipse cx="50" cy="89" rx="6" ry="7" fill="#1b1206"/>';
    case 'proud':
      return '<path d="M36 85 Q50 95 64 85 Z" fill="#1b1206"/><path d="M42 86 h16" stroke="#e8c45a" stroke-width="2"/>';
    case 'sweat':
      return '<path d="M38 90 Q44 85 50 90 T62 90" fill="none" stroke="#1b1206" stroke-width="3.5" stroke-linecap="round"/>';
    default:
      return '<rect x="38" y="85" width="24" height="7" rx="3.5" fill="#1b1206"/>';
  }
}

function eye(x: number, face: Face): string {
  const sym = EYES[face];
  const color = face === 'grin' ? '#c8102e' : face === 'proud' ? '#c9a227' : face === 'neutral' ? '#178a4a' : '#1b1206';
  return `<g class="pf-eye">
    <rect x="${x}" y="40" width="22" height="28" rx="4" fill="#f4efe1" stroke="#1b1206" stroke-width="2.5"/>
    <text x="${x + 11}" y="61" text-anchor="middle" font-size="17" font-weight="900" fill="${color}" font-family="'Noto Sans JP', sans-serif">${sym}</text>
  </g>`;
}

/** パチふとくんの SVG（viewBox 0 0 100 120） */
export function charaSvg(face: Face = 'neutral'): string {
  const sweat = face === 'sweat' ? '<path d="M80 34 q5 8 0 12 q-5 -4 0 -12z" fill="#7cc4ff" stroke="#1b1206" stroke-width="1.5"/>' : '';
  const blush = face === 'grin' || face === 'proud' ? '<ellipse cx="20" cy="76" rx="5" ry="3" fill="#ff8a8a" opacity=".6"/><ellipse cx="80" cy="76" rx="5" ry="3" fill="#ff8a8a" opacity=".6"/>' : '';
  return `<svg class="pf-chara" data-face="${face}" viewBox="0 0 100 120" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <!-- レバー -->
    <rect x="88" y="34" width="5" height="34" rx="2.5" fill="#8a8f9c" stroke="#1b1206" stroke-width="2"/>
    <circle cx="90.5" cy="30" r="7" fill="#e0262f" stroke="#1b1206" stroke-width="2.5"/>
    <!-- 足 -->
    <rect x="24" y="104" width="14" height="12" rx="4" fill="#3a2c12" stroke="#1b1206" stroke-width="2.5"/>
    <rect x="62" y="104" width="14" height="12" rx="4" fill="#3a2c12" stroke="#1b1206" stroke-width="2.5"/>
    <!-- 筐体 -->
    <rect x="8" y="18" width="84" height="90" rx="16" fill="#e8c45a" stroke="#1b1206" stroke-width="3"/>
    <rect x="14" y="24" width="72" height="12" rx="6" fill="#c9a227" stroke="#1b1206" stroke-width="2"/>
    <text x="50" y="33.5" text-anchor="middle" font-size="8" font-weight="900" fill="#1b1206" font-family="'Noto Sans JP', sans-serif">パチふと</text>
    <!-- 顔の窓 -->
    <rect x="16" y="38" width="68" height="34" rx="8" fill="#1b1206"/>
    ${eye(22, face)}${eye(56, face)}
    <circle cx="50" cy="54" r="3" fill="#c9a227"/>
    ${blush}
    <!-- 払い出し口（口） -->
    <rect x="30" y="80" width="40" height="16" rx="7" fill="#c9a227" stroke="#1b1206" stroke-width="2"/>
    ${mouth(face)}
    ${sweat}
  </svg>`;
}
