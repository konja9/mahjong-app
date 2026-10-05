import { FU_BUTTONS } from './choices';
import { WAIT_NAMES, type WaitType } from './decompose';
import type { FuElement } from './diagnose';
import { evaluateAll } from './evaluate';
import type { HandQuestion } from './generator';
import type { Rules } from './rules';

/**
 * 段階的に答えるモード：待ち → 面子の符 → 雀頭 → 加符 → 合計 → 切り上げ の順に1つずつ答える。
 * 正解は点数エンジンの符の内訳（FuResult.rows）から作るので、解説・正解とずれない
 */
export interface FuStep {
  element: FuElement;
  /** 問いかけ（例 雀頭の符は？） */
  prompt: string;
  /** buttons：選択肢から選ぶ / number：数値を入力する */
  kind: 'buttons' | 'number';
  options: { label: string; value: number | string }[];
  answer: number | string;
  /** 正解の理由（答えたあとに出す） */
  note: string;
  /** 待ち：別の分け方なら成り立つ待ち（選んだら高点法の説明を添える） */
  altAnswers?: (number | string)[];
}

const WAITS: WaitType[] = ['ryanmen', 'kanchan', 'penchan', 'shanpon', 'tanki'];
const sum = (xs: { fu: number }[]) => xs.reduce((s, x) => s + x.fu, 0);
const detail = (rows: { label: string; fu: number; note?: string }[]) =>
  rows.map((r) => `${r.label} ${r.fu}符${r.note ? `（${r.note}）` : ''}`).join('・');

const fuButtons = () => FU_BUTTONS.map((f) => ({ label: `${f}符`, value: f as number }));

export function fuSteps(q: HandQuestion, rules: Rules): FuStep[] {
  const { ev } = q;
  const it = ev.interp;
  if (it.form === 'chiitoi') {
    return [
      {
        element: 'total',
        prompt: '七対子の符は？',
        kind: 'buttons',
        options: fuButtons(),
        answer: 25,
        note: '七対子は25符で固定（副底や加符を数えず、切り上げもしない）',
      },
    ];
  }
  if (it.form !== 'standard') return [];

  const rows = ev.fu.rows;
  const groupRows = rows.filter((r) => r.group !== undefined && r.group >= 0);
  const pairRows = rows.filter((r) => r.group === -1);
  const waitRow = rows.find((r) => Object.values(WAIT_NAMES).includes(r.label));
  const kafuRows = rows.filter((r) => r.label === '門前ロン' || r.label === 'ツモ' || r === waitRow);
  const kui = rows.find((r) => r.label.startsWith('喰い平和'));
  const waitFu = waitRow?.fu ?? 0;

  // 別の分け方で成り立つ待ち
  const altWaits = [
    ...new Set(
      evaluateAll(q.hand, q.sit, rules)
        .slice(1)
        .flatMap((e) => (e.interp.form === 'standard' && e.interp.wait !== it.wait ? [e.interp.wait] : [])),
    ),
  ];

  const pinfuTsumo = ev.fu.items.length === 1 && ev.fu.items[0].label === '平和ツモ';
  return [
    {
      element: 'wait',
      prompt: '和了牌の待ちの形は？',
      kind: 'buttons',
      options: WAITS.map((w) => ({ label: WAIT_NAMES[w].replace('待ち', ''), value: w })),
      answer: it.wait,
      note: `${WAIT_NAMES[it.wait]}（${waitFu ? '2符' : '0符'}）`,
      altAnswers: altWaits,
    },
    {
      element: 'mentsu',
      prompt: '面子の符の合計は？',
      kind: 'number',
      options: [],
      answer: sum(groupRows),
      note: detail(groupRows.filter((r) => r.fu > 0)) || 'すべて順子なので0符',
    },
    {
      element: 'pair',
      prompt: '雀頭の符は？',
      kind: 'buttons',
      options: [0, 2, 4].map((v) => ({ label: `${v}符`, value: v })),
      answer: sum(pairRows),
      note: detail(pairRows),
    },
    {
      element: 'kafu',
      prompt: '加符（門前ロン・ツモ・待ち）の合計は？',
      kind: 'number',
      options: [],
      answer: sum(kafuRows),
      note: detail(kafuRows),
    },
    {
      element: 'total',
      prompt: '副底20符を足した合計は？（切り上げ前）',
      kind: 'number',
      options: [],
      answer: ev.fu.raw,
      note: kui
        ? '鳴いて20符のロンは30符にする（喰い平和形）'
        : pinfuTsumo
          ? '平和ツモは20符（ツモ符を付けない）'
          : `20 + ${sum(groupRows)} + ${sum(pairRows)} + ${sum(kafuRows)} = ${ev.fu.raw}`,
    },
    {
      element: 'roundup',
      prompt: '切り上げると何符？',
      kind: 'buttons',
      options: fuButtons(),
      answer: ev.fu.fu,
      note: ev.fu.raw === ev.fu.fu ? `${ev.fu.fu}符（端数なし）` : `${ev.fu.raw} → 10符単位に切り上げて ${ev.fu.fu}符`,
    },
  ];
}

/** 段階の答えを照らし合わせる */
export const stepCorrect = (step: FuStep, value: number | string): boolean => value === step.answer;

/** 段階の値を表示用の文字にする（待ちは名前、それ以外は符） */
export function stepLabel(step: FuStep, value: number | string): string {
  const opt = step.options.find((o) => o.value === value);
  if (opt) return opt.label;
  return `${value}符`;
}
