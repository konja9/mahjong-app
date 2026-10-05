import { FU_BUTTONS, makeChoices } from './choices';
import { WAIT_NAMES, type WaitType } from './decompose';
import type { FuElement } from './diagnose';
import { evaluateAll } from './evaluate';
import { tripletKind } from './fu';
import type { HandQuestion, Rng } from './generator';
import type { Rules } from './rules';
import { type ScoreResult, checkPointsAnswer, formatAnswer } from './score';
import { tileName } from './tiles';

/**
 * 稽古の段階練習。手牌1つを、決まった順番の段階に分けて答える。
 * - 重点学習：基本符・アガり方 → 面子（刻子・槓子ごと）→ 雀頭 → 待ち → 符を確定 → 翻 → 点数
 * - 簡易学習：符を確定 → 翻 → 点数
 * 正解は点数エンジンの結果（FuResult.rows・役・点数）から作るので、解説・正解とずれない
 */
export type Study = 'focus' | 'quick';

export interface StepOption {
  label: string;
  value: number | string;
}

export interface Step {
  element: FuElement;
  /** 問いかけ（例 雀頭は何符？） */
  prompt: string;
  /** 選択のときの選択肢 */
  options: StepOption[];
  /** 選択のときの正解（options の value） */
  answer: number | string;
  /**
   * 数値入力のときの答え方。number：数値（answerNum と比べる）／points：点数（子のツモは「子-親」）／
   * choice：入力モードでも選択（待ちの形）
   */
  input: 'number' | 'points' | 'choice';
  /** 数値入力のときの正解（翻は選択肢の区分ではなく翻数そのもの） */
  answerNum?: number;
  /** 点数の段階：点数の照合に使う */
  score?: ScoreResult;
  /** 正解の理由（答えたあとに出す） */
  note: string;
  /** 面子の段階：光らせる面子の groups での位置。雀頭は -1 */
  block?: number;
  /** 符の積み上げの帯に出すラベルと符（基本符・面子・雀頭・待ち） */
  tally?: { label: string; fu: number };
  /** 答えずに表示だけする段階（刻子・槓子がない手の面子） */
  auto?: boolean;
  /** 待ち：別の分け方なら成り立つ待ち（選んだら高点法の説明を添える） */
  altAnswers?: (number | string)[];
}

const WAITS: WaitType[] = ['ryanmen', 'kanchan', 'penchan', 'shanpon', 'tanki'];

const HAN_OPTIONS: StepOption[] = [
  { label: '1翻', value: 1 },
  { label: '2翻', value: 2 },
  { label: '3翻', value: 3 },
  { label: '4翻', value: 4 },
  { label: '満貫（5翻）', value: 5 },
  { label: '跳満（6・7翻）', value: 6 },
  { label: '倍満以上（8翻〜）', value: 8 },
];
/** 翻の選択肢の区分（5翻以上は満貫・跳満・倍満以上にまとめる） */
export const hanBucket = (han: number): number => (han <= 5 ? han : han <= 7 ? 6 : 8);

const fuOptions = (vals: readonly number[]) => vals.map((v) => ({ label: `${v}符`, value: v }));

function fuStep(q: HandQuestion, study: Study): Step {
  const { ev } = q;
  const fu = ev.fu;
  const kui = fu.rows.some((r) => r.label.startsWith('喰い平和'));
  const pinfuTsumo = fu.items.length === 1 && fu.items[0].label === '平和ツモ';
  let note: string;
  if (ev.interp.form === 'chiitoi') note = '七対子は25符で固定（副底や加符を数えず、切り上げもしない）';
  else if (pinfuTsumo) note = '平和ツモは20符（ツモ符を付けない）';
  else if (kui) note = '鳴いて合計20符のロンは30符にする（喰い平和形）';
  else note = fu.raw === fu.fu ? `合計 ${fu.raw}符（端数なし）` : `合計 ${fu.raw}符 → 10符単位に切り上げて ${fu.fu}符`;
  return {
    element: 'fu',
    prompt: study === 'focus' && ev.interp.form === 'standard' ? '合計して切り上げると何符？' : 'この手は何符？',
    options: fuOptions(FU_BUTTONS),
    answer: fu.fu,
    input: 'number',
    answerNum: fu.fu,
    note,
  };
}

function hanStep(q: HandQuestion): Step {
  const { ev } = q;
  const list = [...ev.yaku, ...ev.dora].map((y) => `${y.name} ${y.han}`).join('・');
  return {
    element: 'han',
    prompt: '何翻？（役とドラを数える）',
    options: HAN_OPTIONS,
    answer: hanBucket(ev.han),
    input: 'number',
    answerNum: ev.han,
    note: `${list} → ${ev.han}翻${ev.score.limit ? `（${ev.score.limit}）` : ''}`,
  };
}

function scoreStep(q: HandQuestion, rules: Rules, rng: Rng): Step {
  const { ev } = q;
  const s = ev.score;
  const options = makeChoices(q, rules, rng).map((c) => ({ label: c.label, value: c.label }));
  const who = `${s.dealer ? '親' : '子'}の${s.tsumo ? 'ツモ' : 'ロン'}`;
  return {
    element: 'score',
    prompt: `点数は？（${who}）`,
    options,
    answer: formatAnswer(s),
    input: 'points',
    score: s,
    note: `${s.limit ? s.limit : `${ev.han}翻${ev.fu.fu}符`}・${who} → ${formatAnswer(s)}`,
  };
}

/** 重点学習の符の段階（基本符・面子・雀頭・待ち）。七対子は無し */
function fuParts(q: HandQuestion, rules: Rules): Step[] {
  const { ev } = q;
  const it = ev.interp;
  if (it.form !== 'standard') return [];
  const rows = ev.fu.rows;
  const row = (label: string) => rows.find((r) => r.label === label);
  const ron = row('門前ロン')!;
  const tsumo = row('ツモ')!;
  const baseFu = ron.fu + tsumo.fu;
  const baseNote = ron.fu ? '門前でロン → +10' : tsumo.fu ? 'ツモ → +2' : (q.sit.tsumo ? tsumo.note : ron.note) ?? '';
  const steps: Step[] = [
    {
      element: 'base',
      prompt: '副底20符に、アガり方で何符足す？',
      options: [
        { label: '+0', value: 0 },
        { label: '+2 ツモ', value: 2 },
        { label: '+10 門前ロン', value: 10 },
      ],
      answer: baseFu,
      input: 'number',
      answerNum: baseFu,
      note: `副底20符。${baseNote}`,
      tally: { label: 'アガり方', fu: baseFu },
    },
  ];

  // 面子：刻子・槓子ごとに1問（順子は0符なので聞かない）
  const triplets = it.groups.map((g, i) => ({ g, i })).filter(({ g }) => g.kind !== 'shuntsu');
  if (!triplets.length) {
    steps.push({
      element: 'mentsu',
      prompt: '面子の符',
      options: [],
      answer: 0,
      input: 'number',
      note: '刻子・槓子がない（順子だけ）ので 0符',
      tally: { label: '面子', fu: 0 },
      auto: true,
    });
  }
  for (const { g, i } of triplets) {
    const r = rows.find((x) => x.group === i)!;
    const shape = g.kind === 'kantsu' ? '槓子' : '刻子';
    steps.push({
      element: 'mentsu',
      prompt: `光っている${tileName(g.tile)}の${shape}は何符？`,
      options: fuOptions([2, 4, 8, 16, 32]),
      answer: r.fu,
      input: 'number',
      answerNum: r.fu,
      note: `${tripletKind(g)}（${r.note ?? ''}）→ ${r.fu}符`,
      block: i,
      tally: { label: `${tileName(g.tile)}`, fu: r.fu },
    });
  }

  const pairRows = rows.filter((r) => r.group === -1);
  const pairFu = pairRows.reduce((s, r) => s + r.fu, 0);
  steps.push({
    element: 'pair',
    prompt: `雀頭（${tileName(it.pair)}）は何符？`,
    options: fuOptions([0, 2, 4]),
    answer: pairFu,
    input: 'number',
    answerNum: pairFu,
    note: pairRows.map((r) => `${r.label}${r.note ? `（${r.note}）` : ''}`).join('・') + ` → ${pairFu}符`,
    block: -1,
    tally: { label: '雀頭', fu: pairFu },
  });

  const waitRow = rows.find((r) => r.label === WAIT_NAMES[it.wait])!;
  const altWaits = [
    ...new Set(
      evaluateAll(q.hand, q.sit, rules)
        .slice(1)
        .flatMap((e) => (e.interp.form === 'standard' && e.interp.wait !== it.wait ? [e.interp.wait] : [])),
    ),
  ];
  steps.push({
    element: 'wait',
    prompt: '和了牌の待ちの形は？',
    options: WAITS.map((w) => ({ label: WAIT_NAMES[w].replace('待ち', ''), value: w })),
    answer: it.wait,
    input: 'choice',
    note: `${WAIT_NAMES[it.wait]} → ${waitRow.fu ? '+2符（嵌張・辺張・単騎）' : '0符（両面・双碰）'}`,
    tally: { label: '待ち', fu: waitRow.fu },
    altAnswers: altWaits,
  });
  return steps;
}

export function studySteps(q: HandQuestion, rules: Rules, study: Study, rng: Rng = Math.random): Step[] {
  const parts = study === 'focus' ? fuParts(q, rules) : [];
  return [...parts, fuStep(q, study), hanStep(q), scoreStep(q, rules, rng)];
}

/** 段階の答え合わせ。value は選択なら options の value、入力なら打った文字列 */
export function stepCorrect(step: Step, value: number | string, typed: boolean): boolean {
  if (!typed || step.input === 'choice') return value === step.answer;
  if (step.input === 'points') return checkPointsAnswer(String(value), step.score!);
  return Number(value) === step.answerNum;
}

/** 答えを表示用の文字にする */
export function stepLabel(step: Step, value: number | string, typed: boolean): string {
  if (typed && step.input !== 'choice') {
    if (step.input === 'points') return String(value);
    return `${value}${step.element === 'han' ? '翻' : '符'}`;
  }
  return step.options.find((o) => o.value === value)?.label ?? String(value);
}

/** 正解を表示用の文字にする（入力のときは翻数・符そのもの） */
export function stepAnswerLabel(step: Step, typed: boolean): string {
  if (typed && step.input === 'number') return `${step.answerNum}${step.element === 'han' ? '翻' : '符'}`;
  return step.options.find((o) => o.value === step.answer)?.label ?? String(step.answer);
}
