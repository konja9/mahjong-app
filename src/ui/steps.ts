import { WAIT_NAMES, type WaitType } from '../core/decompose';
import { ELEMENT_NAMES } from '../core/diagnose';
import { type Step, stepAnswerLabel, stepCorrect, stepLabel } from '../core/steps';

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export interface StepResult {
  step: Step;
  value: number | string;
  /** 数値で打った答えか（選択なら false） */
  typed: boolean;
  ok: boolean;
}

/** 段階練習の判定。全部正解／点数は合った（ほぼ正解）／過半数が正解（おしい）／不正解 */
export type StepVerdict = 'ok' | 'almost' | 'close' | 'ng';

export function stepVerdict(ok: number, total: number, scoreOk: boolean): StepVerdict {
  if (total > 0 && ok >= total) return 'ok';
  if (scoreOk) return 'almost';
  return ok * 2 > total ? 'close' : 'ng';
}

/**
 * 稽古の段階練習の進行。間違えた段階はその場で正解と理由を見せ、正しい値で次へ進む
 * （後の段階が巻き添えで外れないように、各段階は正解の値を前提に問う）。
 * 答えずに表示だけする段階（刻子・槓子がない手の面子）は自動で進める
 */
export class StepRun {
  readonly results: StepResult[] = [];

  constructor(readonly steps: Step[]) {
    this.skipAuto();
  }

  private skipAuto(): void {
    for (let s = this.current; s?.auto; s = this.current) this.results.push({ step: s, value: s.answer, typed: false, ok: true });
  }

  get current(): Step | undefined {
    return this.steps[this.results.length];
  }

  /** 表示中の段階（すべて答えたら最後の段階） */
  get shown(): Step {
    return this.current ?? this.steps[this.steps.length - 1];
  }

  get done(): boolean {
    return this.results.length >= this.steps.length;
  }

  /** 答えた段階（表示だけの段階を除く） */
  get answered(): StepResult[] {
    return this.results.filter((r) => !r.step.auto);
  }

  get allCorrect(): boolean {
    return this.done && this.answered.every((r) => r.ok);
  }

  get okCount(): number {
    return this.answered.filter((r) => r.ok).length;
  }

  get total(): number {
    return this.steps.filter((s) => !s.auto).length;
  }

  /** 判定（答え終わってから使う） */
  get verdict(): StepVerdict {
    const last = this.answered.at(-1);
    return stepVerdict(this.okCount, this.total, !!last && last.step.element === 'score' && last.ok);
  }

  answer(value: number | string, typed: boolean): boolean {
    const step = this.current;
    if (!step) return false;
    const ok = stepCorrect(step, value, typed);
    this.results.push({ step, value, typed, ok });
    this.skipAuto();
    return ok;
  }

  /** 符の積み上げの帯（重点学習）：副底20 ＋ 答え終わった基本符・面子・雀頭・待ち。符を確定したら結果も出す */
  private tallyHtml(): string {
    const parts = this.results.filter((r) => r.step.tally);
    if (!this.steps.some((s) => s.tally)) return '';
    const sum = 20 + parts.reduce((s, r) => s + r.step.tally!.fu, 0);
    const chips = parts.map((r) => `<span class="tl-chip${r.step.tally!.fu ? '' : ' zero'}"><small>${esc(r.step.tally!.label)}</small>+${r.step.tally!.fu}</span>`).join('');
    const fu = this.results.find((r) => r.step.element === 'fu');
    const result = fu ? `<span class="tl-eq">→ <b>${fu.step.answer}符</b></span>` : '';
    return `<div class="tally"><span class="tl-chip base"><small>副底</small>20</span>${chips}<span class="tl-eq">＝ ${sum}符</span>${result}</div>`;
  }

  /** 段階の一覧：答えた段階は ✓／✕ と理由、今の段階は問いかけを強調する */
  html(): string {
    let n = 0;
    const items = this.steps.map((step, i) => {
      const r = this.results[i];
      if (step.auto && !r) return `<li class="todo"><span class="st-n">–</span><span class="st-q">${esc(ELEMENT_NAMES[step.element])}</span></li>`;
      if (step.auto) return `<li class="auto"><span class="st-n">–</span><span class="st-q">${esc(ELEMENT_NAMES[step.element])}</span><small class="st-note">${esc(step.note)}</small></li>`;
      const num = `<span class="st-n">${++n}</span>`;
      if (!r) {
        const cls = i === this.results.length ? 'now' : 'todo';
        return `<li class="${cls}">${num}<span class="st-q">${esc(step.prompt)}</span></li>`;
      }
      const ans = stepAnswerLabel(step, r.typed);
      const yours = r.ok
        ? `<b class="st-ans">${esc(ans)}</b>`
        : `<span class="st-yours">${esc(stepLabel(step, r.value, r.typed))}</span><span class="st-arrow">→</span><b class="st-ans">${esc(ans)}</b>`;
      const alt =
        !r.ok && step.altAnswers?.includes(r.value)
          ? `<small class="st-note">${esc(WAIT_NAMES[r.value as WaitType])}も別の分け方なら成り立ちますが、点数が高くなる分け方を採ります（高点法）</small>`
          : '';
      return `<li class="${r.ok ? 'ok' : 'ng'}">${num}<span class="st-q">${esc(step.prompt)}</span><span class="st-a">${r.ok ? '✓' : '✕'} ${yours}</span><small class="st-note">${esc(step.note)}</small>${alt}</li>`;
    });
    const head = this.done
      ? `<div class="st-head">段階練習 <b>${this.okCount}/${this.total}</b> 正解</div>`
      : `<div class="st-head">段階練習 ${this.answered.length + 1}/${this.total}</div>`;
    return `${head}${this.tallyHtml()}<ol class="steps">${items.join('')}</ol>`;
  }
}
