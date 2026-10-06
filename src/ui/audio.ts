/**
 * パチンコ風の効果音と BGM。
 * 効果音は public/assets/sfx/*.mp3（tools/sfx.py で合成した音）を鳴らす。
 * 読み込み前・読み込めないときは、Web Audio の合成音（下の各関数の後半）で鳴らす。
 * BGM は public/assets/bgm/*.mp3（tools/bgm.py で合成した曲）。効果音と別の音量で鳴らす
 */

import { BGM_LOOPS, BGM_PAD, type BgmFile } from './bgmLoops';

let ctx: AudioContext | null = null;
/** 効果音の出力 */
let master: GainNode | null = null;
/** BGM の出力（効果音と別の音量） */
let bgmBus: GainNode | null = null;
let sfxOn = true;
let sfxVolume = 0.5;
let bgmVolume = 0.5;

/** 効果音の音量（0〜1） */
const SFX_GAIN = 0.6;
/** BGM のファイルの音量（効果音とのつり合い。BGM は後ろで鳴る音なので一段下げる） */
const BGM_GAIN = 0.15;

/**
 * 音量を決める。sfx・music は 0〜1（0 で鳴らさない）。
 * sfxAllowed=false は効果音だけ止める（稽古。BGM は鳴らす）
 */
export function configureAudio(sfx: number, music: number, sfxAllowed = true): void {
  sfxOn = sfxAllowed;
  sfxVolume = sfx;
  bgmVolume = music;
  if (master) master.gain.value = sfxVolume * SFX_GAIN;
  if (bgmBus) bgmBus.gain.value = bgmVolume * BGM_GAIN;
  bgm.refresh();
}

/** ユーザー操作の中で呼び、AudioContext を起こす */
export function unlockAudio(): void {
  if (sfxVolume <= 0 && bgmVolume <= 0) return;
  try {
    if (!ctx) {
      ctx = new AudioContext();
      const comp = ctx.createDynamicsCompressor();
      comp.connect(ctx.destination);
      master = ctx.createGain();
      master.gain.value = sfxVolume * SFX_GAIN;
      master.connect(comp);
      bgmBus = ctx.createGain();
      bgmBus.gain.value = bgmVolume * BGM_GAIN;
      bgmBus.connect(comp);
      loadSamples(ctx);
    }
    // iOS は画面ロックや別アプリから戻ると 'interrupted' になる
    if (ctx.state !== 'running') void ctx.resume();
    bgm.refresh();
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

/** 効果音を鳴らせるときの AudioContext */
function ready(): AudioContext | null {
  if (!sfxOn || !ctx || !master || sfxVolume <= 0) return null;
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

// ------------------------------------------------------------ 効果音のファイル

/** public/assets/sfx/ にある効果音（ファイル名＝名前） */
const SAMPLE_NAMES = [
  'key', 'back', 'reelStop0', 'reelStop1', 'reelStop2', 'reelTick', 'reach', 'gekiatsu', 'hit',
  'coin0', 'coin1', 'coin2', 'coin3', 'fanfare', 'yakuman', 'kakuhen', 'lampUp', 'miss', 'gyuin',
  'pushAppear', 'push', 'align', 'shatter', 'comboHit', 'glitch', 'swarm', 'step', 'stamp',
  'kakuhenEnd', 'god', 'register', 'chucker', 'round', 'gimmick', 'end', 'tap', 'tapClose',
] as const;
type SampleName = (typeof SAMPLE_NAMES)[number];

const samples = new Map<SampleName, AudioBuffer>();
/** ファイルの効果音の音量（合成音のころと同じくらいの大きさにそろえ、BGM とのつり合いを保つ） */
const SAMPLE_GAIN = 0.35;
let samplesRequested = false;

/** 効果音のファイルを読み込む（初めて音を鳴らせるようになったときに1回だけ） */
function loadSamples(c: AudioContext): void {
  if (samplesRequested) return;
  samplesRequested = true;
  for (const name of SAMPLE_NAMES) {
    fetch(`assets/sfx/${name}.mp3`)
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
      .then((b) => c.decodeAudioData(b))
      .then((buf) => samples.set(name, buf))
      .catch(() => undefined);
  }
}

/**
 * 効果音のファイルを鳴らす。鳴らせたら（または音が出せない設定なら）true、
 * まだ読み込めていなければ false（呼び出し側で合成音に切り替える）
 */
function play(name: SampleName, o: { rate?: number; gain?: number; start?: number } = {}): boolean {
  const c = ready();
  if (!c || !master) return true;
  const buf = samples.get(name);
  if (!buf) return false;
  const src = c.createBufferSource();
  src.buffer = buf;
  src.playbackRate.value = o.rate ?? 1;
  const g = c.createGain();
  g.gain.value = SAMPLE_GAIN * (o.gain ?? 1);
  src.connect(g).connect(master);
  src.start(c.currentTime + (o.start ?? 0));
  return true;
}

/** 半音 n 個ぶん高くする再生速度 */
const semis = (n: number) => 2 ** (n / 12);

export const sfx = {
  /** UI のタッチ音（ボタン・タブ・スイッチなど） */
  tap(): void {
    if (play('tap')) return;
    tone({ type: 'sine', freq: 1500, to: 950, dur: 0.05, gain: 0.05 });
  },
  /** 閉じる・戻るのタッチ音 */
  tapClose(): void {
    if (play('tapClose')) return;
    tone({ type: 'sine', freq: 1000, to: 600, dur: 0.07, gain: 0.05 });
  },
  key(): void {
    if (play('key')) return;
    tone({ type: 'triangle', freq: 1800, dur: 0.03, gain: 0.04 });
  },
  back(): void {
    if (play('back')) return;
    tone({ type: 'triangle', freq: 900, dur: 0.04, gain: 0.04 });
  },
  reelStop(i = 0): void {
    if (play(`reelStop${Math.min(Math.max(i, 0), 2)}` as SampleName)) return;
    tone({ type: 'square', freq: 520 + i * 90, dur: 0.07, gain: 0.12, filter: 2500 });
    noise(0, 0.05, 0.08, 2000);
  },
  reach(): void {
    if (play('reach')) return;
    tone({ type: 'sawtooth', freq: 300, to: 1200, dur: 0.45, gain: 0.14, filter: 3000 });
    tone({ type: 'square', freq: note(81), start: 0.45, dur: 0.12, gain: 0.12 });
    tone({ type: 'square', freq: note(81), start: 0.6, dur: 0.12, gain: 0.12 });
  },
  gekiatsu(): void {
    if (play('gekiatsu')) return;
    // キュイーン
    tone({ type: 'sawtooth', freq: 400, to: 2400, dur: 0.6, gain: 0.16, filter: 5000 });
    tone({ type: 'square', freq: 800, to: 3200, start: 0.05, dur: 0.55, gain: 0.08 });
    noise(0, 0.6, 0.05, 6000);
  },
  hit(): void {
    if (play('hit')) return;
    [72, 76, 79, 84].forEach((n, i) =>
      tone({ type: 'square', freq: note(n), start: i * 0.05, dur: 0.18, gain: 0.1, filter: 4000 }),
    );
  },
  coin(): void {
    if (play(`coin${Math.floor(Math.random() * 4)}` as SampleName, { rate: 0.97 + Math.random() * 0.06 })) return;
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
    if (play('fanfare')) return;
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
    if (play('yakuman')) {
      sfx.coins(24, 2);
      return;
    }
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
    if (play('kakuhen')) return;
    for (let i = 0; i < 12; i++) {
      tone({ type: 'square', freq: note(72 + ((i * 5) % 24)), start: i * 0.045, dur: 0.08, gain: 0.08 });
    }
    tone({ type: 'sawtooth', freq: 200, to: 1600, start: 0.55, dur: 0.5, gain: 0.1, filter: 3000 });
  },
  lampUp(): void {
    if (play('lampUp')) return;
    tone({ type: 'sine', freq: note(88), dur: 0.1, gain: 0.1 });
    tone({ type: 'sine', freq: note(93), start: 0.08, dur: 0.18, gain: 0.1 });
  },
  miss(): void {
    if (play('miss')) return;
    tone({ type: 'square', freq: 160, to: 110, dur: 0.35, gain: 0.12, filter: 900 });
  },
  reelTick(): void {
    if (play('reelTick', { rate: 0.94 + Math.random() * 0.14 })) return;
    tone({ type: 'square', freq: 1400 + Math.random() * 300, dur: 0.02, gain: 0.03, filter: 3000 });
  },
  gyuin(): void {
    if (play('gyuin')) return;
    tone({ type: 'sawtooth', freq: 180, to: 1400, dur: 0.35, gain: 0.14, filter: 2600 });
    tone({ type: 'sawtooth', freq: 1400, to: 300, start: 0.35, dur: 0.2, gain: 0.1, filter: 2600 });
    noise(0, 0.5, 0.06, 1200);
  },
  pushAppear(): void {
    if (play('pushAppear')) return;
    [0, 0.09, 0.18].forEach((t, i) => tone({ type: 'square', freq: note(84 + i * 2), start: t, dur: 0.08, gain: 0.1 }));
  },
  push(): void {
    if (play('push')) return;
    tone({ type: 'sine', freq: 90, to: 40, dur: 0.3, gain: 0.5 });
    noise(0, 0.15, 0.2, 800);
  },
  align(): void {
    if (play('align')) return;
    tone({ type: 'square', freq: note(96), dur: 0.08, gain: 0.12 });
    tone({ type: 'square', freq: note(100), start: 0.08, dur: 0.08, gain: 0.12 });
    tone({ type: 'square', freq: note(103), start: 0.16, dur: 0.3, gain: 0.12 });
  },
  shatter(): void {
    if (play('shatter')) return;
    noise(0, 0.5, 0.35, 5000);
    noise(0.02, 0.35, 0.2, 9000);
    tone({ type: 'sine', freq: 70, to: 35, dur: 0.5, gain: 0.5 });
  },
  /** 連チャン数に応じて音程が上がるヒット音 */
  comboHit(streak: number): void {
    if (play('comboHit', { rate: semis(Math.min(streak, 24)) })) return;
    const n = 72 + Math.min(streak, 24);
    tone({ type: 'square', freq: note(n), dur: 0.09, gain: 0.1, filter: 5000 });
    tone({ type: 'square', freq: note(n + 7), start: 0.06, dur: 0.12, gain: 0.08, filter: 5000 });
    tone({ type: 'sine', freq: note(n + 12), start: 0.06, dur: 0.25, gain: 0.06 });
  },
  glitch(): void {
    if (play('glitch')) return;
    noise(0, 0.12, 0.2, 400);
    tone({ type: 'square', freq: 90, dur: 0.18, gain: 0.1, filter: 600 });
    noise(0.14, 0.08, 0.15, 2500);
  },
  swarm(): void {
    if (play('swarm')) return;
    noise(0, 0.8, 0.12, 1500);
    tone({ type: 'sawtooth', freq: 200, to: 800, dur: 0.8, gain: 0.05, filter: 1500 });
  },
  step(i: number): void {
    if (play('step', { rate: semis(i * 3) })) return;
    tone({ type: 'square', freq: note(76 + i * 3), dur: 0.1, gain: 0.1 });
  },
  stamp(): void {
    if (play('stamp')) return;
    tone({ type: 'sine', freq: 140, to: 60, dur: 0.2, gain: 0.4 });
    tone({ type: 'square', freq: note(88), start: 0.02, dur: 0.1, gain: 0.08 });
  },
  kakuhenEnd(): void {
    if (play('kakuhenEnd')) return;
    [79, 74, 70, 67].forEach((n, i) => tone({ type: 'triangle', freq: note(n), start: i * 0.12, dur: 0.18, gain: 0.1 }));
    noise(0, 0.3, 0.12, 3000);
  },
  god(): void {
    if (play('god')) return;
    [60, 64, 67, 72, 76, 79, 84, 88].forEach((n, i) =>
      tone({ type: 'sawtooth', freq: note(n), start: i * 0.06, dur: 0.9 - i * 0.05, gain: 0.05, filter: 5000 }),
    );
    tone({ type: 'sine', freq: 55, dur: 1.2, gain: 0.4 });
  },
  /** 払い出し：レジのチャリーン */
  register(): void {
    if (play('register')) {
      sfx.coins(10, 1.2);
      return;
    }
    tone({ type: 'square', freq: note(88), dur: 0.08, gain: 0.1 });
    tone({ type: 'square', freq: note(93), start: 0.08, dur: 0.25, gain: 0.1 });
    noise(0.05, 0.3, 0.12, 7000);
    sfx.coins(10, 1.2);
  },
  chucker(): void {
    if (play('chucker')) return;
    tone({ type: 'square', freq: 1200, dur: 0.04, gain: 0.08 });
    tone({ type: 'triangle', freq: 700, start: 0.04, dur: 0.1, gain: 0.1 });
  },
  round(r: number): void {
    if (play('round', { rate: semis(r) })) {
      sfx.coin();
      return;
    }
    tone({ type: 'square', freq: note(72 + r), dur: 0.08, gain: 0.08 });
    sfx.coin();
  },
  gimmick(): void {
    if (play('gimmick')) return;
    tone({ type: 'sawtooth', freq: 900, to: 120, dur: 0.4, gain: 0.12, filter: 2000 });
    tone({ type: 'sine', freq: 80, to: 30, start: 0.38, dur: 0.5, gain: 0.5 });
    noise(0.38, 0.3, 0.3, 600);
  },
  end(): void {
    if (play('end')) return;
    tone({ type: 'triangle', freq: note(67), dur: 0.15, gain: 0.1 });
    tone({ type: 'triangle', freq: note(72), start: 0.15, dur: 0.3, gain: 0.1 });
  },
};

export type BgmTheme = 'bonus' | 'rush';
/** 場面の曲（固定）：スタート画面・パチンコの通常時・稽古 */
export type BgmScene = 'title' | 'normal' | 'keiko';
/** 交換所の BGM（BONUS・RUSH の曲） */
export const BGM_TRACKS = ['standard', 'euro', 'wa', 'chip', 'enka', 'jazz', 'metal'] as const;
export type BgmTrack = (typeof BGM_TRACKS)[number];

/** 曲の切り替えのクロスフェード（秒） */
const FADE = 0.4;
/** 超確変の再生速度 */
const FAST_RATE = 1.12;

/**
 * BGM（public/assets/bgm/*.mp3。tools/bgm.py で合成した曲）。
 * 場面の曲（scene）の上に、BONUS・RUSH の曲（play）をかぶせる。止めると場面の曲に戻る。
 * 曲は初めて要るときに読み込む。ファイルは前後に余白を付けた周期的な波形なので、
 * BGM_PAD 秒から1周ぶんをループさせると継ぎ目が出ない
 */
export const bgm = (() => {
  const buffers = new Map<BgmFile, AudioBuffer>();
  const loading = new Set<BgmFile>();
  let scene: BgmScene | null = null;
  let overlay: BgmTheme | null = null;
  let track: BgmTrack = 'standard';
  let fast = false;
  let preview: BgmFile | null = null;
  let previewTimer = 0;
  let current: { name: BgmFile; src: AudioBufferSourceNode; gain: GainNode } | null = null;

  const wanted = (): BgmFile | null => {
    if (preview) return preview;
    // スタート画面・物語を開いている間は、BONUS・RUSH の途中でもその曲にする
    if (overlay && scene !== 'title') return `${track}-${overlay}`;
    return scene;
  };

  const load = (c: AudioContext, name: BgmFile) => {
    if (buffers.has(name) || loading.has(name)) return;
    loading.add(name);
    fetch(`assets/bgm/${name}.mp3`)
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
      .then((b) => c.decodeAudioData(b))
      .then((buf) => {
        buffers.set(name, buf);
        sync();
      })
      .catch(() => undefined)
      .finally(() => loading.delete(name));
  };

  const fadeOut = (c: AudioContext) => {
    if (!current) return;
    const { src, gain } = current;
    const t = c.currentTime;
    gain.gain.cancelScheduledValues(t);
    gain.gain.setValueAtTime(gain.gain.value, t);
    gain.gain.linearRampToValueAtTime(0, t + FADE);
    src.stop(t + FADE + 0.05);
    current = null;
  };

  const sync = () => {
    const c = ctx;
    if (!c || !bgmBus) return;
    const name = bgmVolume > 0 ? wanted() : null;
    if (current && current.name === name) {
      current.src.playbackRate.value = fast && overlay === 'rush' && !preview ? FAST_RATE : 1;
      return;
    }
    if (!name) {
      fadeOut(c);
      return;
    }
    const buf = buffers.get(name);
    if (!buf) {
      // 読み込みが終わったらもう一度 sync する。それまでは前の曲を止めておく
      fadeOut(c);
      load(c, name);
      return;
    }
    fadeOut(c);
    const src = c.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    src.loopStart = BGM_PAD;
    src.loopEnd = BGM_PAD + BGM_LOOPS[name];
    src.playbackRate.value = fast && overlay === 'rush' && !preview ? FAST_RATE : 1;
    const gain = c.createGain();
    const t = c.currentTime;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(1, t + FADE);
    src.connect(gain).connect(bgmBus);
    src.start(t, BGM_PAD);
    current = { name, src, gain };
  };

  const endPreview = () => {
    clearTimeout(previewTimer);
    previewTimer = 0;
    preview = null;
  };

  return {
    /** 場面の曲を流す（null で止める） */
    scene(s: BgmScene | null): void {
      scene = s;
      sync();
    },
    /** BONUS・RUSH の曲をかぶせる。quick は超確変などでテンポを上げる */
    play(t: BgmTheme, quick = false): void {
      fast = quick;
      if (preview) endPreview();
      overlay = t;
      sync();
    },
    /** 超確変などでテンポを上げる */
    setFast(on: boolean): void {
      fast = on;
      sync();
    },
    /** 装備した曲に切り替える（鳴っている最中なら切り替える） */
    setTrack(t: BgmTrack): void {
      if (!BGM_TRACKS.includes(t)) return;
      track = t;
      sync();
    },
    /** 交換所の試聴：その曲の BONUS を数秒流す。本番の BONUS・RUSH の曲が鳴っている間はしない */
    preview(t: BgmTrack, ms = 6000): boolean {
      if (overlay || !ctx || bgmVolume <= 0 || !BGM_TRACKS.includes(t)) return false;
      if (ctx.state !== 'running') void ctx.resume().catch(() => undefined);
      clearTimeout(previewTimer);
      preview = `${t}-bonus`;
      previewTimer = window.setTimeout(() => {
        endPreview();
        sync();
      }, ms);
      sync();
      return true;
    },
    /** BONUS・RUSH の曲を止めて場面の曲に戻す。試聴中は force のときだけ止める */
    stop(force = false): void {
      if (preview && !force) return;
      endPreview();
      overlay = null;
      fast = false;
      sync();
    },
    /** 音量の変更や AudioContext を起こしたあとに、鳴らすべき曲に合わせ直す */
    refresh(): void {
      sync();
    },
    get playing(): boolean {
      return current !== null;
    },
    /** 鳴らしている（鳴らすはずの）曲のファイル名（動作確認用） */
    get file(): BgmFile | null {
      return bgmVolume > 0 ? wanted() : null;
    },
    get theme(): BgmTheme | null {
      return overlay && !preview ? overlay : null;
    },
  };
})();
