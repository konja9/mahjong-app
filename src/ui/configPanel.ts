import type { Settings } from './settings';

/**
 * 出題設定のパネル（PC・スマホ共通）。見出しつきの区分に分け、
 * 使えない選択肢は消さずに押せない形で出して、理由を行の下に添える
 */

export interface ConfigView {
  s: Settings;
  keiko: boolean;
  /** 稽古の復習に残っている手の数（上部の出題タブに出す） */
  reviewCount: number;
}

interface Opt {
  v: string;
  label: string;
  on: boolean;
  disabled?: boolean;
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

function row(name: string, label: string, opts: Opt[], note = '', cols = opts.length): string {
  const buttons = opts
    .map(
      (o) =>
        `<button type="button" class="cfg${o.on ? ' on' : ''}" data-cfg="${name}" data-v="${o.v}" aria-pressed="${o.on}"${o.disabled ? ' disabled aria-disabled="true"' : ''}>${esc(o.label)}</button>`,
    )
    .join('');
  return `<div class="cfg-row" data-group="${name}">
    <div class="cfg-label" id="cfg-l-${name}">${label}</div>
    <div class="cfg-opts" role="group" aria-labelledby="cfg-l-${name}" style="--cols:${cols}">${buttons}</div>
    ${note ? `<p class="cfg-note">${note}</p>` : ''}
  </div>`;
}

const section = (title: string, rows: string[]) =>
  rows.length ? `<section class="cfg-sec"><h3>${title}</h3>${rows.join('')}</section>` : '';

/** 回答方式の表示名（パチンコの符計算は固定ボタンなので「選択」、早見・実戦は「4択」） */
export function answerLabel(v: ConfigView): string {
  const { s } = v;
  if (s.answerStyle === 'input') return '入力';
  return !v.keiko && s.mode !== 'fu' ? '4択' : '選択';
}

export function configPanelHtml(v: ConfigView): string {
  const { s, keiko } = v;
  const choiceLabel = !keiko && s.mode !== 'fu' ? '4択' : '選択';
  const answer = [
    row(
      'answer',
      '回答',
      [
        { v: 'choice', label: choiceLabel, on: s.answerStyle !== 'input' },
        { v: 'input', label: '入力', on: s.answerStyle === 'input' },
      ],
      keiko ? '入力：符・翻・点数を数字で打つ（待ちの形だけは選ぶ）' : '',
    ),
  ];

  const count = keiko ? [row('count', '問題数', [10, 25, 50, 0].map((n) => ({ v: String(n), label: n ? `${n}問` : '無制限', on: s.count === n })))] : [];

  const call = s.keikoFilters.call;
  const filter = keiko
    ? [
        row('call', '鳴き', [
          { v: 'any', label: 'すべて', on: call === 'any' },
          { v: 'menzen', label: '門前', on: call === 'menzen' },
          { v: 'open', label: '副露', on: call === 'open' },
        ]),
      ]
    : [];

  const situation = [
    row('seat', '親子', [
      { v: 'any', label: '両方', on: s.filters.seat === 'any' },
      { v: 'child', label: '子', on: s.filters.seat === 'child' },
      { v: 'dealer', label: '親', on: s.filters.seat === 'dealer' },
    ]),
    row('win', '和了', [
      { v: 'any', label: '両方', on: s.filters.win === 'any' },
      { v: 'ron', label: 'ロン', on: s.filters.win === 'ron' },
      { v: 'tsumo', label: 'ツモ', on: s.filters.win === 'tsumo' },
    ]),
  ];

  const lead = keiko ? '<p class="cfg-lead">変更するとすぐに反映され、1問目からになります</p>' : '';
  const foot = keiko
    ? '<button class="cfg-done sub" type="button" data-restart>最初からやり直す</button>'
    : '<button class="cfg-done sub" type="button" data-summary>成績を見る<small>ここまでの正答率・収支・大当り履歴を見て区切る。所持金と台はそのまま</small></button>';

  return `<div class="cfg-head"><b>出題設定</b><button class="cfg-x" type="button" data-close-cfg aria-label="閉じる">×</button></div>
  <div class="cfg-body">
    ${lead}
    ${section('答え方', answer)}
    ${section('出題', [...count, ...filter])}
    ${section('状況', situation)}
  </div>
  <div class="cfg-foot">${foot}<button class="cfg-done main" type="button" data-close-cfg>閉じる</button></div>`;
}

/** 上部の要約ボタンの中身（例 選択 · 門前 · 25問） */
export function configSummaryHtml(v: ConfigView): string {
  const { s, keiko } = v;
  const sep = '<span class="dot-sep">·</span>';
  const parts = [`<span class="pill-answer">${answerLabel(v)}${sep}</span>`];
  if (keiko && s.keikoFilters.call !== 'any') parts.push(`<span class="pill-shape">${s.keikoFilters.call === 'menzen' ? '門前' : '副露'}${sep}</span>`);
  if (keiko) parts.push(s.count ? `${s.count}問` : '無制限');
  // 狭いスマホでは回答方式を畳むので、パチンコは「出題設定」とだけ出す
  else parts.push('<span class="pill-wide">出題設定</span><span class="pill-narrow">出題設定</span>');
  return `${parts.join('')}<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>`;
}

/**
 * 稽古の上部の切り替え（種目タブの代わり）。1段目は学習モード、2段目は出題（通常・苦手・復習）
 */
export function keikoTabsHtml(v: ConfigView): string {
  const { s } = v;
  const tab = (attr: string, val: string, label: string, on: boolean, disabled = false) =>
    `<button class="mode-tab${on ? ' on' : ''}" role="tab" aria-selected="${on}" data-${attr}="${val}"${disabled ? ' disabled aria-disabled="true"' : ''}>${label}</button>`;
  const study = [tab('study', 'focus', '重点学習', s.keikoStudy === 'focus'), tab('study', 'quick', '簡易学習', s.keikoStudy === 'quick')].join('');
  const source = [
    tab('source', 'normal', '通常', s.keikoSource === 'normal'),
    tab('source', 'weak', '苦手', s.keikoSource === 'weak'),
    tab('source', 'review', `復習（${v.reviewCount}）`, s.keikoSource === 'review', !v.reviewCount && s.keikoSource !== 'review'),
  ].join('');
  return `<div class="tab-row study-tabs" role="tablist" aria-label="学習モード">${study}</div>
    <div class="tab-row source-tabs" role="tablist" aria-label="出題">${source}</div>`;
}
