import { SHAPE_NAMES, type ShapeFilter, shapeCall } from '../core/generator';
import type { Settings } from './settings';

/**
 * 出題設定のパネル（PC・スマホ共通）。見出しつきの区分に分け、
 * 使えない選択肢は消さずに押せない形で出して、理由を行の下に添える
 */

export interface ConfigView {
  s: Settings;
  keiko: boolean;
  /** 稽古の復習に残っている、いまの種目の手の数 */
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

/** 回答方式の表示名（符計算は固定ボタンなので「選択」、ほかは「4択」） */
export function answerLabel(v: ConfigView): string {
  const { s } = v;
  if (s.answerStyle === 'input') return '入力';
  if (s.answerStyle === 'steps' && v.keiko && s.mode === 'fu') return '段階';
  return s.mode === 'fu' ? '選択' : '4択';
}

export function configPanelHtml(v: ConfigView): string {
  const { s, keiko } = v;
  const hand = s.mode !== 'hayami';
  const stepsOk = keiko && s.mode === 'fu';
  const choiceOn = s.answerStyle === 'choice' || (s.answerStyle === 'steps' && !stepsOk);

  const answer = [
    row(
      'answer',
      '回答',
      [
        { v: 'choice', label: s.mode === 'fu' ? '選択' : '4択', on: choiceOn },
        { v: 'input', label: '入力', on: s.answerStyle === 'input' },
        ...(keiko ? [{ v: 'steps', label: '段階', on: s.answerStyle === 'steps' && stepsOk, disabled: !stepsOk }] : []),
      ],
      keiko ? (stepsOk ? '段階：待ち → 面子 → 雀頭 → 加符 → 合計 → 切り上げ の順に答える' : '段階は符計算だけ') : '',
    ),
  ];

  const source = keiko
    ? [
        row(
          'source',
          '出題',
          [
            { v: 'normal', label: '通常', on: s.keikoSource === 'normal' },
            { v: 'review', label: `復習（${v.reviewCount}問）`, on: s.keikoSource === 'review', disabled: !v.reviewCount && s.keikoSource !== 'review' },
            { v: 'weak', label: '苦手', on: s.keikoSource === 'weak', disabled: !hand },
          ],
          hand ? '復習：間違えた手を解き直す／苦手：正答率の低い要素が出てくる手を多めに出す' : '苦手は符計算・実戦だけ',
        ),
        row('count', '問題数', [10, 25, 50, 0].map((n) => ({ v: String(n), label: n ? `${n}問` : '無制限', on: s.count === n }))),
      ]
    : [];

  const kf = s.keikoFilters;
  const forced = shapeCall(kf.shape);
  const call = forced ?? kf.call;
  const filter =
    keiko && hand
      ? [
          row(
            'call',
            '鳴き',
            [
              { v: 'any', label: 'すべて', on: call === 'any' },
              { v: 'menzen', label: '門前', on: call === 'menzen' },
              { v: 'open', label: '副露', on: call === 'open' },
            ].map((o) => ({ ...o, disabled: !!forced && o.v !== forced })),
            forced ? `${SHAPE_NAMES[kf.shape]}は${forced === 'menzen' ? '門前' : '副露'}の手だけ` : '',
          ),
          row(
            'shape',
            '形',
            (Object.keys(SHAPE_NAMES) as ShapeFilter[]).map((k) => ({ v: k, label: SHAPE_NAMES[k], on: kf.shape === k })),
            '',
            4,
          ),
          row(
            'dist',
            '符の分布',
            [
              { v: 'real', label: '実戦寄り', on: kf.dist === 'real' },
              { v: 'even', label: '均等', on: kf.dist === 'even' },
            ],
            kf.dist === 'even' ? '20〜60符を同じ数ずつ出す' : '30符・40符が中心（実戦に近い）',
          ),
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
    ${section('答え方', answer.filter(Boolean))}
    ${section('出題', source)}
    ${section('絞り込み', filter)}
    ${section('状況', situation)}
  </div>
  <div class="cfg-foot">${foot}<button class="cfg-done main" type="button" data-close-cfg>閉じる</button></div>`;
}

/** 上部の要約ボタンの中身（例 選択 · 平和 · 25問） */
export function configSummaryHtml(v: ConfigView): string {
  const { s, keiko } = v;
  const sep = '<span class="dot-sep">·</span>';
  const parts = [`<span class="pill-answer">${answerLabel(v)}${sep}</span>`];
  if (keiko && s.mode !== 'hayami' && s.keikoFilters.shape !== 'any') parts.push(`<span class="pill-shape">${SHAPE_NAMES[s.keikoFilters.shape]}${sep}</span>`);
  if (keiko && s.keikoSource !== 'normal') parts.push(`<span class="pill-shape">${s.keikoSource === 'review' ? '復習' : '苦手'}${sep}</span>`);
  if (keiko) parts.push(s.count ? `${s.count}問` : '無制限');
  // 狭いスマホでは回答方式を畳むので、パチンコは「出題設定」とだけ出す
  else parts.push('<span class="pill-wide">出題設定</span><span class="pill-narrow">出題設定</span>');
  return `${parts.join('')}<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>`;
}
