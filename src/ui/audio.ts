/** Web Audio によるパチンコ風の合成効果音 */

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let enabled = true;
let volume = 0.5;

export function configureAudio(on: boolean, vol: number): void {
  enabled = on;
  volume = vol;
  if (master) master.gain.value = volume * 0.6;
  if (!on) bgm.stop(true);
}

/** ユーザー操作の中で呼び、AudioContext を起こす */
export function unlockAudio(): void {
  if (!enabled) return;
  try {
    if (!ctx) {
      ctx = new AudioContext();
      master = ctx.createGain();
      master.gain.value = volume * 0.6;
      const comp = ctx.createDynamicsCompressor();
      master.connect(comp).connect(ctx.destination);
    }
    // iOS は画面ロックや別アプリから戻ると 'interrupted' になる
    if (ctx.state !== 'running') void ctx.resume();
  } catch {
    ctx = null;
  }
}

/** 画面が隠れたら音を止める（アプリを背面に回したあとも BGM が鳴り続けないように）。戻ったら unlockAudio で再開する */
export function suspendAudio(): void {
  if (ctx && ctx.state === 'running') void ctx.suspend().catch(() => undefined);
}

let analyser: AnalyserNode | null = null;

/** 動作確認用：いま出ている音の大きさ（RMS） */
export function audioLevel(): number {
  if (!ctx || !master) return 0;
  if (!analyser) {
    analyser = ctx.createAnalyser();
    master.connect(analyser);
  }
  const buf = new Float32Array(analyser.fftSize);
  analyser.getFloatTimeDomainData(buf);
  return Math.sqrt(buf.reduce((s, v) => s + v * v, 0) / buf.length);
}

function ready(): AudioContext | null {
  if (!enabled || !ctx || !master || volume <= 0) return null;
  return ctx;
}

interface ToneOpts {
  type?: OscillatorType;
  freq: number;
  to?: number;
  start?: number;
  dur: number;
  gain?: number;
  attack?: number;
  filter?: number;
  /** BGM 用の出力（BGM の音量をまとめて上げる） */
  bgm?: boolean;
}

/** BGM の出力。スマホのスピーカーでも効果音に負けないよう、BGM 全体をここで持ち上げる */
const BGM_GAIN = 2;
let bgmBus: GainNode | null = null;
function out(c: AudioContext, useBgm = false): AudioNode {
  if (!useBgm) return master!;
  if (!bgmBus || bgmBus.context !== c) {
    bgmBus = c.createGain();
    bgmBus.gain.value = BGM_GAIN;
    bgmBus.connect(master!);
  }
  return bgmBus;
}

function tone({ type = 'square', freq, to, start = 0, dur, gain = 0.2, attack = 0.005, filter, bgm: toBgm = false }: ToneOpts): void {
  const c = ready();
  if (!c || !master) return;
  const t0 = c.currentTime + start;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (to) osc.frequency.exponentialRampToValueAtTime(to, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  let node: AudioNode = osc;
  if (filter) {
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = filter;
    osc.connect(f);
    node = f;
  }
  node.connect(g).connect(out(c, toBgm));
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
}

function noise(start: number, dur: number, gain: number, freq = 3000, toBgm = false): void {
  const c = ready();
  if (!c || !master) return;
  const t0 = c.currentTime + start;
  const buf = c.createBuffer(1, Math.floor(c.sampleRate * dur), c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const src = c.createBufferSource();
  src.buffer = buf;
  const f = c.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = freq;
  const g = c.createGain();
  g.gain.setValueAtTime(gain, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(f).connect(g).connect(out(c, toBgm));
  src.start(t0);
}

const note = (n: number) => 440 * 2 ** ((n - 69) / 12);

export const sfx = {
  key(): void {
    tone({ type: 'triangle', freq: 1800, dur: 0.03, gain: 0.04 });
  },
  back(): void {
    tone({ type: 'triangle', freq: 900, dur: 0.04, gain: 0.04 });
  },
  reelStop(i = 0): void {
    tone({ type: 'square', freq: 520 + i * 90, dur: 0.07, gain: 0.12, filter: 2500 });
    noise(0, 0.05, 0.08, 2000);
  },
  reach(): void {
    tone({ type: 'sawtooth', freq: 300, to: 1200, dur: 0.45, gain: 0.14, filter: 3000 });
    tone({ type: 'square', freq: note(81), start: 0.45, dur: 0.12, gain: 0.12 });
    tone({ type: 'square', freq: note(81), start: 0.6, dur: 0.12, gain: 0.12 });
  },
  gekiatsu(): void {
    // キュイーン
    tone({ type: 'sawtooth', freq: 400, to: 2400, dur: 0.6, gain: 0.16, filter: 5000 });
    tone({ type: 'square', freq: 800, to: 3200, start: 0.05, dur: 0.55, gain: 0.08 });
    noise(0, 0.6, 0.05, 6000);
  },
  hit(): void {
    [72, 76, 79, 84].forEach((n, i) =>
      tone({ type: 'square', freq: note(n), start: i * 0.05, dur: 0.18, gain: 0.1, filter: 4000 }),
    );
  },
  coin(): void {
    const f = 1800 + Math.random() * 1400;
    tone({ type: 'sine', freq: f, dur: 0.12, gain: 0.06 });
    tone({ type: 'sine', freq: f * 1.5, start: 0.04, dur: 0.14, gain: 0.04 });
  },
  coins(n = 8, spread = 0.6): void {
    for (let i = 0; i < n; i++) {
      const c = ready();
      if (!c) return;
      setTimeout(() => sfx.coin(), Math.random() * spread * 1000);
    }
  },
  fanfare(): void {
    const seq: [number, number, number][] = [
      [67, 0, 0.12],
      [72, 0.12, 0.12],
      [76, 0.24, 0.12],
      [79, 0.36, 0.3],
      [76, 0.7, 0.12],
      [79, 0.82, 0.12],
      [84, 0.94, 0.6],
    ];
    for (const [n, s, d] of seq) {
      tone({ type: 'square', freq: note(n), start: s, dur: d, gain: 0.12, filter: 5000 });
      tone({ type: 'sawtooth', freq: note(n - 12), start: s, dur: d, gain: 0.06, filter: 1800 });
    }
  },
  yakuman(): void {
    tone({ type: 'sine', freq: 60, to: 40, dur: 0.6, gain: 0.4 });
    const chords = [
      [60, 64, 67],
      [62, 65, 69],
      [64, 67, 71],
      [65, 69, 72, 77],
    ];
    chords.forEach((ch, i) =>
      ch.forEach((n) =>
        tone({ type: 'sawtooth', freq: note(n + 12), start: 0.5 + i * 0.22, dur: i === 3 ? 1.2 : 0.2, gain: 0.07, filter: 4500 }),
      ),
    );
    sfx.coins(24, 2);
  },
  kakuhen(): void {
    for (let i = 0; i < 12; i++) {
      tone({ type: 'square', freq: note(72 + ((i * 5) % 24)), start: i * 0.045, dur: 0.08, gain: 0.08 });
    }
    tone({ type: 'sawtooth', freq: 200, to: 1600, start: 0.55, dur: 0.5, gain: 0.1, filter: 3000 });
  },
  lampUp(): void {
    tone({ type: 'sine', freq: note(88), dur: 0.1, gain: 0.1 });
    tone({ type: 'sine', freq: note(93), start: 0.08, dur: 0.18, gain: 0.1 });
  },
  miss(): void {
    tone({ type: 'square', freq: 160, to: 110, dur: 0.35, gain: 0.12, filter: 900 });
  },
  reelTick(): void {
    tone({ type: 'square', freq: 1400 + Math.random() * 300, dur: 0.02, gain: 0.03, filter: 3000 });
  },
  gyuin(): void {
    tone({ type: 'sawtooth', freq: 180, to: 1400, dur: 0.35, gain: 0.14, filter: 2600 });
    tone({ type: 'sawtooth', freq: 1400, to: 300, start: 0.35, dur: 0.2, gain: 0.1, filter: 2600 });
    noise(0, 0.5, 0.06, 1200);
  },
  pushAppear(): void {
    [0, 0.09, 0.18].forEach((t, i) => tone({ type: 'square', freq: note(84 + i * 2), start: t, dur: 0.08, gain: 0.1 }));
  },
  push(): void {
    tone({ type: 'sine', freq: 90, to: 40, dur: 0.3, gain: 0.5 });
    noise(0, 0.15, 0.2, 800);
  },
  align(): void {
    tone({ type: 'square', freq: note(96), dur: 0.08, gain: 0.12 });
    tone({ type: 'square', freq: note(100), start: 0.08, dur: 0.08, gain: 0.12 });
    tone({ type: 'square', freq: note(103), start: 0.16, dur: 0.3, gain: 0.12 });
  },
  shatter(): void {
    noise(0, 0.5, 0.35, 5000);
    noise(0.02, 0.35, 0.2, 9000);
    tone({ type: 'sine', freq: 70, to: 35, dur: 0.5, gain: 0.5 });
  },
  /** 連チャン数に応じて音程が上がるヒット音 */
  comboHit(streak: number): void {
    const n = 72 + Math.min(streak, 24);
    tone({ type: 'square', freq: note(n), dur: 0.09, gain: 0.1, filter: 5000 });
    tone({ type: 'square', freq: note(n + 7), start: 0.06, dur: 0.12, gain: 0.08, filter: 5000 });
    tone({ type: 'sine', freq: note(n + 12), start: 0.06, dur: 0.25, gain: 0.06 });
  },
  glitch(): void {
    noise(0, 0.12, 0.2, 400);
    tone({ type: 'square', freq: 90, dur: 0.18, gain: 0.1, filter: 600 });
    noise(0.14, 0.08, 0.15, 2500);
  },
  swarm(): void {
    noise(0, 0.8, 0.12, 1500);
    tone({ type: 'sawtooth', freq: 200, to: 800, dur: 0.8, gain: 0.05, filter: 1500 });
  },
  step(i: number): void {
    tone({ type: 'square', freq: note(76 + i * 3), dur: 0.1, gain: 0.1 });
  },
  stamp(): void {
    tone({ type: 'sine', freq: 140, to: 60, dur: 0.2, gain: 0.4 });
    tone({ type: 'square', freq: note(88), start: 0.02, dur: 0.1, gain: 0.08 });
  },
  kakuhenEnd(): void {
    [79, 74, 70, 67].forEach((n, i) => tone({ type: 'triangle', freq: note(n), start: i * 0.12, dur: 0.18, gain: 0.1 }));
    noise(0, 0.3, 0.12, 3000);
  },
  god(): void {
    [60, 64, 67, 72, 76, 79, 84, 88].forEach((n, i) =>
      tone({ type: 'sawtooth', freq: note(n), start: i * 0.06, dur: 0.9 - i * 0.05, gain: 0.05, filter: 5000 }),
    );
    tone({ type: 'sine', freq: 55, dur: 1.2, gain: 0.4 });
  },
  /** 払い出し：レジのチャリーン */
  register(): void {
    tone({ type: 'square', freq: note(88), dur: 0.08, gain: 0.1 });
    tone({ type: 'square', freq: note(93), start: 0.08, dur: 0.25, gain: 0.1 });
    noise(0.05, 0.3, 0.12, 7000);
    sfx.coins(10, 1.2);
  },
  chucker(): void {
    tone({ type: 'square', freq: 1200, dur: 0.04, gain: 0.08 });
    tone({ type: 'triangle', freq: 700, start: 0.04, dur: 0.1, gain: 0.1 });
  },
  round(r: number): void {
    tone({ type: 'square', freq: note(72 + r), dur: 0.08, gain: 0.08 });
    sfx.coin();
  },
  gimmick(): void {
    tone({ type: 'sawtooth', freq: 900, to: 120, dur: 0.4, gain: 0.12, filter: 2000 });
    tone({ type: 'sine', freq: 80, to: 30, start: 0.38, dur: 0.5, gain: 0.5 });
    noise(0.38, 0.3, 0.3, 600);
  },
  end(): void {
    tone({ type: 'triangle', freq: note(67), dur: 0.15, gain: 0.1 });
    tone({ type: 'triangle', freq: note(72), start: 0.15, dur: 0.3, gain: 0.1 });
  },
};

export type BgmTheme = 'bonus' | 'rush';
export type BgmTrack = 'standard' | 'euro' | 'wa' | 'chip';

/** 1曲の1テーマ分：コード進行（1小節ずつ）・メロディ（8分 × 4小節、null は休み）・テンポ */
interface ThemeDef {
  chords: number[][];
  melody: (number | null)[];
  tempo: number;
}

/**
 * 曲の表（景品の BGM）。スマホのスピーカーは低音がほとんど出ないので、曲の輪郭は中高音のメロディで作る
 */
const TRACKS: Record<BgmTrack, Record<BgmTheme, ThemeDef>> = {
  // スタンダード：RUSH は短調で疾走感、BONUS は明るい長調
  standard: {
    rush: {
      tempo: 150,
      chords: [[57, 60, 64, 69], [53, 57, 60, 65], [55, 59, 62, 67], [52, 56, 59, 64]],
      melody: [81, null, 76, 81, 84, 83, 81, 76, 77, null, 81, 77, 84, 81, 77, 81, 79, null, 83, 79, 86, 83, 79, 83, 80, 83, 88, 83, 80, 76, 80, 83],
    },
    bonus: {
      tempo: 165,
      chords: [[60, 64, 67, 72], [57, 60, 64, 69], [53, 57, 60, 65], [55, 59, 62, 67]],
      melody: [72, 76, 79, 76, 84, 79, 76, 79, 81, 79, 76, 72, 76, null, 81, null, 77, 81, 84, 81, 77, 72, 77, 81, 79, 83, 86, 83, 79, null, 86, 84],
    },
  },
  // ユーロビート：速いテンポ、駆け上がるアルペジオとノコギリ波のリード、オクターブで跳ねるベース
  euro: {
    rush: {
      tempo: 172,
      chords: [[57, 60, 64, 69], [53, 57, 60, 65], [55, 59, 62, 67], [52, 55, 59, 64]],
      melody: [76, 79, 81, 79, 76, 74, 72, 74, 77, 81, 84, 81, 77, 76, 74, 76, 79, 83, 86, 83, 79, 77, 76, 77, 76, 79, 83, 88, 86, 84, 83, 79],
    },
    bonus: {
      tempo: 176,
      chords: [[57, 61, 64, 69], [50, 53, 57, 62], [55, 59, 62, 67], [57, 61, 64, 69]],
      melody: [81, 84, 88, 84, 81, 79, 76, 79, 77, 81, 84, 86, 84, 81, 77, 81, 79, 83, 86, 88, 86, 83, 79, 83, 81, 85, 88, 93, 88, 85, 81, 85],
    },
  },
  // 和風：ヨナ抜き（D E G A B）のメロディ、琴のようにはじく音、太鼓
  wa: {
    rush: {
      tempo: 140,
      chords: [[50, 57, 62, 69], [55, 62, 67, 74], [57, 64, 69, 76], [52, 59, 64, 71]],
      melody: [74, 76, 79, 81, 79, 76, 74, null, 79, 81, 83, 81, 79, 76, 79, null, 81, 83, 86, 83, 81, 79, 76, 79, 74, null, 76, 79, 76, 74, 71, 74],
    },
    bonus: {
      tempo: 150,
      chords: [[50, 57, 62, 69], [55, 62, 67, 74], [59, 66, 71, 78], [57, 64, 69, 76]],
      melody: [86, 83, 81, 79, 81, 83, 86, null, 88, 86, 83, 81, 83, 86, 88, null, 91, 88, 86, 83, 86, 88, 91, 88, 86, null, 83, 81, 79, 81, 83, 86],
    },
  },
  // チップチューン：8bit 風。矩形波のメロディ、細かいアルペジオ、三角波のベース、ノイズのドラム
  chip: {
    rush: {
      tempo: 160,
      chords: [[57, 60, 64], [53, 57, 60], [55, 59, 62], [52, 56, 59]],
      melody: [72, 76, 79, 84, 83, 79, 76, 79, 74, 77, 81, 86, 84, 81, 77, 81, 76, 79, 83, 88, 86, 83, 79, 83, 77, 81, 84, 89, 88, 84, 81, 79],
    },
    bonus: {
      tempo: 168,
      chords: [[60, 64, 67], [57, 60, 64], [53, 57, 60], [55, 59, 62]],
      melody: [84, 88, 91, 88, 84, 88, 91, 96, 81, 84, 88, 84, 81, 84, 88, 93, 77, 81, 84, 81, 77, 81, 84, 89, 79, 83, 86, 83, 91, 89, 88, 86],
    },
  },
};

/** BONUS・RUSH 中に流れる合成 BGM（スケジューラ方式） */
export const bgm = (() => {
  let timer = 0;
  let step = 0;
  let nextTime = 0;
  let theme: BgmTheme = 'rush';
  let track: BgmTrack = 'standard';
  let fast = false;
  let previewTimer = 0;
  const def = () => TRACKS[track][theme];
  const bpm = () => def().tempo + (fast ? 26 : 0);
  const schedule = () => {
    const c = ready();
    if (!c || !master) return;
    const sixteenth = 60 / bpm() / 4;
    const { chords, melody } = def();
    while (nextTime < c.currentTime + 0.12) {
      const chord = chords[Math.floor(step / 16) % chords.length];
      const start = nextTime - c.currentTime;
      const m = step % 2 === 0 ? melody[(step / 2) % melody.length] : null;
      switch (track) {
        case 'euro':
          // オクターブで跳ねるベースと4つ打ち
          tone({ type: 'sawtooth', freq: note(chord[0] - (step % 2 ? 0 : 12)), start, dur: sixteenth * 0.9, gain: 0.05, filter: 1400, bgm: true });
          if (step % 4 === 0) tone({ type: 'sine', freq: 100, to: 45, start, dur: 0.12, gain: 0.24, bgm: true });
          if (step % 8 === 4) noise(start, 0.1, 0.1, 2200, true);
          if (step % 4 === 2) noise(start, 0.05, 0.04, 8000, true);
          if (m !== null) {
            tone({ type: 'sawtooth', freq: note(m), start, dur: sixteenth * 1.8, gain: 0.04, filter: 4200, bgm: true });
            tone({ type: 'square', freq: note(m + 12), start, dur: sixteenth * 1.2, gain: 0.015, filter: 5000, bgm: true });
          }
          tone({ type: 'square', freq: note(chord[step % chord.length] + 12 + (step % 8 >= 4 ? 12 : 0)), start, dur: sixteenth * 0.8, gain: 0.03, filter: 4000, bgm: true });
          break;
        case 'wa':
          // 太鼓（1拍目と裏）と、琴のようにはじく音
          if (step % 16 === 0 || step % 16 === 6 || step % 16 === 10) tone({ type: 'sine', freq: 75, to: 38, start, dur: 0.25, gain: 0.3, bgm: true });
          if (step % 8 === 4) noise(start, 0.06, 0.05, 1400, true);
          if (step % 4 === 0) tone({ type: 'triangle', freq: note(chord[0]), start, dur: sixteenth * 3.5, gain: 0.05, bgm: true });
          if (m !== null) {
            tone({ type: 'triangle', freq: note(m), start, dur: 0.35, gain: 0.08, attack: 0.002, bgm: true });
            tone({ type: 'square', freq: note(m + 12), start, dur: 0.12, gain: 0.012, attack: 0.002, filter: 3000, bgm: true });
          }
          if (step % 4 === 2) tone({ type: 'triangle', freq: note(chord[(step / 2) % chord.length] + 12), start, dur: 0.2, gain: 0.03, attack: 0.002, bgm: true });
          break;
        case 'chip':
          // 三角波のベース・ノイズのドラム・細かいアルペジオ
          if (step % 2 === 0) tone({ type: 'triangle', freq: note(chord[0] - 12 + (step % 4 ? 12 : 0)), start, dur: sixteenth * 1.5, gain: 0.08, bgm: true });
          if (step % 4 === 0) noise(start, 0.05, 0.12, 300, true);
          if (step % 8 === 4) noise(start, 0.08, 0.1, 3500, true);
          if (m !== null) tone({ type: 'square', freq: note(m), start, dur: sixteenth * 1.6, gain: 0.045, attack: 0.001, bgm: true });
          tone({ type: 'square', freq: note(chord[step % chord.length] + 24), start, dur: sixteenth * 0.6, gain: 0.018, attack: 0.001, bgm: true });
          break;
        default:
          // スタンダード：8分のベース、キック・スネア・ハイハット、メロディとアルペジオ
          if (step % 2 === 0) {
            tone({ type: 'sawtooth', freq: note(chord[0] - 12), start, dur: sixteenth * 1.6, gain: 0.06, filter: 900, bgm: true });
            tone({ type: 'triangle', freq: note(chord[0]), start, dur: sixteenth * 1.4, gain: 0.05, bgm: true });
          }
          if (step % 4 === 0) tone({ type: 'sine', freq: 90, to: 45, start, dur: 0.12, gain: 0.22, bgm: true });
          if (step % 8 === 4) noise(start, 0.09, 0.09, 2500, true);
          if (step % 2 === 1) noise(start, 0.03, 0.025, 9000, true);
          if (m !== null) {
            tone({ type: 'square', freq: note(m), start, dur: sixteenth * 1.7, gain: 0.05, filter: 3000, bgm: true });
            tone({ type: 'triangle', freq: note(m - 12), start, dur: sixteenth * 1.7, gain: 0.03, bgm: true });
          }
          tone({ type: 'square', freq: note(chord[(step * 3) % chord.length] + 12 + (step % 16 >= 8 ? 12 : 0)), start, dur: sixteenth * 0.9, gain: 0.03, filter: 3500, bgm: true });
      }
      step++;
      nextTime += sixteenth;
    }
  };
  const begin = (c: AudioContext) => {
    step = 0;
    nextTime = c.currentTime + 0.05;
    if (!timer) timer = window.setInterval(schedule, 25);
  };
  const stopNow = () => {
    clearInterval(timer);
    timer = 0;
  };
  return {
    /** 曲を流す。別のテーマが鳴っていれば切り替え、同じなら何もしない。quick は超確変などでテンポを上げる */
    play(t: BgmTheme, quick = false): void {
      fast = quick;
      const c = ready();
      if (!c) return;
      if (c.state !== 'running') void c.resume().catch(() => undefined);
      if (previewTimer) {
        clearTimeout(previewTimer);
        previewTimer = 0;
        stopNow();
      }
      if (timer && theme === t) return;
      theme = t;
      begin(c);
    },
    /** 超確変などでテンポを上げる */
    setFast(on: boolean): void {
      fast = on;
    },
    /** 装備した曲に切り替える（鳴っている最中なら次の音から新しい曲） */
    setTrack(t: BgmTrack): void {
      if (TRACKS[t]) track = t;
    },
    /** 交換所の試聴：その曲の BONUS を数秒流す。本番の曲が鳴っている間はしない */
    preview(t: BgmTrack, ms = 4500): boolean {
      const c = ready();
      if (!c || (timer && !previewTimer)) return false;
      if (c.state !== 'running') void c.resume().catch(() => undefined);
      const keep = track;
      clearTimeout(previewTimer);
      track = t;
      theme = 'bonus';
      fast = false;
      begin(c);
      previewTimer = window.setTimeout(() => {
        previewTimer = 0;
        stopNow();
        track = keep;
      }, ms);
      return true;
    },
    /** 止める。試聴中は force のときだけ止める（BONUS の終わりなどで試聴を切らない） */
    stop(force = false): void {
      if (previewTimer && !force) return;
      clearTimeout(previewTimer);
      previewTimer = 0;
      stopNow();
    },
    get playing(): boolean {
      return timer !== 0;
    },
    get theme(): BgmTheme | null {
      return timer && !previewTimer ? theme : null;
    },
  };
})();
