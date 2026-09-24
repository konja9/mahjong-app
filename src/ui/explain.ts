import { WAIT_NAMES } from '../core/decompose';
import type { Evaluation } from '../core/evaluate';
import type { HandQuestion, HayamiQuestion } from '../core/generator';
import { type ScoreResult, formatAnswer } from '../core/score';
import { EAST, doraFromIndicator, tileName, windName } from '../core/tiles';

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
    <div class="ex-title">${q.han >= 5 ? `${q.han}翻` : `${q.fu}符${q.han}翻`}・${situationLabel(q.dealer, q.tsumo)}</div>
    ${formulaHtml(q.score)}
  </div>`;
}

function fuTable(ev: Evaluation): string {
  if (ev.yakuman) return '';
  const rows = ev.fu.items.map((i) => `<tr><td>${esc(i.label)}</td><td>${i.fu}</td></tr>`).join('');
  const round = ev.fu.raw !== ev.fu.fu ? `${ev.fu.raw} → 切り上げ ` : '';
  return `<table class="fu-table"><tbody>${rows}</tbody><tfoot><tr><td>合計</td><td>${round}<b>${ev.fu.fu}符</b></td></tr></tfoot></table>`;
}

function yakuTable(ev: Evaluation): string {
  const rows = [...ev.yaku, ...ev.dora]
    .map((y) => `<tr class="${y.yakuman ? 'yakuman' : ''}"><td>${esc(y.name)}</td><td>${y.yakuman ? (y.yakuman > 1 ? `${y.yakuman}倍役満` : '役満') : `${y.han}翻`}</td></tr>`)
    .join('');
  const total = ev.yakuman ? '' : `<tfoot><tr><td>合計</td><td><b>${ev.han}翻</b></td></tr></tfoot>`;
  return `<table class="yaku-table"><tbody>${rows}</tbody>${total}</table>`;
}

function waitNote(ev: Evaluation): string {
  if (ev.interp.form !== 'standard') return ev.interp.form === 'chiitoi' ? '七対子形' : '国士無双形';
  return `解釈：${WAIT_NAMES[ev.interp.wait]}`;
}

export function handExplain(q: HandQuestion): string {
  const { ev } = q;
  const main =
    q.mode === 'fu'
      ? `<div class="ex-cols"><div><div class="ex-h">符の内訳 <span class="muted">${waitNote(ev)}</span></div>${fuTable(ev)}</div>
         <div><div class="ex-h">参考：役と点数</div>${yakuTable(ev)}<div class="muted small">${ev.fu.fu}符${ev.han}翻 → ${formatAnswer(ev.score)}</div></div></div>`
      : `<div class="ex-cols"><div><div class="ex-h">役</div>${yakuTable(ev)}</div>
         ${ev.yakuman ? '' : `<div><div class="ex-h">符 <span class="muted">${waitNote(ev)}</span></div>${fuTable(ev)}</div>`}
         <div><div class="ex-h">点数</div>${formulaHtml(ev.score)}</div></div>`;
  return `<div class="explain">${main}</div>`;
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
