import type { Question, Rng } from './generator';
import type { Rules } from './rules';
import { calcScore, formatAnswer, isValidHanFu } from './score';

export interface Choice {
  label: string;
  correct: boolean;
}

const FU_LIST = [20, 25, 30, 40, 50, 60, 70, 80, 90, 100, 110];
const LIMIT_TIER = (han: number) => (han >= 13 ? 4 : han >= 11 ? 3 : han >= 8 ? 2 : han >= 6 ? 1 : 0);

interface Candidate {
  label: string;
  dist: number;
}

function pickNearest(correct: string, cands: Candidate[], rng: Rng): string[] {
  // 近い候補を優先しつつ、同程度の距離はランダムに並べる
  const sorted = cands
    .filter((c) => c.label !== correct)
    .map((c) => ({ ...c, key: c.dist + rng() * 1.2 }))
    .sort((a, b) => a.key - b.key);
  const out: string[] = [];
  for (const c of sorted) {
    if (!out.includes(c.label)) out.push(c.label);
    if (out.length === 3) break;
  }
  return out;
}

function pointCandidates(
  han0: number,
  fu0: number,
  yakuman0: number,
  dealer: boolean,
  tsumo: boolean,
  rules: Rules,
  fuFocus = false,
): Candidate[] {
  const out: Candidate[] = [];
  const limit0 = yakuman0 > 0 || han0 >= 5;
  for (let han = 1; han <= 13; han++) {
    for (const fu of han >= 5 ? [30] : FU_LIST) {
      // 正解が50符以下なら、実戦でまず出ない70符以上は誤答にしない
      if (fu0 && fu0 <= 50 && fu >= 70) continue;
      if (!isValidHanFu(han, fu, tsumo)) continue;
      const label = formatAnswer(calcScore(han, fu, dealer, tsumo, rules));
      let dist: number;
      if (yakuman0 > 0) dist = 13 - Math.min(han, 13) + 1;
      else if (limit0 && han >= 5) dist = Math.abs(LIMIT_TIER(han) - LIMIT_TIER(han0));
      else dist = Math.abs(han - han0) + Math.abs(fu - (fu0 || 30)) / 10;
      // 符を試す出題：翻違いは候補が足りないときの埋め草にする
      if (fuFocus && !limit0 && han !== han0) dist += 10;
      out.push({ label, dist });
    }
  }
  for (const y of [1, 2]) {
    const dist = yakuman0 > 0 ? Math.abs(y - yakuman0) : 13 - Math.min(han0, 12) + y;
    out.push({ label: formatAnswer(calcScore(13, 0, dealer, tsumo, rules, y)), dist });
  }
  return out;
}

function shuffle<T>(arr: T[], rng: Rng): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * 正解1つと紛らわしい誤答3つの4択を作る。
 * fuFocus（BONUS・RUSH）では、4翻以下の手の誤答を「同じ翻で符だけ違う点数」にして、符が分からないと当てられないようにする
 */
export function makeChoices(q: Question, rules: Rules, rng: Rng = Math.random, fuFocus = false): Choice[] {
  let correct: string;
  let cands: Candidate[];
  if (q.mode === 'fu') {
    const fu0 = q.ev.fu.fu;
    correct = `${fu0}符`;
    cands = FU_LIST.filter((f) => fu0 > 50 || f < 70).map((f) => ({ label: `${f}符`, dist: Math.abs(f - fu0) / 10 }));
  } else if (q.mode === 'hayami') {
    correct = formatAnswer(q.score);
    cands = pointCandidates(q.han, q.fu, 0, q.dealer, q.tsumo, rules, fuFocus);
  } else {
    const s = q.ev.score;
    correct = formatAnswer(s);
    cands = pointCandidates(q.ev.han, q.ev.fu.fu, q.ev.yakuman, s.dealer, s.tsumo, rules, fuFocus);
  }
  const wrong = pickNearest(correct, cands, rng);
  return shuffle(
    [{ label: correct, correct: true }, ...wrong.map((label) => ({ label, correct: false }))],
    rng,
  );
}
