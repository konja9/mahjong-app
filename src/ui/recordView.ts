import type { Mode } from '../core/generator';
import { RANKS, nextRank } from './exam';
import type { HitRecord } from './machine/machine';
import {
  type DayPoint,
  type ExamTarget,
  MODES,
  MODE_NAMES,
  RECENT_MIN,
  RECENT_N,
  type RecordData,
  type Trend,
  bySituation,
  dailySeries,
  examTarget,
  missedHayami,
  today,
  trend,
} from './record';
import { charaSvg } from './tutorial/chara';

/**
 * 成績の画面（メニューの「成績」）。腕前・推移・苦手・台の4つのタブ
 */

export type RecordTab = 'skill' | 'trend' | 'weak' | 'machine';

export interface RecordView {
  tab: RecordTab;
  /** 推移のタブで見ている種目 */
  mode: Mode;
  rec: RecordData;
  day: string;
  /** 受かった段位の数 */
  rank: number;
  /** 稽古の途中なら、今回の稽古の成績 */
  keiko: { n: number; c: number } | null;
  /** 符の要素別（稽古の累計） */
  elements: { name: string; c: number; n: number }[];
  /** 苦手ドリルを始められるか */
  weakReady: boolean;
  machine: { name: string; balance: number; dayNet: number; hits: number; maxChain: number; bankrupts: number; log: HitRecord[] };
}

const pct = (v: number | null) => (v === null ? '—' : `${Math.round(v * 100)}`);
const sec = (v: number | null) => (v === null ? '—' : v.toFixed(1));
const signed = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : '±'}${Math.abs(v).toLocaleString()}`;
/** 日付 YYYY-MM-DD を M/D に */
const md = (d: string) => {
  const [, m, dd] = d.split('-');
  return `${Number(m)}/${Number(dd)}`;
};

const TABS: [RecordTab, string][] = [
  ['skill', '腕前'],
  ['trend', '推移'],
  ['weak', '苦手'],
  ['machine', '台'],
];

export function recordHtml(v: RecordView): string {
  const tabs = TABS.map(
    ([id, label]) => `<button class="cfg${v.tab === id ? ' on' : ''}" type="button" role="tab" aria-selected="${v.tab === id}" data-rec-tab="${id}">${label}</button>`,
  ).join('');
  const body = v.tab === 'trend' ? trendHtml(v) : v.tab === 'weak' ? weakHtml(v) : v.tab === 'machine' ? machineHtml(v) : skillHtml(v);
  return `<div class="settings record">
    <div class="set-head"><span>成績</span><button class="icon-btn" type="button" data-rec-close aria-label="閉じる">×</button></div>
    <div class="cfg-group help-tabs rec-tabs" role="tablist">${tabs}</div>
    <div class="rec-body">${body}</div>
  </div>`;
}

// ------------------------------------------------------------ 腕前

function arrow(t: Trend): string {
  const parts: string[] = [];
  if (t.dAcc !== null && t.dAcc !== 0) parts.push(`<span class="${t.dAcc > 0 ? 'up' : 'down'}">${t.dAcc > 0 ? '▲' : '▼'}${Math.abs(t.dAcc)}pt</span>`);
  if (t.dSec !== null && Math.abs(t.dSec) >= 0.1) parts.push(`<span class="${t.dSec < 0 ? 'up' : 'down'}">${Math.abs(t.dSec).toFixed(1)}秒${t.dSec < 0 ? '速く' : '遅く'}</span>`);
  if (!t.prev) return '<span class="muted">前の記録と比べるのは、もう少し解いてから</span>';
  return parts.length ? `前の${RECENT_N}問より ${parts.join(' ')}` : '<span class="muted">前の50問と同じくらい</span>';
}

function modeCard(v: RecordView, m: Mode): string {
  const t = trend(v.rec, m);
  const total = v.rec.total[m];
  const series = dailySeries(v.rec, m, 14);
  if (t.now.n < RECENT_MIN) {
    return `<div class="rec-card few"><div class="rc-head"><b>${MODE_NAMES[m]}</b><small>累計 ${total?.n ?? 0}問</small></div>
      <p class="muted">まだ記録が少ない（${RECENT_MIN}問から腕前を出します）</p></div>`;
  }
  return `<div class="rec-card"><div class="rc-head"><b>${MODE_NAMES[m]}</b><small>累計 ${total?.n.toLocaleString() ?? 0}問</small></div>
    <div class="rc-main">
      <div class="rc-acc"><b>${pct(t.now.acc)}</b><small>%</small></div>
      <div class="rc-sub"><span>平均 <b>${sec(t.now.avg)}</b>秒</span><span class="muted">直近${t.now.n}問</span></div>
      ${spark(series)}
    </div>
    <div class="rc-trend">${arrow(t)}</div></div>`;
}

/** 日ごとの正答率の小さな折れ線 */
function spark(ps: DayPoint[]): string {
  if (ps.length < 2) return '<span class="rc-spark"></span>';
  const w = 90;
  const h = 30;
  const x = (i: number) => (i / (ps.length - 1)) * w;
  const y = (a: number) => h - 2 - a * (h - 4);
  const pts = ps.map((p, i) => `${x(i).toFixed(1)},${y(p.acc).toFixed(1)}`).join(' ');
  return `<svg class="rc-spark" viewBox="0 0 ${w} ${h}" aria-hidden="true"><polyline points="${pts}"/><circle cx="${x(ps.length - 1).toFixed(1)}" cy="${y(ps[ps.length - 1].acc).toFixed(1)}" r="2.5"/></svg>`;
}

const VERDICT: Record<ExamTarget['verdict'], string> = {
  few: 'まだ記録が少ない',
  ready: '受かる腕前',
  close: 'あと少し',
  far: 'まだ遠い',
};

function targetHtml(v: RecordView): string {
  const next = nextRank(v.rank);
  const rank = next ?? RANKS[RANKS.length - 1];
  const t = examTarget(rank, v.rec);
  const need = `${rank.about}・${rank.pass}/${rank.modes.length}問${rank.avgSec !== null ? `・平均${rank.avgSec}秒` : ''}`;
  const short: string[] = [];
  if (t.verdict !== 'few') {
    if (t.shortAcc > 0) short.push(`正答率 あと${Math.ceil(t.shortAcc * 100)}pt`);
    if (t.shortSec > 0) short.push(`平均 あと${t.shortSec.toFixed(1)}秒速く`);
  }
  const lv = next ? (next.level > 0 ? `Lv ${next.level} から受験` : '') : '';
  return `<div class="rec-target ${t.verdict}">
    <div class="rt-head"><span>${next ? '次の昇段試験' : '名人の基準'}</span><b>${rank.name}</b><small class="muted">${lv}</small><em>${VERDICT[t.verdict]}</em></div>
    <div class="rt-row"><span>基準</span><span>${need}</span></div>
    <div class="rt-row"><span>今の腕前</span><span>${t.now.n ? `直近${t.now.n}問 正答率 <b>${pct(t.now.acc)}%</b>${t.needSec !== null ? `・平均 <b>${sec(t.now.avg)}</b>秒` : ''}${rank.input ? '（数値入力）' : ''}` : rank.input ? '数値入力で答えた記録がまだない' : 'まだ記録がない'}</span></div>
    ${short.length ? `<div class="rt-row"><span>足りない</span><span>${short.join('・')}</span></div>` : ''}
  </div>`;
}

/** パチふとくんの一言（いちばん解いている種目の上がり下がりで変える） */
export function recordComment(v: RecordView): string {
  const counts = MODES.map((m) => ({ m, t: trend(v.rec, m) })).sort((a, b) => b.t.now.n - a.t.now.n);
  const top = counts[0];
  if (!top || top.t.now.n < RECENT_MIN) return '記録は今日からつけてるぜ。何問か解いたら、腕前が数字で出てくるからな';
  const name = MODE_NAMES[top.m];
  const { dAcc, dSec, now } = top.t;
  if (dAcc !== null && dAcc >= 5) return `${name}の正答率、前より${dAcc}ポイント上がってるじゃねえか。手が覚えてきた証拠だ`;
  if (dSec !== null && dSec <= -1) return `${name}、前より${Math.abs(dSec).toFixed(1)}秒速くなってる。迷いが減ってきたな`;
  if (dAcc !== null && dAcc <= -5) return `${name}、ちょっと崩れてるな。焦らず、苦手のタブを見てから稽古に寄ってみな`;
  if (now.acc !== null && now.acc >= 0.95) return `${name}は${Math.round(now.acc * 100)}%か。もう体が覚えてる。次は速さだな`;
  const t = examTarget(nextRank(v.rank) ?? RANKS[RANKS.length - 1], v.rec);
  if (t.verdict === 'ready' && nextRank(v.rank)) return `今の腕なら${t.rank.name}は受かるぜ。メニューの「昇段試験」から行ってきな`;
  return '数字は嘘をつかねえ。毎日ちょっとずつでいい、続けたやつが上手くなるんだ';
}

function skillHtml(v: RecordView): string {
  const td = today(v.rec, v.day);
  const keiko = v.keiko && v.keiko.n ? `<div class="rec-now"><span>今回の稽古</span><b>${Math.round((v.keiko.c / v.keiko.n) * 100)}%</b><small>${v.keiko.c}/${v.keiko.n}問</small></div>` : '';
  return `<div class="rec-say"><div class="rs-face">${charaSvg('grin')}</div><p>${recordComment(v)}</p></div>
    ${keiko}
    <div class="rec-cards">${MODES.map((m) => modeCard(v, m)).join('')}</div>
    ${targetHtml(v)}
    <div class="rec-foot muted small">今日 ${td.n}問・正解 ${td.c}　／　最大連続正解 ${v.rec.bestStreak}　／　記録は ${md(v.rec.since)} から</div>`;
}

// ------------------------------------------------------------ 推移

function chart(ps: DayPoint[], val: (p: DayPoint) => number | null, o: { min: number; max: number; unit: string; flags: Map<string, string>; fmt: (v: number) => string }): string {
  const w = 320;
  const h = 130;
  const l = 30;
  const r = 8;
  const top = 10;
  const bottom = 20;
  const x = (i: number) => (ps.length === 1 ? (l + w - r) / 2 : l + (i / (ps.length - 1)) * (w - l - r));
  const y = (v: number) => top + (1 - (v - o.min) / (o.max - o.min || 1)) * (h - top - bottom);
  const pts = ps.map((p, i) => ({ p, i, v: val(p) })).filter((q): q is { p: DayPoint; i: number; v: number } => q.v !== null);
  const grid = [o.min, (o.min + o.max) / 2, o.max]
    .map((g) => `<line x1="${l}" x2="${w - r}" y1="${y(g).toFixed(1)}" y2="${y(g).toFixed(1)}" class="grid"/><text x="${l - 4}" y="${(y(g) + 3).toFixed(1)}" class="ax" text-anchor="end">${o.fmt(g)}</text>`)
    .join('');
  const flags = ps
    .map((p, i) => (o.flags.has(p.d) ? `<g class="flag"><line x1="${x(i).toFixed(1)}" x2="${x(i).toFixed(1)}" y1="${top}" y2="${h - bottom}"/><text x="${x(i).toFixed(1)}" y="${top - 1}" text-anchor="middle">${o.flags.get(p.d)}</text></g>` : ''))
    .join('');
  const line = pts.length > 1 ? `<polyline points="${pts.map((q) => `${x(q.i).toFixed(1)},${y(q.v).toFixed(1)}`).join(' ')}" class="line"/>` : '';
  const dots = pts
    .map((q) => `<circle cx="${x(q.i).toFixed(1)}" cy="${y(q.v).toFixed(1)}" r="${(2 + Math.min(3, Math.sqrt(q.p.n) / 3)).toFixed(1)}" class="dot${q.p.n < 5 ? ' thin' : ''}"><title>${md(q.p.d)} ${o.fmt(q.v)}${o.unit}（${q.p.n}問）</title></circle>`)
    .join('');
  const labels = [0, ps.length - 1]
    .filter((i, k, a) => ps[i] && a.indexOf(i) === k)
    .map((i) => `<text x="${x(i).toFixed(1)}" y="${h - 5}" class="ax" text-anchor="${i === 0 && ps.length > 1 ? 'start' : 'end'}">${md(ps[i].d)}</text>`)
    .join('');
  return `<svg class="rec-chart" viewBox="0 0 ${w} ${h}" role="img">${grid}${flags}${line}${dots}${labels}</svg>`;
}

function trendHtml(v: RecordView): string {
  const chips = MODES.map((m) => `<button class="cfg${v.mode === m ? ' on' : ''}" type="button" data-rec-mode="${m}">${MODE_NAMES[m]}</button>`).join('');
  const ps = dailySeries(v.rec, v.mode, 30);
  // 受かった日に段位の旗を立てる
  const flags = new Map<string, string>();
  for (const e of v.rec.exams) if (e.pass) flags.set(e.d, RANKS[e.rank - 1]?.name ?? '');
  let charts: string;
  if (!ps.length) charts = `<p class="muted rec-empty">${MODE_NAMES[v.mode]}の記録はまだありません。遊んだ日ごとに、ここへ点が増えていきます</p>`;
  else {
    const accs = ps.map((p) => p.acc);
    const min = Math.max(0, Math.min(0.5, Math.floor(Math.min(...accs) * 10) / 10));
    const avgs = ps.map((p) => p.avg).filter((a): a is number => a !== null);
    const maxSec = Math.max(10, Math.ceil(Math.max(0, ...avgs) / 5) * 5);
    charts = `<div class="rec-charts"><div class="rec-sec"><div class="ex-h">正答率 <span class="muted">遊んだ日ごと（点の大きさは問題数）</span></div>
        ${chart(ps, (p) => p.acc, { min, max: 1, unit: '%', flags, fmt: (x) => `${Math.round(x * 100)}` })}</div>
      ${avgs.length ? `<div class="rec-sec"><div class="ex-h">平均の速さ <span class="muted">秒・下ほど速い</span></div>
        ${chart(ps, (p) => p.avg, { min: 0, max: maxSec, unit: '秒', flags, fmt: (x) => x.toFixed(0) })}</div>` : ''}</div>`;
  }
  const exams = v.rec.exams
    .slice()
    .reverse()
    .slice(0, 8)
    .map((e) => `<li class="${e.pass ? 'pass' : 'fail'}"><span>${md(e.d)}</span><b>${RANKS[e.rank - 1]?.name ?? ''}</b><span>${e.correct}/10・${e.avg.toFixed(1)}秒</span><em>${e.pass ? '合格' : '不合格'}</em></li>`)
    .join('');
  return `<div class="cfg-group rec-modes">${chips}</div>
    ${charts}
    <div class="rec-sec"><div class="ex-h">昇段試験の記録</div>${exams ? `<ul class="rec-exams">${exams}</ul>` : '<p class="muted small">まだ受けていません</p>'}</div>`;
}

// ------------------------------------------------------------ 苦手

const bar = (label: string, c: number, n: number) =>
  `<div class="cat"><span>${label}</span><span class="bar"><i style="width:${n ? Math.round((c / n) * 100) : 0}%"></i></span><span>${n ? `${Math.round((c / n) * 100)}%` : '—'}</span></div>`;

function weakHtml(v: RecordView): string {
  const sits = bySituation(v.rec);
  const worst = sits.filter((s) => s.n >= 5).sort((a, b) => a.c / a.n - b.c / b.n)[0];
  const hy = missedHayami(v.rec)
    .map((e) => `<li><b>${e.han}翻${e.fu ? `${e.fu}符` : '（満貫以上）'}</b><span>${e.miss}回ミス / ${e.n}問</span></li>`)
    .join('');
  const els = v.elements.filter((e) => e.n > 0);
  const weakEl = els.filter((e) => e.n >= 5).sort((a, b) => a.c / a.n - b.c / b.n)[0];
  return `<div class="rec-sec"><div class="ex-h">状況別 <span class="muted">直近200問${worst && worst.c < worst.n ? `・苦手：<b>${worst.label}</b>` : ''}</span></div>
      ${sits.map((s) => bar(s.label, s.c, s.n)).join('')}</div>
    <div class="rec-sec"><div class="ex-h">符の要素別 <span class="muted">稽古と手牌の問題の累計${weakEl && weakEl.c < weakEl.n ? `・苦手：<b>${weakEl.name}</b>` : ''}</span></div>
      ${els.length ? els.map((e) => bar(e.name, e.c, e.n)).join('') : '<p class="muted small">符計算・実戦を解くと、どこでつまずいたかが分かります</p>'}
      <button class="rec-drill" type="button" data-rec-drill ${v.weakReady ? '' : 'disabled'}>稽古の「苦手」で解き直す</button>
      ${v.weakReady ? '' : '<small class="muted">要素ごとに数問ずつ解くと、苦手を選んで出せるようになります</small>'}</div>
    <div class="rec-sec"><div class="ex-h">早見でよく間違える点数</div>
      ${hy ? `<ul class="rec-miss">${hy}</ul>` : '<p class="muted small">まだ間違えた早見の問題はありません</p>'}</div>`;
}

// ------------------------------------------------------------ 台

function machineHtml(v: RecordView): string {
  const m = v.machine;
  const stat = (label: string, value: string, cls = '') => `<div class="stat ${cls}"><div class="label">${label}</div><div class="value">${value}</div></div>`;
  const log = m.log.length
    ? `<div class="sum-log"><span class="ex-h">大当り履歴</span>${m.log
        .map((h) => `<span class="hit${h.kakuhen ? ' k' : ''}${h.premium ? ' p' : ''}" title="${h.at}回転で${h.kakuhen ? '確変' : '通常'}大当り">${h.at}</span>`)
        .join('')}</div>`
    : '';
  return `<div class="stats rec-stats">
      ${stat('所持金', `${m.balance.toLocaleString()}<small>yan</small>`)}
      ${stat('本日の収支', `${signed(m.dayNet)}<small>yan</small>`, m.dayNet >= 0 ? 'plus' : 'minus')}
      ${stat('大当り', `${m.hits}<small>回</small>`)}
      ${stat('最大RUSH', `${m.maxChain}<small>連</small>`)}
    </div>
    <div class="rec-sec"><div class="ex-h">所持金の推移 <span class="muted">点線が初めの所持金</span></div><div class="sum-slump"></div></div>
    ${log}
    <div class="rec-foot muted small">台：${m.name}（大当り・RUSH は今回この台を打ち始めてから）　／　破産 ${m.bankrupts}回</div>`;
}
