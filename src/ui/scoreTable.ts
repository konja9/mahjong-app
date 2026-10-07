/**
 * 点数表（早見表）。遊び方の「点数」タブと、実戦・稽古の問題から開くポップアップで使う。
 * 値はすべて点数エンジン（calcScore）から作るので、ルールの設定と答えがずれない
 */
import type { Rules } from '../core/rules';
import { calcScore, isValidHanFu } from '../core/score';

/** 表に並べる符（このゲームで出題する 20〜60符） */
export const TABLE_FU = [20, 25, 30, 40, 50, 60] as const;
export const TABLE_HAN = [1, 2, 3, 4] as const;

const LIMITS: { name: string; han: string; at: number }[] = [
  { name: '満貫', han: '5翻', at: 5 },
  { name: '跳満', han: '6〜7翻', at: 6 },
  { name: '倍満', han: '8〜10翻', at: 8 },
  { name: '三倍満', han: '11〜12翻', at: 11 },
  { name: '役満', han: '13翻〜', at: 13 },
];

/** 表の中の点数はカンマなし（麻雀の点数の書き方。11600・2000-3900） */
const n = (v: number) => String(v);

/** 1マス：上にロン、下にツモ。ありえない組み合わせは「—」 */
function cell(han: number, fu: number, dealer: boolean, rules: Rules): string {
  const ron = isValidHanFu(han, fu, false) ? calcScore(han, fu, dealer, false, rules) : null;
  const tsumo = isValidHanFu(han, fu, true) ? calcScore(han, fu, dealer, true, rules) : null;
  const limit = (ron ?? tsumo)?.limit;
  if (limit) return `<td class="st-limit"><b>${limit}</b></td>`;
  const r = ron ? `<b>${n(ron.payment.ron)}</b>` : '<b class="st-na">—</b>';
  const t = tsumo ? `<small>${dealer ? `${n(tsumo.payment.fromDealer)}オール` : `${n(tsumo.payment.fromChild)}-${n(tsumo.payment.fromDealer)}`}</small>` : '<small class="st-na">—</small>';
  return `<td>${r}${t}</td>`;
}

/** 子か親の早見表（行が符、列が翻） */
export function scoreGridHtml(dealer: boolean, rules: Rules): string {
  const head = `<tr><th class="st-corner">ロン<br>ツモ</th>${TABLE_HAN.map((h) => `<th>${h}翻</th>`).join('')}</tr>`;
  const rows = TABLE_FU.map((fu) => `<tr><th>${fu}符</th>${TABLE_HAN.map((h) => cell(h, fu, dealer, rules)).join('')}</tr>`).join('');
  return `<table class="score-grid" data-side="${dealer ? 'dealer' : 'child'}"><thead>${head}</thead><tbody>${rows}</tbody></table>`;
}

/** 満貫以上の表（子・親のロンとツモ） */
export function limitTableHtml(rules: Rules): string {
  const rows = LIMITS.map((l) => {
    const c = calcScore(l.at, 30, false, false, rules);
    const ct = calcScore(l.at, 30, false, true, rules);
    const d = calcScore(l.at, 30, true, false, rules);
    const dt = calcScore(l.at, 30, true, true, rules);
    return `<tr><th>${l.name}<small>${l.han}</small></th><td><b>${n(c.payment.ron)}</b><small>${n(ct.payment.fromChild)}-${n(ct.payment.fromDealer)}</small></td><td><b>${n(d.payment.ron)}</b><small>${n(dt.payment.fromDealer)}オール</small></td></tr>`;
  }).join('');
  return `<table class="score-grid limit-grid"><thead><tr><th></th><th>子</th><th>親</th></tr></thead><tbody>${rows}</tbody></table>`;
}

/** 子・親の切り替えボタン */
export function scoreSidesHtml(dealer: boolean): string {
  const tab = (d: boolean) => `<button type="button" class="cfg${d === dealer ? ' on' : ''}" data-st-side="${d ? 'dealer' : 'child'}" aria-pressed="${d === dealer}">${d ? '親' : '子'}</button>`;
  return `<div class="cfg-group st-sides">${tab(false)}${tab(true)}</div>`;
}

/**
 * 子・親を切り替えて見る点数表（切り替えはボタンの data-st-side）。
 * legend=false（ポップアップ）では説明文と切り替えボタンを出さない（見出しの行に置く）
 */
export function scoreTableHtml(rules: Rules, dealer = false, opts: { legend?: boolean } = {}): string {
  const legend = opts.legend ?? true;
  return `<div class="score-table${legend ? '' : ' compact'}" data-show="${dealer ? 'dealer' : 'child'}">
    ${legend ? `${scoreSidesHtml(dealer)}<p class="st-legend"><b>大きい数字</b>＝ロン、<small>小さい数字</small>＝ツモ（子は「子-親」の支払い、親は「◯オール」＝子が1人ずつ払う額）</p>` : ''}
    ${scoreGridHtml(false, rules)}${scoreGridHtml(true, rules)}
    <div class="st-sub">満貫以上</div>
    ${limitTableHtml(rules)}
  </div>`;
}

/** 点数表の子・親の切り替え（クリックを受けた要素から） */
export function toggleScoreSide(target: HTMLElement): boolean {
  const b = target.closest<HTMLElement>('[data-st-side]');
  // ポップアップでは切り替えボタンが見出しの行にあるので、ダイアログの中の表を探す
  const box = b?.closest<HTMLElement>('.score-table') ?? b?.closest('dialog')?.querySelector<HTMLElement>('.score-table');
  if (!b || !box) return false;
  box.dataset.show = b.dataset.stSide!;
  (b.closest('dialog') ?? box).querySelectorAll<HTMLElement>('[data-st-side]').forEach((x) => {
    const on = x === b;
    x.classList.toggle('on', on);
    x.setAttribute('aria-pressed', String(on));
  });
  return true;
}
