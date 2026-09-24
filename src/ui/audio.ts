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
    if (ctx.state === 'suspended') void ctx.resume();
  } catch {
    ctx = null;
  }
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
}

function tone({ type = 'square', freq, to, start = 0, dur, gain = 0.2, attack = 0.005, filter }: ToneOpts): void {
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
  node.connect(g).connect(master);
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
}

function noise(start: number, dur: number, gain: number, freq = 3000): void {
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
  src.connect(f).connect(g).connect(master);
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
  end(): void {
    tone({ type: 'triangle', freq: note(67), dur: 0.15, gain: 0.1 });
    tone({ type: 'triangle', freq: note(72), start: 0.15, dur: 0.3, gain: 0.1 });
  },
};

/** 確変中に流れる合成 BGM（スケジューラ方式） */
export const bgm = (() => {
  let timer = 0;
  let step = 0;
  let nextTime = 0;
  let bpm = 150;
  const chords = [
    [57, 60, 64, 69],
    [53, 57, 60, 65],
    [55, 59, 62, 67],
    [52, 56, 59, 64],
  ];
  const schedule = () => {
    const c = ready();
    if (!c || !master) return;
    const sixteenth = 60 / bpm / 4;
    while (nextTime < c.currentTime + 0.12) {
      const chord = chords[Math.floor(step / 16) % chords.length];
      const start = nextTime - c.currentTime;
      if (step % 4 === 0) {
        tone({ type: 'sawtooth', freq: note(chord[0] - 12), start, dur: sixteenth * 3, gain: 0.07, filter: 700 });
        tone({ type: 'sine', freq: 60, to: 40, start, dur: 0.12, gain: 0.25 });
      }
      if (step % 8 === 4) noise(start, 0.08, 0.06, 6000);
      const arp = chord[(step * 3) % chord.length] + 12 + (step % 16 >= 8 ? 12 : 0);
      tone({ type: 'square', freq: note(arp), start, dur: sixteenth * 0.9, gain: 0.025, filter: 3500 });
      step++;
      nextTime += sixteenth;
    }
  };
  return {
    start(tempo = 150): void {
      bpm = tempo;
      const c = ready();
      if (!c || timer) return;
      step = 0;
      nextTime = c.currentTime + 0.05;
      timer = window.setInterval(schedule, 25);
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
  };
})();
