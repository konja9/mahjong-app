import { WAIT_NAMES, type WaitType } from '../core/decompose';
import { type FuStep, stepCorrect, stepLabel } from '../core/steps';

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export interface StepResult {
  step: FuStep;
  value: number | string;
  ok: boolean;
}

/**
 * 段階回答の進行。間違えた段階はその場で正解と理由を見せ、正しい値で次へ進む
 * （後の段階が巻き添えで外れないように、各段階は正解の値を前提に問う）
 */
export class StepRun {
  readonly results: StepResult[] = [];

  constructor(readonly steps: FuStep[]) {}

  get current(): FuStep | undefined {
    return this.steps[this.results.length];
  }

  /** 表示中の段階（すべて答えたら最後の段階） */
  get shown(): FuStep {
    return this.current ?? this.steps[this.steps.length - 1];
  }

  get done(): boolean {
    return this.results.length >= this.steps.length;
  }

  get allCorrect(): boolean {
    return this.done && this.results.every((r) => r.ok);
  }

  get okCount(): number {
    return this.results.filter((r) => r.ok).length;
  }

  answer(value: number | string): boolean {
    const step = this.current;
    if (!step) return false;
    const ok = stepCorrect(step, value);
    this.results.push({ step, value, ok });
    return ok;
  }

  /** 段階の一覧：答えた段階は ✓／✕ と理由、今の段階は問いかけを強調する */
  html(): string {
    const n = this.steps.length;
    const items = this.steps.map((step, i) => {
      const r = this.results[i];
      const num = `<span class="st-n">${i + 1}</span>`;
      if (!r) {
        const cls = i === this.results.length ? 'now' : 'todo';
        return `<li class="${cls}">${num}<span class="st-q">${esc(step.prompt)}</span></li>`;
      }
      const ans = stepLabel(step, step.answer);
      const yours = r.ok
        ? `<b class="st-ans">${esc(ans)}</b>`
        : `<span class="st-yours">${esc(stepLabel(step, r.value))}</span><span class="st-arrow">→</span><b class="st-ans">${esc(ans)}</b>`;
      const alt =
        !r.ok && step.altAnswers?.includes(r.value)
          ? `<small class="st-note">${esc(WAIT_NAMES[r.value as WaitType])}も別の分け方なら成り立ちますが、点数が高くなる分け方を採ります（高点法）</small>`
          : '';
      return `<li class="${r.ok ? 'ok' : 'ng'}">${num}<span class="st-q">${esc(step.prompt)}</span><span class="st-a">${r.ok ? '✓' : '✕'} ${yours}</span><small class="st-note">${esc(step.note)}</small>${alt}</li>`;
    });
    const head = this.done
      ? `<div class="st-head">段階回答 <b>${this.okCount}/${n}</b> 正解</div>`
      : `<div class="st-head">段階回答 ${this.results.length + 1}/${n}</div>`;
    return `${head}<ol class="steps">${items.join('')}</ol>`;
  }
}
