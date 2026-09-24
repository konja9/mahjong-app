import { type HandQuestion, type Mode, type Question, generateQuestion } from '../core/generator';
import { type ScoreResult, checkPointsAnswer, formatAnswer } from '../core/score';
import { EAST } from '../core/tiles';
import { configureAudio, sfx, unlockAudio } from './audio';
import { Fx, LAMP_MULT, LAMP_NAMES, type WinTier } from './effects/pachinko';
import { doraLabel, handExplain, hayamiExplain, situationChips, situationLabel } from './explain';
import { type Settings, loadSettings, saveSettings } from './settings';
import { load, save } from './storage';
import { handHtml, tilesInline } from './tileView';

type Phase = 'answering' | 'suspense' | 'result' | 'summary';

interface Miss {
  q: Question;
  input: string;
}

interface Session {
  answered: number;
  correct: number;
  streak: number;
  maxStreak: number;
  times: number[];
  balls: number;
  kakuhen: boolean;
  byCat: Record<string, { c: number; n: number }>;
  misses: Miss[];
}

interface Best {
  acc: number;
  avg: number;
  streak: number;
}

const MODE_NAMES: Record<Mode, string> = { hayami: '早見', fu: '符計算', jissen: '実戦' };
const BASE_GAIN: Record<Mode, number> = { hayami: 100, fu: 150, jissen: 300 };
const BANK_KEY = 'tensu.bank.v1';
const BEST_KEY = 'tensu.best.v1';

const $ = <T extends HTMLElement = HTMLElement>(sel: string, root: ParentNode = document) =>
  root.querySelector(sel) as T;

function newSession(): Session {
  return { answered: 0, correct: 0, streak: 0, maxStreak: 0, times: [], balls: 0, kakuhen: false, byCat: {}, misses: [] };
}

function questionMeta(q: Question): { dealer: boolean; tsumo: boolean } {
  if (q.mode === 'hayami') return { dealer: q.dealer, tsumo: q.tsumo };
  return { dealer: q.sit.seatWind === EAST, tsumo: q.sit.tsumo };
}

function scoreOf(q: Question): ScoreResult {
  return q.mode === 'hayami' ? q.score : q.ev.score;
}

export class App {
  private s: Settings = loadSettings();
  private session = newSession();
  private phase: Phase = 'answering';
  private q!: Question;
  private input = '';
  private startedAt = 0;
  private lamp = 0;
  private lamps: number[] = [];
  private bank = load<number>(BANK_KEY, 0);
  private best = load<Record<string, Best>>(BEST_KEY, {});
  private fx: Fx;
  private timerRaf = 0;
  private autoNext = 0;
  private lastCorrect = false;

  constructor(private root: HTMLElement) {
    this.root.innerHTML = SHELL;
    this.fx = new Fx($('#overlay'), $<HTMLCanvasElement>('#fx'), document.body, () => this.s.effects);
    this.applyTheme();
    configureAudio(this.s.sound, this.s.volume);
    this.renderConfig();
    this.renderBank(false);
    this.bind();
    this.startSession();
  }

  // ------------------------------------------------------------ 設定

  private applyTheme(): void {
    document.documentElement.dataset.theme = this.s.theme;
    document.documentElement.dataset.effects = this.s.effects;
  }

  private update(patch: Partial<Settings>, restart = true): void {
    this.s = { ...this.s, ...patch };
    saveSettings(this.s);
    this.applyTheme();
    configureAudio(this.s.sound, this.s.volume);
    this.renderConfig();
    if (restart) this.startSession();
  }

  private renderConfig(): void {
    const s = this.s;
    const group = (name: string, items: [string, string, boolean][]) =>
      `<div class="cfg-group">${items
        .map(([v, label, on]) => `<button class="cfg${on ? ' on' : ''}" data-cfg="${name}" data-v="${v}">${label}</button>`)
        .join('')}</div>`;
    $('#config').innerHTML = [
      group(
        'mode',
        (['hayami', 'fu', 'jissen'] as Mode[]).map((m) => [m, MODE_NAMES[m], s.mode === m]),
      ),
      group(
        'count',
        [10, 25, 50, 0].map((n) => [String(n), n ? String(n) : '∞', s.count === n]),
      ),
      group(
        'time',
        [0, 15, 30].map((n) => [String(n), n ? `${n}s` : '無制限', s.timeLimit === n]),
      ),
      group('seat', [
        ['any', '親子', s.filters.seat === 'any'],
        ['child', '子', s.filters.seat === 'child'],
        ['dealer', '親', s.filters.seat === 'dealer'],
      ]),
      group('win', [
        ['any', 'ロンツモ', s.filters.win === 'any'],
        ['ron', 'ロン', s.filters.win === 'ron'],
        ['tsumo', 'ツモ', s.filters.win === 'tsumo'],
      ]),
    ].join('<span class="cfg-sep"></span>');
  }

  private onConfig(name: string, v: string): void {
    switch (name) {
      case 'mode':
        this.update({ mode: v as Mode });
        break;
      case 'count':
        this.update({ count: Number(v) });
        break;
      case 'time':
        this.update({ timeLimit: Number(v) });
        break;
      case 'seat':
        this.update({ filters: { ...this.s.filters, seat: v as Settings['filters']['seat'] } });
        break;
      case 'win':
        this.update({ filters: { ...this.s.filters, win: v as Settings['filters']['win'] } });
        break;
    }
  }

  // ------------------------------------------------------------ 進行

  private startSession(): void {
    this.fx.skip();
    clearTimeout(this.autoNext);
    document.body.classList.remove('kakuhen');
    this.session = newSession();
    this.lamps = Array.from({ length: 4 }, () => this.rollLamp());
    $('#summary').hidden = true;
    $('#stage').hidden = false;
    $('#lamps').hidden = false;
    this.next();
  }

  private rollLamp(): number {
    const k = this.session.kakuhen;
    const heat = Math.min(this.session.streak, 15);
    const weights = k ? [20, 30, 28, 17, 5] : [56 - heat, 25, 13 + heat * 0.5, 5 + heat * 0.4, 1 + heat * 0.1];
    const total = weights.reduce((a, b) => a + b, 0);
    let r = Math.random() * total;
    for (let i = 0; i < weights.length; i++) {
      r -= weights[i];
      if (r < 0) return i;
    }
    return 0;
  }

  private next(): void {
    clearTimeout(this.autoNext);
    const { count } = this.s;
    if (count && this.session.answered >= count) {
      this.showSummary();
      return;
    }
    this.q = generateQuestion(this.s.mode, this.s.rules, this.s.filters);
    this.lamp = this.lamps.shift() ?? 0;
    this.lamps.push(this.rollLamp());
    this.input = '';
    this.phase = 'answering';
    this.startedAt = performance.now();
    this.renderQuestion();
    this.renderInput();
    this.renderLamps();
    this.renderProgress();
    $('#result').innerHTML = '';
    $('#stage').classList.remove('correct', 'wrong');
    this.startTimer();
  }

  private startTimer(): void {
    cancelAnimationFrame(this.timerRaf);
    const bar = $('#timer');
    if (!this.s.timeLimit) {
      bar.style.transform = 'scaleX(0)';
      return;
    }
    const limit = this.s.timeLimit * 1000;
    const tick = () => {
      if (this.phase !== 'answering') return;
      const left = 1 - (performance.now() - this.startedAt) / limit;
      bar.style.transform = `scaleX(${Math.max(0, left)})`;
      bar.classList.toggle('low', left < 0.25);
      if (left <= 0) {
        void this.submit(true);
        return;
      }
      this.timerRaf = requestAnimationFrame(tick);
    };
    this.timerRaf = requestAnimationFrame(tick);
  }

  private needsPair(): boolean {
    if (this.q.mode === 'fu') return false;
    const { dealer, tsumo } = questionMeta(this.q);
    return tsumo && !dealer;
  }

  private isCorrect(input: string): boolean {
    if (this.q.mode === 'fu') return Number(input) === this.q.ev.fu.fu;
    return checkPointsAnswer(input, scoreOf(this.q));
  }

  /** 動作確認用：現在の問題の正解入力 */
  debugAnswer(): string {
    if (this.q.mode === 'fu') return String(this.q.ev.fu.fu);
    const s = scoreOf(this.q);
    if (!s.tsumo) return String(s.payment.ron);
    return s.dealer ? String(s.payment.fromDealer) : `${s.payment.fromChild}-${s.payment.fromDealer}`;
  }

  private correctText(): string {
    if (this.q.mode === 'fu') return `${this.q.ev.fu.fu}符`;
    return formatAnswer(scoreOf(this.q));
  }

  private async submit(timeout = false): Promise<void> {
    if (this.phase !== 'answering') return;
    if (!timeout) {
      if (!this.input) return;
      if (this.needsPair() && !/\d-\d/.test(this.input)) {
        this.hint('子ツモは「子の支払い-親の支払い」の2つを入力（例 1000-2000）');
        this.fx.lose($('#answer'));
        return;
      }
    }
    cancelAnimationFrame(this.timerRaf);
    this.phase = 'suspense';
    const elapsed = (performance.now() - this.startedAt) / 1000;
    const correct = !timeout && this.isCorrect(this.input);
    const score = scoreOf(this.q);
    const highValue = this.q.mode !== 'hayami' && (score.limit !== '' || this.q.ev.han >= 4);

    $('#answer').classList.add('locked');
    await this.fx.suspense(this.lamp, highValue);
    $('#answer').classList.remove('locked');
    this.reveal(correct, elapsed, timeout);
  }

  private reveal(correct: boolean, elapsed: number, timeout: boolean): void {
    const ss = this.session;
    const { dealer, tsumo } = questionMeta(this.q);
    const cat = situationLabel(dealer, tsumo);
    ss.answered++;
    ss.byCat[cat] ??= { c: 0, n: 0 };
    ss.byCat[cat].n++;
    this.phase = 'result';
    this.lastCorrect = correct;
    const stage = $('#stage');
    stage.classList.add(correct ? 'correct' : 'wrong');

    const explain = this.q.mode === 'hayami' ? hayamiExplain(this.q) : handExplain(this.q);
    const answerEl = $('#answer');

    if (correct) {
      ss.correct++;
      ss.streak++;
      ss.maxStreak = Math.max(ss.maxStreak, ss.streak);
      ss.times.push(elapsed);
      ss.byCat[cat].c++;
      const gain = this.gain(elapsed);
      ss.balls += gain;
      this.bank += gain;
      save(BANK_KEY, this.bank);
      const { tier, label } = this.tier();
      $('#result').innerHTML = `<div class="verdict ok"><span class="mark">正解</span><span class="ans">${this.correctText()}</span><span class="muted">${elapsed.toFixed(1)}s</span></div>${explain}`;
      const enterKakuhen = !ss.kakuhen && ss.streak >= 5;
      if (enterKakuhen) {
        ss.kakuhen = true;
        document.body.classList.add('kakuhen');
      }
      void this.fx.win(tier, gain, answerEl, label).then(async () => {
        if (enterKakuhen && this.phase === 'result') await this.fx.kakuhenStart();
        this.renderProgress();
        this.scheduleAutoNext();
      });
      this.renderBank(true);
      this.maybeLampChange();
    } else {
      if (ss.kakuhen) this.fx.kakuhenEnd();
      ss.kakuhen = false;
      document.body.classList.remove('kakuhen');
      ss.streak = 0;
      ss.misses.push({ q: this.q, input: timeout ? '時間切れ' : this.input });
      const yours = timeout ? '時間切れ' : this.input;
      $('#result').innerHTML = `<div class="verdict ng"><span class="mark">不正解</span><span class="yours">${yours}</span><span class="arrow">→</span><span class="ans">${this.correctText()}</span></div>${explain}`;
      this.fx.lose(answerEl);
    }
    this.renderProgress();
    this.renderInput();
    this.hint(correct ? '任意のキーで次へ' : 'Enter / Space で次へ');
  }

  private scheduleAutoNext(): void {
    clearTimeout(this.autoNext);
    if (this.phase !== 'result' || !this.lastCorrect) return;
    const wait = this.q.mode === 'hayami' ? 450 : 2200;
    this.autoNext = window.setTimeout(() => {
      if (this.phase === 'result') this.next();
    }, wait);
  }

  private gain(elapsed: number): number {
    const ss = this.session;
    let g = BASE_GAIN[this.s.mode] * LAMP_MULT[this.lamp];
    if (ss.kakuhen) g *= 2;
    g *= 1 + Math.min(ss.streak, 20) * 0.05;
    if (elapsed < 3) g *= 1.5;
    else if (elapsed < 6) g *= 1.2;
    if (this.q.mode !== 'hayami' && this.q.ev.yakuman) g *= 10;
    return Math.round(g / 10) * 10;
  }

  private tier(): { tier: WinTier; label: string } {
    const q = this.q;
    const streak = this.session.streak;
    if ((q.mode !== 'hayami' && q.ev.yakuman) || this.lamp === 4) {
      return { tier: 3, label: q.mode !== 'hayami' && q.ev.yakuman ? scoreOf(q).limit : 'PREMIUM' };
    }
    const limit = scoreOf(q).limit;
    if (q.mode !== 'hayami' && limit) return { tier: 2, label: limit };
    if (this.lamp === 3) return { tier: 2, label: '大当り' };
    if (streak > 0 && streak % 10 === 0) return { tier: 2, label: `${streak}連` };
    if (this.lamp === 2 || (streak > 0 && streak % 5 === 0) || limit) return { tier: 1, label: limit };
    return { tier: 0, label: '' };
  }

  /** 正解時に保留が昇格することがある（保留変化） */
  private maybeLampChange(): void {
    const chance = this.session.kakuhen ? 0.5 : 0.25;
    if (Math.random() > chance) return;
    const idx = Math.floor(Math.random() * this.lamps.length);
    if (this.lamps[idx] >= 4) return;
    this.lamps[idx]++;
    this.renderLamps();
    setTimeout(() => this.fx.lampUp(document.querySelectorAll('#lamps .lamp.next')[idx] ?? null), 250);
  }

  // ------------------------------------------------------------ 描画

  private renderQuestion(): void {
    const q = this.q;
    const el = $('#question');
    if (q.mode === 'hayami') {
      const main =
        q.han >= 5
          ? `<span class="big">${q.han}<small>翻</small></span>`
          : `<span class="big">${q.fu}<small>符</small></span><span class="big">${q.han}<small>翻</small></span>`;
      el.innerHTML = `<div class="q-hayami"><div class="q-main">${main}</div>
        <div class="q-sub"><span class="chip strong">${q.dealer ? '親' : '子'}</span><span class="chip strong">${q.tsumo ? 'ツモ' : 'ロン'}</span></div></div>`;
      return;
    }
    el.innerHTML = this.handQuestionHtml(q);
  }

  private handQuestionHtml(q: HandQuestion): string {
    const ura = q.sit.uraIndicators.length
      ? `<div class="dora"><span class="muted">裏ドラ表示</span>${tilesInline(q.sit.uraIndicators)}<span class="muted small">→ ${doraLabel(q.sit.uraIndicators)}</span></div>`
      : '';
    return `<div class="q-hand">
      <div class="q-info">
        <div class="chips">${situationChips(q)}</div>
        <div class="doras">
          <div class="dora"><span class="muted">ドラ表示</span>${tilesInline(q.sit.doraIndicators)}<span class="muted small">→ ${doraLabel(q.sit.doraIndicators)}</span></div>
          ${ura}
        </div>
      </div>
      ${handHtml(q.hand, q.sit.tsumo)}
    </div>`;
  }

  private promptUnit(): { unit: string; ghost: string } {
    if (this.q.mode === 'fu') return { unit: '符', ghost: '符を入力' };
    const { dealer, tsumo } = questionMeta(this.q);
    if (!tsumo) return { unit: '点', ghost: '点数を入力' };
    if (dealer) return { unit: '点オール', ghost: '1人あたりの支払い' };
    return { unit: '点', ghost: '子 - 親' };
  }

  private renderInput(): void {
    const { unit, ghost } = this.promptUnit();
    const text = this.input
      ? this.input
          .split('-')
          .map((p) => `<span class="num">${p}</span>`)
          .join('<span class="sep">-</span>')
      : `<span class="ghost">${ghost}</span>`;
    const caret = this.phase === 'answering' ? '<span class="caret"></span>' : '';
    $('#answer').innerHTML = this.input
      ? `<span class="typed">${text}</span>${caret}<span class="unit">${unit}</span>`
      : `${caret}${text}`;
    if (this.phase === 'answering') this.hint(this.defaultHint());
  }

  private defaultHint(): string {
    const pair = this.needsPair() ? '<kbd>-</kbd> 区切り · ' : '';
    return `${pair}<kbd>Enter</kbd> 回答 · <kbd>Tab</kbd> パス · <kbd>Esc</kbd> やり直し`;
  }

  private hint(html: string): void {
    $('#hint').innerHTML = html;
  }

  private renderLamps(): void {
    const lamp = (lv: number, cls: string) => `<span class="lamp ${cls} ${LAMP_NAMES[lv]}" title="×${LAMP_MULT[lv]}"></span>`;
    $('#lamps').innerHTML = `${lamp(this.lamp, 'current')}<span class="lamp-mult">×${LAMP_MULT[this.lamp]}</span><span class="lamp-sep"></span>${this.lamps
      .map((l) => lamp(l, 'next'))
      .join('')}`;
  }

  private renderProgress(): void {
    const ss = this.session;
    const total = this.s.count ? `/${this.s.count}` : '';
    const acc = ss.answered ? Math.round((ss.correct / ss.answered) * 100) : 100;
    $('#progress').innerHTML = `<span>${ss.answered + (this.phase === 'answering' || this.phase === 'suspense' ? 1 : 0)}${total}</span>
      <span class="muted">正答率 ${acc}%</span>
      <span class="streak${ss.streak >= 5 ? ' hot' : ''}">${ss.streak ? `${ss.streak}連` : ''}</span>
      ${ss.kakuhen ? '<span class="kakuhen-badge">確変中</span>' : ''}`;
  }

  private shownBank = 0;
  private renderBank(animate: boolean): void {
    const el = $('#bank-value');
    const target = this.bank;
    if (!animate || this.s.effects === 'off') {
      this.shownBank = target;
      el.textContent = target.toLocaleString();
      return;
    }
    const from = this.shownBank;
    const t0 = performance.now();
    const dur = 700;
    const step = (now: number) => {
      const k = Math.min(1, (now - t0) / dur);
      const v = Math.round(from + (target - from) * (1 - (1 - k) ** 3));
      el.textContent = v.toLocaleString();
      if (k < 1) requestAnimationFrame(step);
      else this.shownBank = target;
    };
    requestAnimationFrame(step);
    const bank = $('#bank');
    bank.classList.remove('bump');
    void bank.offsetWidth;
    bank.classList.add('bump');
  }

  private showSummary(): void {
    this.phase = 'summary';
    cancelAnimationFrame(this.timerRaf);
    const ss = this.session;
    const acc = ss.answered ? (ss.correct / ss.answered) * 100 : 0;
    const avg = ss.times.length ? ss.times.reduce((a, b) => a + b, 0) / ss.times.length : 0;
    const key = `${this.s.mode}:${this.s.count}`;
    const prev = this.best[key];
    const newBest = !prev || acc > prev.acc || (acc === prev.acc && avg > 0 && avg < prev.avg);
    if (newBest && ss.answered) {
      this.best[key] = { acc, avg, streak: Math.max(ss.maxStreak, prev?.streak ?? 0) };
      save(BEST_KEY, this.best);
    }

    const cats = Object.entries(ss.byCat)
      .map(([k, v]) => {
        const p = Math.round((v.c / v.n) * 100);
        return `<div class="cat"><span>${k}</span><span class="bar"><i style="width:${p}%"></i></span><span>${v.c}/${v.n}</span></div>`;
      })
      .join('');
    const weak = Object.entries(ss.byCat)
      .filter(([, v]) => v.n >= 2)
      .sort((a, b) => a[1].c / a[1].n - b[1].c / b[1].n)[0];
    const weakText = weak && weak[1].c < weak[1].n ? `苦手：<b>${weak[0]}</b>` : ss.answered ? '苦手なし' : '';

    const misses = ss.misses
      .slice(-8)
      .map((m) => `<li>${this.missLabel(m.q)} <span class="yours">${m.input}</span> → <b>${this.answerOf(m.q)}</b></li>`)
      .join('');

    $('#stage').hidden = true;
    $('#lamps').hidden = true;
    const sum = $('#summary');
    sum.hidden = false;
    sum.innerHTML = `
      <div class="stats">
        <div class="stat"><div class="label">正答率</div><div class="value">${Math.round(acc)}<small>%</small></div></div>
        <div class="stat"><div class="label">平均回答</div><div class="value">${avg.toFixed(1)}<small>s</small></div></div>
        <div class="stat"><div class="label">最大連チャン</div><div class="value">${ss.maxStreak}</div></div>
        <div class="stat"><div class="label">獲得玉</div><div class="value">${ss.balls.toLocaleString()}</div></div>
      </div>
      ${newBest && ss.answered ? '<div class="new-best">自己ベスト更新</div>' : prev ? `<div class="muted small">自己ベスト ${Math.round(prev.acc)}% / ${prev.avg.toFixed(1)}s</div>` : ''}
      <div class="sum-cols">
        <div><div class="ex-h">状況別 <span class="muted">${weakText}</span></div>${cats}</div>
        ${misses ? `<div><div class="ex-h">間違えた問題</div><ul class="misses">${misses}</ul></div>` : ''}
      </div>
      <div class="hint"><kbd>Tab</kbd> / <kbd>Enter</kbd> もう一度</div>`;
    this.fx.sessionEnd(acc >= 80);
  }

  private missLabel(q: Question): string {
    const { dealer, tsumo } = questionMeta(q);
    if (q.mode === 'hayami') return `${q.han >= 5 ? '' : `${q.fu}符`}${q.han}翻 ${situationLabel(dealer, tsumo)}`;
    return `${situationLabel(dealer, tsumo)}の手`;
  }

  private answerOf(q: Question): string {
    if (q.mode === 'fu') return `${q.ev.fu.fu}符`;
    return formatAnswer(scoreOf(q));
  }

  // ------------------------------------------------------------ 入力

  private bind(): void {
    addEventListener('keydown', (e) => this.onKey(e));
    addEventListener('mousemove', () => document.body.classList.remove('typing'));
    $('#config').addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-cfg]');
      if (b) {
        this.onConfig(b.dataset.cfg!, b.dataset.v!);
        b.blur();
      }
    });
    $('#open-settings').addEventListener('click', () => this.openSettings());
    this.bindSettings();
    $('#numpad').addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-key]');
      if (!b) return;
      unlockAudio();
      this.handleKey(b.dataset.key!);
    });
    $('#overlay').addEventListener('click', () => this.fx.skip());
    $('#stage').addEventListener('click', () => {
      if (this.phase === 'result') this.next();
    });
  }

  private onKey(e: KeyboardEvent): void {
    if ($<HTMLDialogElement>('#settings-dialog').open) return;
    if (e.metaKey || e.ctrlKey) {
      if (e.key === 'Backspace' && this.phase === 'answering') {
        this.input = '';
        this.renderInput();
        e.preventDefault();
      }
      return;
    }
    unlockAudio();
    if (e.key === 'Tab' || e.key === ' ') e.preventDefault();
    if (e.key === 'Escape') {
      e.preventDefault();
      this.startSession();
      return;
    }
    if (e.key === 'Backspace' && e.altKey) {
      this.input = '';
      this.renderInput();
      return;
    }
    this.handleKey(e.key);
  }

  private handleKey(key: string): void {
    switch (this.phase) {
      case 'suspense':
        this.fx.skip();
        return;
      case 'summary':
        if (key === 'Tab' || key === 'Enter' || key === ' ') this.startSession();
        return;
      case 'result':
        if (this.lastCorrect || key === 'Enter' || key === ' ' || key === 'Tab') {
          this.fx.skip();
          this.next();
          if (/^\d$/.test(key)) this.handleKey(key);
        }
        return;
      case 'answering':
        break;
    }
    document.body.classList.add('typing');
    if (/^\d$/.test(key)) {
      if (this.input.replace('-', '').length >= 10) return;
      if (this.input === '' && key === '0') return;
      if (this.input.endsWith('-') && key === '0') return;
      this.input += key;
      sfx.key();
    } else if ((key === '-' || key === ' ' || key === '/') && this.needsPair()) {
      if (!this.input || this.input.includes('-')) return;
      this.input += '-';
      sfx.key();
    } else if (key === 'Backspace') {
      this.input = this.input.slice(0, -1);
      sfx.back();
    } else if (key === 'Enter') {
      void this.submit();
      return;
    } else if (key === 'Tab') {
      void this.submit(true);
      return;
    } else return;
    this.renderInput();
  }

  // ------------------------------------------------------------ 設定ダイアログ

  private rulesDirty = false;

  private bindSettings(): void {
    const dlg = $<HTMLDialogElement>('#settings-dialog');
    dlg.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-set]');
      if (!b || b instanceof HTMLInputElement) return;
      e.preventDefault();
      this.onSetting(b.dataset.set!, b.dataset.v!);
      this.renderSettings();
    });
    dlg.addEventListener('input', (e) => {
      const el = e.target as HTMLInputElement;
      if (el.dataset.set === 'volume') this.update({ volume: Number(el.value) }, false);
    });
    dlg.addEventListener('close', () => {
      if (this.rulesDirty) this.startSession();
      this.rulesDirty = false;
    });
  }

  private onSetting(name: string, v: string): void {
    const bool = v === 'on';
    const rules = { ...this.s.rules };
    switch (name) {
      case 'close':
        $<HTMLDialogElement>('#settings-dialog').close();
        return;
      case 'theme':
        this.update({ theme: v as Settings['theme'] }, false);
        return;
      case 'effects':
        this.update({ effects: v as Settings['effects'] }, false);
        return;
      case 'sound':
        this.update({ sound: bool }, false);
        if (bool) {
          unlockAudio();
          sfx.hit();
        }
        return;
      case 'doubleWindPairFu':
        rules.doubleWindPairFu = Number(v) as 2 | 4;
        break;
      case 'reset':
        if (confirm('自己ベストと持ち玉を消去しますか？')) {
          this.bank = 0;
          this.best = {};
          save(BANK_KEY, 0);
          save(BEST_KEY, {});
          this.renderBank(false);
        }
        return;
      case 'kuitan':
      case 'aka':
      case 'kiriage':
      case 'kazoe':
      case 'doubleYakuman':
        rules[name] = bool;
        break;
      default:
        return;
    }
    this.rulesDirty = true;
    this.update({ rules }, false);
  }

  private openSettings(): void {
    this.renderSettings();
    const dlg = $<HTMLDialogElement>('#settings-dialog');
    if (!dlg.open) dlg.showModal();
  }

  private renderSettings(): void {
    const dlg = $<HTMLDialogElement>('#settings-dialog');
    const scroll = dlg.querySelector('.settings')?.scrollTop ?? 0;
    const s = this.s;
    const r = s.rules;
    const row = (label: string, desc: string, name: string, opts: [string, string][], cur: string) =>
      `<div class="set-row"><div><div class="set-label">${label}</div>${desc ? `<div class="set-desc">${desc}</div>` : ''}</div>
       <div class="cfg-group">${opts
         .map(([v, l]) => `<button class="cfg${cur === v ? ' on' : ''}" data-set="${name}" data-v="${v}">${l}</button>`)
         .join('')}</div></div>`;
    const onOff = (b: boolean) => (b ? 'on' : 'off');
    const yn: [string, string][] = [
      ['on', 'あり'],
      ['off', 'なし'],
    ];
    dlg.innerHTML = `<div class="settings">
      <div class="set-head"><span>設定</span><button class="icon-btn" data-set="close" data-v="" aria-label="閉じる">×</button></div>
      <div class="set-sec">表示・演出</div>
      ${row('テーマ', '', 'theme', [['serika', 'serika'], ['paper', 'paper'], ['neon', 'neon']], s.theme)}
      ${row('演出', '点滅や揺れが苦手な場合は「控えめ」か「オフ」に', 'effects', [['max', '全開'], ['lite', '控えめ'], ['off', 'オフ']], s.effects)}
      ${row('サウンド', '', 'sound', yn, onOff(s.sound))}
      <div class="set-row"><div><div class="set-label">音量</div></div><input type="range" min="0" max="1" step="0.05" value="${s.volume}" data-set="volume" aria-label="音量"></div>
      <div class="set-sec">ルール <span class="muted small">変更すると新しいセッションを開始</span></div>
      ${row('喰いタン', '鳴いた断么九を認める', 'kuitan', yn, onOff(r.kuitan))}
      ${row('赤ドラ', '赤五萬・赤五筒・赤五索 各1枚', 'aka', yn, onOff(r.aka))}
      ${row('切り上げ満貫', '30符4翻・60符3翻を満貫にする', 'kiriage', yn, onOff(r.kiriage))}
      ${row('数え役満', '13翻以上を役満にする', 'kazoe', yn, onOff(r.kazoe))}
      ${row('ダブル役満', '役満の複合・ダブル役満を認める', 'doubleYakuman', yn, onOff(r.doubleYakuman))}
      ${row('連風牌の雀頭', '場風かつ自風の雀頭', 'doubleWindPairFu', [['2', '2符'], ['4', '4符']], String(r.doubleWindPairFu))}
      <div class="set-sec">記録</div>
      <div class="set-row"><div><div class="set-label">持ち玉 ${this.bank.toLocaleString()}</div><div class="set-desc">自己ベストと持ち玉を消去</div></div><div class="cfg-group"><button class="cfg danger" data-set="reset" data-v="1">リセット</button></div></div>
    </div>`;
    const el = dlg.querySelector('.settings');
    if (el) el.scrollTop = scroll;
  }
}

const SHELL = `
<header id="top">
  <div class="logo">tensu<span class="dot">.</span><span class="sub">麻雀点数計算トレーナー</span></div>
  <div class="top-right">
    <div id="bank" title="持ち玉"><span class="muted">玉</span> <span id="bank-value">0</span></div>
    <button id="open-settings" class="icon-btn" aria-label="設定">
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
    </button>
  </div>
</header>
<nav id="config"></nav>
<main>
  <section id="stage">
    <div id="progress"></div>
    <div id="question"></div>
    <div id="answer" aria-live="polite"></div>
    <div class="timer-track"><div id="timer"></div></div>
    <div id="hint" class="hint"></div>
    <div id="result"></div>
  </section>
  <section id="summary" hidden></section>
</main>
<div id="lamps" title="保留ランプ：色で玉の倍率が変わる（青×1 緑×1.5 赤×2 金×3 虹×5）"></div>
<div id="numpad">
  ${['1', '2', '3', '4', '5', '6', '7', '8', '9', '-', '0', 'Backspace']
    .map((k) => `<button data-key="${k}">${k === 'Backspace' ? '⌫' : k}</button>`)
    .join('')}
  <button data-key="Enter" class="enter">回答</button>
</div>
<footer>
  <span><kbd>Esc</kbd> やり直し</span>
  <span><kbd>Tab</kbd> パス / 次へ</span>
  <span class="muted">ルール・演出は右上の設定から</span>
</footer>
<dialog id="settings-dialog"></dialog>
`;
