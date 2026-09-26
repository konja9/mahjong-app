/** Web Audio によるパチンコ風の合成効果音 */

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let enabled = true;
let volume = 0.5;

export function configureAudio(on: boolean, vol: number): void {
  enabled = on;
  volume = vol;
  if (master) master.gain.value = volume * 0.6;
  if (!on) bgm.stop();
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

/** テーマごとのコード進行。RUSH は短調で疾走感、BONUS は明るい長調 */
const BGM_CHORDS: Record<BgmTheme, number[][]> = {
  rush: [
    [57, 60, 64, 69],
    [53, 57, 60, 65],
    [55, 59, 62, 67],
    [52, 56, 59, 64],
  ],
  bonus: [
    [60, 64, 67, 72],
    [57, 60, 64, 69],
    [53, 57, 60, 65],
    [55, 59, 62, 67],
  ],
};

/**
 * テーマごとのメロディ（8分音符 × 4小節、null は休み）。
 * スマホのスピーカーは低音がほとんど出ないので、曲の輪郭は中高音のメロディで作る
 */
const BGM_MELODY: Record<BgmTheme, (number | null)[]> = {
  rush: [
    81, null, 76, 81, 84, 83, 81, 76,
    77, null, 81, 77, 84, 81, 77, 81,
    79, null, 83, 79, 86, 83, 79, 83,
    80, 83, 88, 83, 80, 76, 80, 83,
  ],
  bonus: [
    72, 76, 79, 76, 84, 79, 76, 79,
    81, 79, 76, 72, 76, null, 81, null,
    77, 81, 84, 81, 77, 72, 77, 81,
    79, 83, 86, 83, 79, null, 86, 84,
  ],
};

/** BONUS・RUSH 中に流れる合成 BGM（スケジューラ方式） */
export const bgm = (() => {
  let timer = 0;
  let step = 0;
  let nextTime = 0;
  let bpm = 150;
  let theme: BgmTheme = 'rush';
  let chords = BGM_CHORDS.rush;
  let melody = BGM_MELODY.rush;
  const schedule = () => {
    const c = ready();
    if (!c || !master) return;
    const sixteenth = 60 / bpm / 4;
    while (nextTime < c.currentTime + 0.12) {
      const chord = chords[Math.floor(step / 16) % chords.length];
      const start = nextTime - c.currentTime;
      // ベース（8分）：低音に加えて1オクターブ上の三角波で、スマホでも輪郭が出るようにする
      if (step % 2 === 0) {
        tone({ type: 'sawtooth', freq: note(chord[0] - 12), start, dur: sixteenth * 1.6, gain: 0.06, filter: 900, bgm: true });
        tone({ type: 'triangle', freq: note(chord[0]), start, dur: sixteenth * 1.4, gain: 0.05, bgm: true });
      }
      // キック・スネア・ハイハット
      if (step % 4 === 0) tone({ type: 'sine', freq: 90, to: 45, start, dur: 0.12, gain: 0.22, bgm: true });
      if (step % 8 === 4) noise(start, 0.09, 0.09, 2500, true);
      if (step % 2 === 1) noise(start, 0.03, 0.025, 9000, true);
      // メロディ（8分）
      if (step % 2 === 0) {
        const m = melody[(step / 2) % melody.length];
        if (m !== null) {
          tone({ type: 'square', freq: note(m), start, dur: sixteenth * 1.7, gain: 0.05, filter: 3000, bgm: true });
          tone({ type: 'triangle', freq: note(m - 12), start, dur: sixteenth * 1.7, gain: 0.03, bgm: true });
        }
      }
      const arp = chord[(step * 3) % chord.length] + 12 + (step % 16 >= 8 ? 12 : 0);
      tone({ type: 'square', freq: note(arp), start, dur: sixteenth * 0.9, gain: 0.03, filter: 3500, bgm: true });
      step++;
      nextTime += sixteenth;
    }
  };
  return {
    /** 曲を流す。別の曲が鳴っていれば切り替え、同じ曲ならテンポだけ合わせる */
    play(t: BgmTheme, tempo = 150): void {
      bpm = tempo;
      const c = ready();
      if (!c) return;
      if (c.state !== 'running') void c.resume().catch(() => undefined);
      if (timer && theme === t) return;
      theme = t;
      chords = BGM_CHORDS[t];
      melody = BGM_MELODY[t];
      step = 0;
      nextTime = c.currentTime + 0.05;
      if (!timer) timer = window.setInterval(schedule, 25);
    },
    setTempo(tempo: number): void {
      bpm = tempo;
    },
    stop(): void {
      clearInterval(timer);
      timer = 0;
    },
    get playing(): boolean {
      return timer !== 0;
    },
    get theme(): BgmTheme | null {
      return timer ? theme : null;
    },
  };
})();
