import { type Group, WAIT_NAMES } from '../core/decompose';
import { type Evaluation, evaluateAll } from '../core/evaluate';
import { tripletKind } from '../core/fu';
import type { HandQuestion, HayamiQuestion } from '../core/generator';
import { type Hand, type Situation, isMenzen } from '../core/hand';
import type { Rules } from '../core/rules';
import { type ScoreResult, formatAnswer } from '../core/score';
import { EAST, type Tile, doraFromIndicator, tileName, windName } from '../core/tiles';
import { AkaAllocator, tileSvg } from './tileView';

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export function situationLabel(dealer: boolean, tsumo: boolean): string {
  return `${dealer ? '親' : '子'}の${tsumo ? 'ツモ' : 'ロン'}`;
}

/** 基本点から支払いまでの計算式 */
export function formulaHtml(s: ScoreResult): string {
  const lines: string[] = [];
  if (s.limit) {
    lines.push(`${s.limit} → 基本点 <b>${s.base.toLocaleString()}</b>`);
  } else {
    const raw = s.fu * 2 ** (s.han + 2);
    lines.push(`${s.fu}符 × 2<sup>${s.han}+2</sup> = 基本点 <b>${raw.toLocaleString()}</b>`);
  }
  const b = s.base;
  if (!s.tsumo) {
    const m = s.dealer ? 6 : 4;
    lines.push(`${b.toLocaleString()} × ${m} = ${(b * m).toLocaleString()} → <b>${s.payment.ron.toLocaleString()}</b>`);
  } else if (s.dealer) {
    lines.push(`${b.toLocaleString()} × 2 = ${(b * 2).toLocaleString()} → 各 <b>${s.payment.fromDealer.toLocaleString()}</b> オール`);
  } else {
    lines.push(
      `子 ${b.toLocaleString()} → <b>${s.payment.fromChild.toLocaleString()}</b>　親 ${(b * 2).toLocaleString()} → <b>${s.payment.fromDealer.toLocaleString()}</b>`,
    );
  }
  lines.push(`合計 ${s.payment.total.toLocaleString()}点`);
  return `<div class="formula">${lines.map((l) => `<div>${l}</div>`).join('')}</div>`;
}

export function hayamiExplain(q: HayamiQuestion): string {
  return `<div class="explain">
    <div class="ex-title">${q.han >= 5 ? `${q.han}翻` : `${q.han}翻${q.fu}符`}・${situationLabel(q.dealer, q.tsumo)}</div>
    ${formulaHtml(q.score)}
  </div>`;
}

/** 符の内訳：数える順にすべての項目を並べ、0符の項目は薄く、理由を小さく添える */
export function fuTable(ev: Evaluation): string {
  if (ev.yakuman) return '';
  const rows = ev.fu.rows
    .map(
      (r) =>
        `<tr class="${r.fu ? '' : 'zero'}"><td>${esc(r.label)}${r.note ? `<small class="fu-note">${esc(r.note)}</small>` : ''}</td><td>${r.fu}</td></tr>`,
    )
    .join('');
  const round = ev.fu.raw !== ev.fu.fu ? `${ev.fu.raw} → 切り上げ ` : '';
  return `<table class="fu-table"><tbody>${rows}</tbody><tfoot><tr><td>合計</td><td>${round}<b>${ev.fu.fu}符</b></td></tr></tfoot></table>`;
}

const GROUP_SHORT: Record<string, string> = { shuntsu: '順子' };
const MELD_NAME = { chi: 'チー', pon: 'ポン', minkan: '明槓', ankan: '暗槓' } as const;

function groupTiles(g: Group): Tile[] {
  if (g.kind === 'shuntsu') return [g.tile, g.tile + 1, g.tile + 2];
  return new Array<Tile>(g.kind === 'kantsu' ? 4 : 3).fill(g.tile);
}

/** 1つのブロック（面子・雀頭・対子）：牌と、その下の符 */
function block(tiles: Tile[], opts: { win: boolean; winTile: Tile; aka: AkaAllocator; back?: boolean; kind: string; fu?: number; tag?: string; wait?: string }): string {
  let marked = false;
  const html = tiles
    .map((t, i) => {
      const win = opts.win && !marked && t === opts.winTile;
      if (win) marked = true;
      const back = !!opts.back && (i === 0 || i === tiles.length - 1);
      return tileSvg(t, { red: !back && opts.aka.take(t), back, cls: win ? 'win' : '' });
    })
    .join('');
  const fu = opts.fu === undefined ? '' : `<b class="${opts.fu ? '' : 'zero'}">${opts.fu}符</b>`;
  const tag = opts.tag ? `<em>${opts.tag}</em>` : '';
  const wait = opts.wait ? `<span class="blk-wait">${opts.wait}</span>` : '';
  return `<div class="blk${opts.win ? ' has-win' : ''}"><div class="blk-tiles">${html}</div><div class="blk-cap"><span>${opts.kind}${tag}</span>${fu}${wait}</div></div>`;
}

/**
 * 手牌を面子ごとに区切って並べ、各ブロックの下に符を出す（正解に使った解釈）。
 * 和了牌は光らせ、和了牌で完成したブロックに待ちの形を添える
 */
export function blocksHtml(hand: Hand, ev: Evaluation): string {
  if (ev.yakuman) return '';
  const aka = new AkaAllocator(hand.akaTiles);
  const it = ev.interp;
  if (it.form === 'chiitoi') {
    const blocks = it.pairs.map((p) => block([p, p], { win: p === hand.winTile, winTile: hand.winTile, aka, kind: '対子' }));
    return `<div class="ex-blocks">${blocks.join('')}</div>`;
  }
  if (it.form !== 'standard') return '';
  const waitFu = it.wait === 'kanchan' || it.wait === 'penchan' || it.wait === 'tanki' ? 2 : 0;
  const waitLabel = `${WAIT_NAMES[it.wait]} ${waitFu ? '+2' : '0'}`;
  const fuOf = (i: number) => ev.fu.rows.filter((r) => r.group === i).reduce((s, r) => s + r.fu, 0);
  // 鳴いた面子（と暗槓）は groups の末尾に並ぶ
  const firstMeld = it.groups.length - hand.melds.length;
  const groupBlock = (g: Group, i: number) => {
    const meld = i >= firstMeld ? hand.melds[i - firstMeld] : null;
    return block(groupTiles(g), {
      win: i === it.winGroup,
      winTile: hand.winTile,
      aka,
      back: meld?.type === 'ankan',
      kind: GROUP_SHORT[g.kind] ?? tripletKind(g),
      tag: meld ? MELD_NAME[meld.type] : '',
      fu: fuOf(i),
      wait: i === it.winGroup ? waitLabel : '',
    });
  };
  const closed = it.groups.slice(0, firstMeld).map((g, i) => groupBlock(g, i));
  const pair = block([it.pair, it.pair], {
    win: it.winGroup === -1,
    winTile: hand.winTile,
    aka,
    kind: '雀頭',
    fu: fuOf(-1),
    wait: it.winGroup === -1 ? waitLabel : '',
  });
  const melds = it.groups.slice(firstMeld).map((g, i) => groupBlock(g, firstMeld + i));
  return `<div class="ex-blocks">${[...closed, pair, ...melds].join('')}</div>`;
}

/** 分け方の短い説明（例 両面待ち・平和／七対子） */
function interpLabel(ev: Evaluation): string {
  if (ev.interp.form === 'chiitoi') return '七対子';
  if (ev.interp.form !== 'standard') return '国士無双';
  const pinfu = ev.yaku.some((y) => y.name === '平和');
  return `${WAIT_NAMES[ev.interp.wait]}${pinfu ? '・平和' : ''}`;
}

/** 別の分け方で符や点数が変わる手なら、その分け方と、高点法で正解を決めていることを示す */
function altNote(q: HandQuestion, rules: Rules): string {
  const all = evaluateAll(q.hand, q.sit, rules);
  const key = (e: Evaluation) => `${interpLabel(e)}|${e.fu.fu}|${e.score.payment.total}`;
  const seen = new Set([key(q.ev)]);
  const alts: Evaluation[] = [];
  for (const e of all) {
    if (e.fu.fu === q.ev.fu.fu && e.score.payment.total === q.ev.score.payment.total) continue;
    if (seen.has(key(e))) continue;
    seen.add(key(e));
    alts.push(e);
  }
  if (!alts.length) return '';
  const line = (e: Evaluation) =>
    `<li>${interpLabel(e)} → ${e.yakuman ? '役満' : `${e.fu.fu}符`}${q.mode === 'jissen' || e.fu.fu !== q.ev.fu.fu ? `・${e.han}翻 ${formatAnswer(e.score)}` : ''}</li>`;
  return `<div class="ex-alt"><div class="ex-h">別の分け方</div><ul>${alts.slice(0, 2).map(line).join('')}</ul>
    <p class="muted small">この手は分け方で符が変わります。点数が高くなる分け方（${interpLabel(q.ev)}・${q.ev.han}翻 ${formatAnswer(q.ev.score)}）を正解にしています（高点法）。</p></div>`;
}

/** 解説の見出しに添える状況（符に効くものだけ） */
function fuSituation(hand: Hand, sit: Situation): string {
  return [`${windName(sit.roundWind)}場`, `${windName(sit.seatWind)}家`, sit.tsumo ? 'ツモ' : 'ロン', isMenzen(hand) ? '門前' : '鳴きあり'].join('・');
}

function yakuTable(ev: Evaluation): string {
  const rows = [...ev.yaku, ...ev.dora]
    .map((y) => `<tr class="${y.yakuman ? 'yakuman' : ''}"><td>${esc(y.name)}</td><td>${y.yakuman ? (y.yakuman > 1 ? `${y.yakuman}倍役満` : '役満') : `${y.han}翻`}</td></tr>`)
    .join('');
  const total = ev.yakuman ? '' : `<tfoot><tr><td>合計</td><td><b>${ev.han}翻</b></td></tr></tfoot>`;
  return `<table class="yaku-table"><tbody>${rows}</tbody>${total}</table>`;
}

export function handExplain(q: HandQuestion, rules: Rules): string {
  const { ev } = q;
  const link = '<button class="ex-link" type="button" data-help-link="fu">符の数え方 ›</button>';
  const fuHead = `<div class="ex-h">符の内訳 <span class="muted">${fuSituation(q.hand, q.sit)}</span>${link}</div>`;
  const blocks = blocksHtml(q.hand, ev);
  const alt = ev.yakuman ? '' : altNote(q, rules);
  const main =
    q.mode === 'fu'
      ? `<div class="ex-cols"><div>${fuHead}${fuTable(ev)}</div>
         <div><div class="ex-h">参考：役と点数</div>${yakuTable(ev)}<div class="muted small">${ev.han}翻${ev.fu.fu}符 → ${formatAnswer(ev.score)}</div></div></div>`
      : `<div class="ex-cols"><div><div class="ex-h">役</div>${yakuTable(ev)}</div>
         ${ev.yakuman ? '' : `<div>${fuHead}${fuTable(ev)}</div>`}
         <div><div class="ex-h">点数</div>${formulaHtml(ev.score)}</div></div>`;
  return `<div class="explain">${blocks}${alt}${main}</div>`;
}

export function situationChips(q: HandQuestion): string {
  const s = q.sit;
  const dealer = s.seatWind === EAST;
  const chips = [
    `${windName(s.roundWind)}場`,
    `${windName(s.seatWind)}家（${dealer ? '親' : '子'}）`,
    s.tsumo ? 'ツモ' : 'ロン',
  ];
  if (s.doubleRiichi) chips.push('ダブル立直');
  else if (s.riichi) chips.push('立直');
  if (s.ippatsu) chips.push('一発');
  if (s.haitei) chips.push('海底');
  if (s.houtei) chips.push('河底');
  if (s.rinshan) chips.push('嶺上');
  return chips.map((c) => `<span class="chip">${c}</span>`).join('');
}

export function doraLabel(ind: number[]): string {
  return ind.map((i) => tileName(doraFromIndicator(i))).join('・');
}
