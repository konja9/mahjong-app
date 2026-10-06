#!/usr/bin/env python3
"""
効果音を合成して public/assets/sfx/*.mp3 に書き出す。

使い方：python3 tools/sfx.py        （numpy と ffmpeg が要る）
       python3 tools/sfx.py --wav  （確認用に WAV も残す）

方針：
- パチンコらしい「金属の玉」「リールの機械音」「派手なファンファーレ」を、倍音の重ね方と残響で作る
- 単純な波形（矩形波・ノコギリ波）はそのまま使わず、倍音を足し合わせて折り返しノイズを避ける
- どの音も、ピーク（最大の振幅）をそろえて書き出す。アプリ側はそのまま鳴らす
"""
from __future__ import annotations

import os
import subprocess
import sys
import tempfile
import wave

import numpy as np

SR = 44100
OUT = os.path.join(os.path.dirname(__file__), '..', 'public', 'assets', 'sfx')
RNG = np.random.default_rng(7)


# ------------------------------------------------------------ 基本の部品

def t_of(dur: float) -> np.ndarray:
    return np.arange(int(SR * dur)) / SR


def midi(n: float) -> float:
    return 440.0 * 2 ** ((n - 69) / 12)


def env_exp(dur: float, decay: float, attack: float = 0.002) -> np.ndarray:
    """立ち上がり attack 秒、そのあと decay 秒で 1/e に減る"""
    t = t_of(dur)
    e = np.exp(-np.maximum(t - attack, 0) / decay)
    a = np.clip(t / max(attack, 1e-4), 0, 1)
    return e * a


def env_adsr(dur: float, a: float, d: float, s: float, r: float) -> np.ndarray:
    t = t_of(dur)
    e = np.where(t < a, t / max(a, 1e-4), 1.0)
    e = np.where((t >= a) & (t < a + d), 1 - (1 - s) * (t - a) / max(d, 1e-4), e)
    e = np.where(t >= a + d, s, e)
    rel = np.clip((dur - t) / max(r, 1e-4), 0, 1)
    return e * rel


def phase(freq) -> np.ndarray:
    """周波数（定数か配列）から位相を積み上げる（音程の滑らかな変化に使う）"""
    f = np.asarray(freq, dtype=float)
    return 2 * np.pi * np.cumsum(f) / SR


def glide(f0: float, f1: float, dur: float, curve: str = 'exp') -> np.ndarray:
    t = t_of(dur) / dur
    if curve == 'exp':
        return f0 * (f1 / f0) ** t
    return f0 + (f1 - f0) * t


def additive(freq, dur: float, harmonics: list[tuple[float, float]], bright=None) -> np.ndarray:
    """倍音を足し合わせた音。harmonics は (倍率, 振幅)。bright は時間とともに高い倍音を減らす係数（0 で変化なし）"""
    n = int(SR * dur)
    f = np.broadcast_to(np.asarray(freq, dtype=float), (n,)) if np.ndim(freq) else np.full(n, float(freq))
    ph = phase(f)
    out = np.zeros(n)
    t = t_of(dur)
    for k, amp in harmonics:
        mask = (f * k) < SR * 0.45
        part = amp * np.sin(ph * k) * mask
        if bright:
            part *= np.exp(-t * bright * (k - 1))
        out += part
    return out


def saw_h(n: int = 24) -> list[tuple[float, float]]:
    return [(k, 1 / k) for k in range(1, n + 1)]


def square_h(n: int = 24) -> list[tuple[float, float]]:
    return [(k, 1 / k) for k in range(1, n + 1, 2)]


def brass(freq, dur: float, vib: float = 0.0) -> np.ndarray:
    """金管っぽい音：ノコギリ波の倍音に、吹き始めで明るく開く変化と、長い音のビブラート"""
    n = int(SR * dur)
    t = t_of(dur)
    f = np.full(n, float(freq))
    if vib:
        f = f * (1 + vib * np.sin(2 * np.pi * 5.5 * t) * np.clip((t - 0.15) / 0.2, 0, 1))
    ph = phase(f)
    out = np.zeros(n)
    # 吹き始めは高い倍音が遅れて立ち上がる
    for k in range(1, 20):
        if freq * k > SR * 0.45:
            break
        open_ = np.clip(t / (0.015 + 0.004 * k), 0, 1)
        out += (1 / k ** 1.1) * np.sin(ph * k) * open_
    return out * env_adsr(dur, 0.012, 0.08, 0.75, min(0.12, dur * 0.4))


def bell(freq: float, dur: float, decay: float = 0.4, bright: float = 1.0) -> np.ndarray:
    """ベル・チャイム：少しずれた倍音（金属らしさ）"""
    ratios = [(1, 1.0, 1.0), (2.0, 0.5, 0.7), (2.76, 0.35 * bright, 0.5), (5.4, 0.2 * bright, 0.3), (8.93, 0.1 * bright, 0.2)]
    t = t_of(dur)
    out = np.zeros_like(t)
    for r, a, d in ratios:
        if freq * r < SR * 0.45:
            out += a * np.sin(2 * np.pi * freq * r * t) * np.exp(-t / (decay * d))
    return out * np.clip(t / 0.002, 0, 1)


def metal(freq: float, dur: float, decay: float = 0.12, detune: float = 0.0) -> np.ndarray:
    """玉・コインの金属音：整数倍にならない倍音が速く減衰する"""
    ratios = [(1.0, 1.0, 1.0), (1.483, 0.7, 0.8), (2.11, 0.55, 0.6), (2.93, 0.4, 0.45), (3.81, 0.3, 0.35), (5.12, 0.18, 0.25)]
    t = t_of(dur)
    out = np.zeros_like(t)
    for r, a, d in ratios:
        f = freq * r * (1 + detune * RNG.uniform(-1, 1))
        if f < SR * 0.45:
            out += a * np.sin(2 * np.pi * f * t + RNG.uniform(0, 6.28)) * np.exp(-t / (decay * d))
    return out * np.clip(t / 0.0008, 0, 1)


def noise(dur: float) -> np.ndarray:
    return RNG.uniform(-1, 1, int(SR * dur))


def band(x: np.ndarray, lo: float, hi: float) -> np.ndarray:
    """FFT で帯域を切り出す（なだらかな肩つき）"""
    n = len(x)
    X = np.fft.rfft(x)
    f = np.fft.rfftfreq(n, 1 / SR)
    w = np.ones_like(f)
    if lo > 0:
        w *= 1 / (1 + (lo / np.maximum(f, 1)) ** 4)
    if hi < SR / 2:
        w *= 1 / (1 + (f / hi) ** 4)
    return np.fft.irfft(X * w, n)


def thump(f0: float, f1: float, dur: float, decay: float = 0.08) -> np.ndarray:
    """太鼓・ドン：音程が下がる低い正弦波"""
    return np.sin(phase(glide(f0, f1, dur))) * env_exp(dur, decay, 0.001)


def fade_tail(x: np.ndarray, ms: float = 8) -> np.ndarray:
    n = min(len(x), int(SR * ms / 1000))
    x = x.copy()
    x[-n:] *= np.linspace(1, 0, n)
    return x


def place(dst: np.ndarray, src: np.ndarray, at: float, gain: float = 1.0) -> np.ndarray:
    # 部品の終わりを短く絞って、ぶつ切りのプチッという音を防ぐ
    src = fade_tail(np.asarray(src, dtype=float), 5) if len(src) > SR * 0.012 else src
    i = int(at * SR)
    end = i + len(src)
    if end > len(dst):
        dst = np.concatenate([dst, np.zeros(end - len(dst))])
    dst[i:end] += src * gain
    return dst


def mix(dur: float, *parts: tuple[np.ndarray, float, float]) -> np.ndarray:
    """(音, 開始秒, 音量) を重ねる"""
    out = np.zeros(int(SR * dur))
    for x, at, g in parts:
        out = place(out, x, at, g)
    return out


def reverb(x: np.ndarray, time: float = 1.2, wet: float = 0.25, bright: float = 6000) -> np.ndarray:
    """ホールの残響：減衰するノイズのインパルス応答と畳み込む"""
    ir_n = int(SR * time)
    ir = RNG.normal(0, 1, ir_n) * np.exp(-np.arange(ir_n) / SR / (time / 6.9))
    ir = band(ir, 200, bright)
    ir /= np.sqrt(np.sum(ir ** 2))
    n = len(x) + ir_n
    size = 1 << (n - 1).bit_length()
    y = np.fft.irfft(np.fft.rfft(x, size) * np.fft.rfft(ir, size), size)[:n]
    dry = np.concatenate([x, np.zeros(ir_n)])
    return dry * (1 - wet * 0.5) + y * wet


def soft_clip(x: np.ndarray, drive: float = 1.5) -> np.ndarray:
    return np.tanh(x * drive) / np.tanh(drive)


def trim(x: np.ndarray, floor: float = 1e-3) -> np.ndarray:
    """末尾の無音を切る"""
    idx = np.where(np.abs(x) > floor * np.max(np.abs(x)))[0]
    return x[: idx[-1] + int(SR * 0.01)] if len(idx) else x


# ------------------------------------------------------------ 効果音

SOUNDS: dict[str, tuple[np.ndarray, float]] = {}


def sound(name: str, peak: float):
    def deco(fn):
        SOUNDS[name] = (fn, peak)
        return fn
    return deco


@sound('key', 0.22)
def key():
    # 小さなプラスチックのボタン
    return mix(0.05, (band(noise(0.006), 2500, 8000), 0, 0.5), (np.sin(2 * np.pi * 2100 * t_of(0.04)) * env_exp(0.04, 0.008), 0, 0.6))


@sound('back', 0.2)
def back():
    return mix(0.06, (band(noise(0.006), 1200, 5000), 0, 0.5), (np.sin(2 * np.pi * 1050 * t_of(0.05)) * env_exp(0.05, 0.01), 0, 0.6))


def reel_stop(i: int):
    # ガコッ：機械の止まる低い音＋カチッ＋少しの金属の響き
    body = thump(170 - i * 12, 70, 0.14, 0.04)
    click = band(noise(0.02), 1800, 6000) * env_exp(0.02, 0.004)
    ping = metal(950 + i * 110, 0.12, 0.05)
    return mix(0.16, (body, 0, 0.9), (click, 0, 0.55), (ping, 0.003, 0.18))


for _i in range(3):
    sound(f'reelStop{_i}', 0.55)(lambda i=_i: reel_stop(i))


@sound('reelTick', 0.12)
def reel_tick():
    return mix(0.02, (band(noise(0.004), 2000, 7000), 0, 0.6), (np.sin(2 * np.pi * 1600 * t_of(0.015)) * env_exp(0.015, 0.003), 0, 0.5))


@sound('reach', 0.6)
def reach():
    # ギューン（上がる）→ リーチの2連チャイム
    sweep = additive(glide(260, 1300, 0.42), 0.42, saw_h(16)) * env_adsr(0.42, 0.02, 0.1, 0.8, 0.05)
    sweep = band(sweep, 150, 5000)
    chime = bell(midi(81), 0.5, 0.25) + 0.4 * bell(midi(88), 0.5, 0.2)
    x = mix(1.2, (sweep, 0, 0.45), (chime, 0.44, 0.55), (chime, 0.62, 0.6))
    return reverb(x, 0.9, 0.22)


@sound('gekiatsu', 0.7)
def gekiatsu():
    # キュイン×2：揺れながら駆け上がる高い音
    def kyuin(d: float):
        f = glide(500, 2600, d) * (1 + 0.015 * np.sin(2 * np.pi * 28 * t_of(d)))
        a = additive(f, d, [(1, 1), (2, 0.5), (3, 0.3), (4, 0.2), (5, 0.12)])
        return a * env_adsr(d, 0.01, 0.05, 0.85, 0.06)
    shimmer = band(noise(0.7), 6000, 12000) * env_exp(0.7, 0.25)
    x = mix(0.9, (kyuin(0.22), 0, 0.5), (kyuin(0.45), 0.24, 0.6), (shimmer, 0, 0.12))
    return reverb(x, 0.8, 0.2)


@sound('hit', 0.55)
def hit():
    # キラキラの上がるアルペジオ（大当り確定の手前など）
    x = np.zeros(1)
    for i, n in enumerate([72, 76, 79, 84, 88]):
        x = place(x, bell(midi(n), 0.6, 0.18 + i * 0.03), i * 0.045, 0.5)
    sparkle = band(noise(0.4), 7000, 14000) * env_exp(0.4, 0.1)
    x = place(x, sparkle, 0.15, 0.08)
    return reverb(x, 0.9, 0.2)


def coin(k: int):
    # チャリン：高い金属の響き（1枚ごとに高さを変える）
    f = [2350, 2620, 2900, 3250][k]
    a = metal(f, 0.32, 0.16, detune=0.01)
    b = metal(f * 1.06, 0.25, 0.1, detune=0.01)
    tick = band(noise(0.004), 5000, 12000)
    return mix(0.36, (a, 0, 0.7), (b, 0.028, 0.45), (tick, 0, 0.3))


for _k in range(4):
    sound(f'coin{_k}', 0.32)(lambda k=_k: coin(k))


def chord(notes: list[int], dur: float, vib: float = 0.004) -> np.ndarray:
    out = sum(brass(midi(n), dur, vib) for n in notes)
    return out / len(notes) ** 0.6


@sound('fanfare', 0.8)
def fanfare():
    # パッパッパッ パー  パッパッ パーーー（金管＋ティンパニ＋シンバル）
    seq = [(67, 0, 0.11), (72, 0.12, 0.11), (76, 0.24, 0.11), (79, 0.36, 0.3), (76, 0.7, 0.11), (79, 0.82, 0.11), (84, 0.94, 0.75)]
    x = np.zeros(1)
    for n, s, d in seq:
        x = place(x, chord([n, n - 5, n - 12], d, 0.006 if d > 0.5 else 0), s, 0.55)
    timp = thump(110, 70, 0.5, 0.18)
    cym = band(noise(1.2), 4000, 14000) * env_exp(1.2, 0.35)
    x = place(x, timp, 0, 0.6)
    x = place(x, timp, 0.94, 0.7)
    x = place(x, cym, 0.94, 0.12)
    return reverb(x, 1.4, 0.25)


@sound('yakuman', 0.85)
def yakuman():
    # 地響き → 4段の和音が駆け上がる
    boom = mix(0.9, (thump(70, 35, 0.9, 0.3), 0, 1.0), (band(noise(0.5), 40, 300) * env_exp(0.5, 0.15), 0, 0.6))
    x = place(np.zeros(1), boom, 0, 1.0)
    chords = [[60, 64, 67], [62, 65, 69], [64, 67, 71], [65, 69, 72, 77]]
    for i, ch in enumerate(chords):
        d = 1.3 if i == 3 else 0.2
        x = place(x, chord([n + 12 for n in ch], d, 0.006 if i == 3 else 0), 0.5 + i * 0.22, 0.55)
    cym = band(noise(1.6), 4000, 14000) * env_exp(1.6, 0.5)
    x = place(x, cym, 1.16, 0.14)
    return reverb(x, 1.8, 0.3)


@sound('kakuhen', 0.7)
def kakuhen():
    # 確変：キラキラが一気に駆け上がり、最後に上昇音
    x = np.zeros(1)
    for i in range(12):
        x = place(x, bell(midi(72 + (i * 5) % 24 + (12 if i > 7 else 0)), 0.35, 0.12), i * 0.042, 0.35)
    sweep = additive(glide(220, 1700, 0.5), 0.5, saw_h(14)) * env_adsr(0.5, 0.02, 0.1, 0.8, 0.1)
    x = place(x, band(sweep, 150, 6000), 0.52, 0.3)
    return reverb(x, 1.1, 0.25)


@sound('lampUp', 0.4)
def lamp_up():
    return reverb(mix(0.4, (bell(midi(88), 0.3, 0.12), 0, 0.5), (bell(midi(93), 0.4, 0.18), 0.075, 0.55)), 0.6, 0.15)


@sound('miss', 0.28)
def miss():
    # ブブッ：低く濁った下がる音
    d = 0.32
    a = additive(glide(170, 105, d), d, square_h(12)) * env_adsr(d, 0.005, 0.05, 0.7, 0.08)
    a = band(a, 80, 1100)
    return soft_clip(a * 1.2)


@sound('gyuin', 0.6)
def gyuin():
    # ギュイーン：歪んだ上昇 → 下降
    up = additive(glide(170, 1400, 0.36), 0.36, saw_h(20))
    down = additive(glide(1400, 280, 0.22), 0.22, saw_h(20))
    x = np.concatenate([up * env_adsr(0.36, 0.02, 0.05, 1, 0.01), down * env_adsr(0.22, 0.001, 0.05, 0.8, 0.08)])
    x = soft_clip(band(x, 120, 3500) * 1.8, 2.2)
    x = place(x, band(noise(0.5), 600, 2500) * env_exp(0.5, 0.2), 0, 0.15)
    return reverb(x, 0.6, 0.15)


@sound('pushAppear', 0.45)
def push_appear():
    x = np.zeros(1)
    for i, n in enumerate([84, 86, 88]):
        x = place(x, additive(midi(n), 0.09, square_h(10)) * env_adsr(0.09, 0.003, 0.02, 0.7, 0.02), i * 0.09, 0.3)
    return reverb(x, 0.5, 0.12)


@sound('push', 0.85)
def push():
    # ドンッ：重い打撃＋空気の振動
    boom = thump(110, 38, 0.45, 0.12)
    hitn = band(noise(0.15), 200, 2500) * env_exp(0.15, 0.03)
    click = band(noise(0.006), 2000, 8000)
    return soft_clip(mix(0.5, (boom, 0, 1.0), (hitn, 0, 0.45), (click, 0, 0.3)), 1.4)


@sound('align', 0.55)
def align():
    # 7・7・7 がそろう：高いチャイム3つ
    x = mix(0.9, (bell(midi(96), 0.3, 0.1), 0, 0.45), (bell(midi(100), 0.3, 0.1), 0.08, 0.45), (bell(midi(103), 0.8, 0.3), 0.16, 0.55))
    return reverb(x, 0.9, 0.2)


@sound('shatter', 0.8)
def shatter():
    # ガラスが割れる：細かい破片の金属音がばらけて鳴る＋低い衝撃
    x = np.zeros(int(SR * 0.7))
    for _ in range(40):
        f = RNG.uniform(2500, 9000)
        x = place(x, metal(f, 0.12, RNG.uniform(0.02, 0.06)), RNG.uniform(0, 0.35) ** 1.6, RNG.uniform(0.05, 0.18))
    crack = band(noise(0.5), 3000, 14000) * env_exp(0.5, 0.08)
    boom = thump(80, 35, 0.5, 0.15)
    x = place(x, crack, 0, 0.5)
    x = place(x, boom, 0, 0.7)
    return reverb(x, 0.8, 0.18)


@sound('comboHit', 0.4)
def combo_hit():
    # 連続正解：アプリ側で再生速度を変えて音程を上げる（基準は C5）
    n = 72
    return reverb(mix(0.5, (bell(midi(n), 0.2, 0.08), 0, 0.4), (bell(midi(n + 7), 0.3, 0.12), 0.055, 0.4), (bell(midi(n + 12), 0.4, 0.2), 0.055, 0.25)), 0.5, 0.12)


@sound('glitch', 0.45)
def glitch():
    # ジジッ：ビットの粗いノイズ
    n = noise(0.3)
    crushed = np.round(n * 3) / 3
    crushed = np.repeat(crushed[::18], 18)[: len(n)]
    a = band(crushed, 200, 3000) * env_exp(0.3, 0.08)
    low = additive(90, 0.18, square_h(8)) * env_exp(0.18, 0.06)
    return mix(0.35, (a[: int(SR * 0.12)], 0, 0.6), (low, 0, 0.35), (a[: int(SR * 0.08)], 0.14, 0.5))


@sound('swarm', 0.5)
def swarm():
    d = 0.85
    rise = band(noise(d), 800, 4000) * np.linspace(0.2, 1, int(SR * d)) * env_adsr(d, 0.05, 0.1, 1, 0.15)
    s = band(additive(glide(200, 850, d), d, saw_h(12)), 100, 2500) * env_adsr(d, 0.1, 0.1, 0.8, 0.15)
    return mix(d, (rise, 0, 0.5), (s, 0, 0.25))


@sound('step', 0.4)
def step():
    # 段階を進める音（アプリ側で再生速度を変えて音程を上げる。基準は E5）
    return reverb(bell(midi(76), 0.3, 0.1) * 0.6 + additive(midi(76), 0.3, square_h(6)) * env_exp(0.3, 0.04) * 0.25, 0.4, 0.1)


@sound('stamp', 0.6)
def stamp():
    return mix(0.35, (thump(160, 60, 0.25, 0.06), 0, 0.9), (bell(midi(88), 0.25, 0.08), 0.015, 0.25), (band(noise(0.01), 1500, 6000), 0, 0.3))


@sound('kakuhenEnd', 0.45)
def kakuhen_end():
    x = np.zeros(1)
    for i, n in enumerate([79, 74, 70, 67]):
        x = place(x, additive(midi(n), 0.22, [(1, 1), (3, 0.12), (5, 0.04)]) * env_adsr(0.22, 0.005, 0.05, 0.7, 0.1), i * 0.12, 0.4)
    x = place(x, band(noise(0.35), 2500, 8000) * env_exp(0.35, 0.1), 0, 0.12)
    return reverb(x, 0.9, 0.2)


@sound('god', 0.85)
def god():
    # 神々しい：和音が下から積み上がって広がる
    x = np.zeros(1)
    for i, n in enumerate([48, 55, 60, 64, 67, 72, 76, 79, 84]):
        d = 1.6 - i * 0.06
        pad = additive(midi(n) * (1 + 0.002 * (i % 3 - 1)), d, saw_h(10)) * env_adsr(d, 0.15, 0.2, 0.7, 0.6)
        x = place(x, band(pad, 80, 5000), i * 0.06, 0.18)
    x = place(x, thump(60, 40, 1.2, 0.5), 0, 0.6)
    x = place(x, band(noise(1.5), 6000, 14000) * env_exp(1.5, 0.4), 0.3, 0.06)
    return reverb(x, 2.2, 0.35)


@sound('register', 0.55)
def register():
    # チーン（コインはアプリ側で別に鳴らす）
    ding = bell(midi(91), 0.9, 0.45, bright=1.3)
    drawer = band(noise(0.25), 800, 5000) * env_exp(0.25, 0.05)
    return reverb(mix(1.0, (drawer, 0, 0.25), (ding, 0.03, 0.6), (metal(1400, 0.1, 0.03), 0, 0.2)), 0.8, 0.15)


@sound('chucker', 0.4)
def chucker():
    # 玉が始動口に入る：カコン
    return mix(0.18, (metal(1500, 0.08, 0.035), 0, 0.5), (thump(720, 500, 0.12, 0.03), 0.035, 0.6), (band(noise(0.005), 3000, 9000), 0, 0.25))


@sound('round', 0.35)
def round_():
    # ラウンドの進み（アプリ側で再生速度を変える。基準は C5）
    return bell(midi(72), 0.25, 0.08) * 0.6 + additive(midi(72), 0.25, square_h(6)) * env_exp(0.25, 0.04) * 0.3


@sound('gimmick', 0.85)
def gimmick():
    # 役物が落ちてくる：ヒューン → ドーン
    d = 0.4
    fall = band(additive(glide(950, 130, d), d, saw_h(14)), 100, 3000) * env_adsr(d, 0.01, 0.05, 0.9, 0.03)
    boom = mix(0.7, (thump(90, 32, 0.7, 0.22), 0, 1.0), (band(noise(0.4), 80, 900) * env_exp(0.4, 0.1), 0, 0.5))
    return reverb(soft_clip(mix(1.1, (fall, 0, 0.35), (boom, 0.38, 1.0)), 1.3), 0.9, 0.15)


@sound('end', 0.4)
def end():
    x = mix(0.6, (bell(midi(67), 0.3, 0.12), 0, 0.45), (bell(midi(72), 0.5, 0.25), 0.15, 0.5))
    return reverb(x, 0.7, 0.15)


@sound('tap', 0.2)
def tap():
    # UI のタッチ音：小さく丸い「ポッ」（何度押してもうるさくないよう、短く柔らかく）
    d = 0.06
    body = np.sin(phase(glide(1500, 950, d))) * env_exp(d, 0.012, 0.001)
    click = band(noise(0.003), 3000, 9000)
    return mix(d, (body, 0, 0.8), (click, 0, 0.18))


@sound('tapClose', 0.18)
def tap_close():
    # 閉じる・戻る：少し低く、下がる「ポン」
    d = 0.08
    body = np.sin(phase(glide(1000, 600, d))) * env_exp(d, 0.016, 0.001)
    click = band(noise(0.003), 2000, 7000)
    return mix(d, (body, 0, 0.8), (click, 0, 0.15))


# ------------------------------------------------------------ 書き出し

def write_wav(path: str, x: np.ndarray) -> None:
    data = (np.clip(x, -1, 1) * 32767).astype('<i2').tobytes()
    with wave.open(path, 'wb') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(data)


def main() -> None:
    keep_wav = '--wav' in sys.argv
    os.makedirs(OUT, exist_ok=True)
    total = 0
    with tempfile.TemporaryDirectory() as tmp:
        for name, (fn, peak) in SOUNDS.items():
            x = fade_tail(trim(np.asarray(fn(), dtype=float)))
            x = x / (np.max(np.abs(x)) + 1e-9) * peak
            wav = os.path.join(OUT if keep_wav else tmp, f'{name}.wav')
            write_wav(wav, x)
            mp3 = os.path.join(OUT, f'{name}.mp3')
            subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', wav, '-ac', '1', '-ar', '44100', '-b:a', '96k', mp3], check=True)
            size = os.path.getsize(mp3)
            total += size
            print(f'{name:12s} {len(x) / SR:5.2f}s  {size / 1024:5.1f}KB')
    print(f'合計 {len(SOUNDS)}本 {total / 1024:.0f}KB')


if __name__ == '__main__':
    main()
