#!/usr/bin/env python3
"""
BGM を合成して public/assets/bgm/*.mp3 に書き出す。ループ1周の長さは src/ui/bgmLoops.ts に書く。

使い方：python3 tools/bgm.py              （numpy と ffmpeg が要る）
       python3 tools/bgm.py --wav        （確認用に WAV も残す）
       python3 tools/bgm.py title rush    （名前の一部が合う曲だけ作る）

方針：
- 楽譜（コード進行・8分音符のメロディ・16分のパターン）をデータで持ち、小さなシーケンサーで鳴らす
- 音色は tools/sfx.py の部品（倍音の足し合わせ・金管・ベル・残響）を使う
- 継ぎ目なしのループ：ループ1周ぶんを作り、はみ出した余韻を頭に重ねる（円環）。
  ファイルは「末尾 PAD 秒 + 1周 + 先頭 PAD 秒」にして書く。MP3 は頭に無音（エンコーダーの遅延）が入るが、
  ファイル全体が周期的なので、アプリは PAD 秒から 1周ぶんをループさせれば遅延の量によらず継ぎ目が出ない
- スマホのスピーカーは低音がほとんど出ないので、曲の輪郭は中高音（メロディ・和音）で作り、ベースにも倍音を持たせる
"""
from __future__ import annotations

import functools
import os
import subprocess
import sys
import tempfile

import numpy as np

sys.path.insert(0, os.path.dirname(__file__))
from sfx import (  # noqa: E402
    SR, additive, band, bell, brass, env_adsr, env_exp, glide, metal, midi, phase, reverb,
    saw_h, soft_clip, square_h, t_of, thump, write_wav,
)

ROOT = os.path.join(os.path.dirname(__file__), '..')
OUT = os.path.join(ROOT, 'public', 'assets', 'bgm')
TS_OUT = os.path.join(ROOT, 'src', 'ui', 'bgmLoops.ts')
PAD = 0.5
# BONUS・RUSH の曲を下げる量（dB）
OVERLAY_TRIM = 3
RNG = np.random.default_rng(11)


def noise(dur: float) -> np.ndarray:
    return RNG.uniform(-1, 1, int(SR * dur))


# ------------------------------------------------------------ 音色（同じ高さ・長さはキャッシュする）

def cached(fn):
    @functools.lru_cache(maxsize=4096)
    def inner(f: float, d: float) -> np.ndarray:
        x = fn(f, d)
        x.setflags(write=False)
        return x
    return lambda f, d: inner(round(f, 3), round(d, 4))


def env_note(d: float, a=0.005, dec=0.08, s=0.7, r=0.04) -> np.ndarray:
    return env_adsr(d, a, dec, s, min(r, d * 0.4))


def vib(f: float, d: float, depth=0.006, rate=5.5, delay=0.18) -> np.ndarray:
    t = t_of(d)
    return f * (1 + depth * np.sin(2 * np.pi * rate * t) * np.clip((t - delay) / 0.2, 0, 1))


@cached
def i_square(f, d):
    return additive(vib(f, d, 0.004), d, square_h(15)) * env_note(d, 0.004, 0.06, 0.75, 0.04)


@cached
def i_chip(f, d):
    # 8bit：折り返しのない矩形波（25% デューティっぽく偶数倍音も少し）
    h = [(k, (1 / k) * (1.0 if k % 2 else 0.45)) for k in range(1, 30)]
    return additive(f, d, h) * env_adsr(d, 0.002, 0.03, 0.8, min(0.02, d * 0.3))


@cached
def i_tri(f, d):
    return additive(f, d, [(k, 1 / k ** 2) for k in range(1, 16, 2)] + [(2, 0.25)]) * env_adsr(d, 0.002, 0.02, 0.9, min(0.02, d * 0.3))


@cached
def i_saw(f, d):
    return additive(vib(f, d, 0.005), d, saw_h(18)) * env_note(d)


@cached
def i_super(f, d):
    # ユーロビートのリード：少しずつずらしたノコギリ波を3つ
    x = sum(additive(vib(f * c, d, 0.004), d, saw_h(16)) for c in (1, 1.006, 0.994))
    return x / 3 * env_note(d, 0.004, 0.1, 0.7, 0.05)


@cached
def i_brass(f, d):
    return brass(f, d, 0.006 if d > 0.3 else 0)


@cached
def i_sax(f, d):
    x = brass(f, d, 0.012 if d > 0.25 else 0.003)
    breath = band(noise(d), f * 1.5, f * 5) * env_adsr(d, 0.02, 0.05, 0.3, 0.05) * 0.06
    return band(x + breath, 180, 3800)


@cached
def i_bell(f, d):
    return bell(f, max(d, 0.6), 0.45)[: int(SR * max(d, 0.6))]


@cached
def i_vibe(f, d):
    # ヴィブラフォン：柔らかいベルにゆっくりしたトレモロ
    dd = max(d, 0.9)
    t = t_of(dd)
    x = additive(f, dd, [(1, 1), (4, 0.12), (10, 0.03)]) * env_exp(dd, 0.6, 0.003)
    return x * (1 - 0.25 * (1 + np.sin(2 * np.pi * 5 * t)) / 2)


@cached
def i_ep(f, d):
    dd = max(d, 0.5)
    x = additive(f, dd, [(1, 1), (2, 0.35), (3, 0.12)]) * env_exp(dd, 0.7, 0.003)
    tine = bell(f * 2, dd, 0.12, 0.6) * 0.12
    return (x + tine) * env_adsr(dd, 0.001, 0.0, 1.0, min(0.08, dd * 0.3))


@cached
def i_piano(f, d):
    dd = max(d, 0.4)
    x = additive(f, dd, [(1, 1), (2, 0.5), (3, 0.3), (4, 0.18), (5, 0.1), (6, 0.06)], bright=3) * env_exp(dd, 0.5, 0.002)
    return x * env_adsr(dd, 0.001, 0, 1, min(0.06, dd * 0.3))


@cached
def i_koto(f, d):
    # 琴：はじいた瞬間だけ明るく、すぐ丸くなる。はじき始めに少しだけ音程が上ずる
    dd = max(d, 0.6)
    t = t_of(dd)
    ff = f * (1 + 0.012 * np.exp(-t / 0.02))
    return additive(ff, dd, [(1, 1), (2, 0.7), (3, 0.45), (4, 0.3), (5, 0.18), (6, 0.12), (8, 0.06)], bright=7) * env_exp(dd, 0.45, 0.001)


@cached
def i_shami(f, d):
    # 三味線：硬く短いはじき（さわりのビリつきを高い倍音で）
    dd = max(d, 0.35)
    x = additive(f, dd, [(k, 1 / k ** 0.7) for k in range(1, 14)], bright=12) * env_exp(dd, 0.18, 0.001)
    click = band(noise(0.01), 2000, 6000) * 0.3
    x[: len(click)] += click
    return x


@cached
def i_flute(f, d):
    # 尺八・笛：正弦波に息の音、遅れて深くかかるビブラート
    ff = vib(f, d, 0.012, 5.2, 0.15)
    x = additive(ff, d, [(1, 1), (2, 0.18), (3, 0.08)])
    breath = band(noise(d), f * 0.8, f * 3.5) * 0.12
    return (x + breath) * env_adsr(d, 0.05, 0.1, 0.85, min(0.08, d * 0.4))


@cached
def i_strings(f, d):
    x = sum(additive(vib(f * c, d, 0.005, 5.0, 0.1), d, saw_h(10)) for c in (1, 1.004, 0.996))
    return band(x / 3, 150, 5000) * env_adsr(d, min(0.12, d * 0.3), 0.1, 0.85, min(0.25, d * 0.4))


@cached
def i_pad(f, d):
    x = sum(additive(f * c, d, saw_h(6)) for c in (1, 1.005, 0.995))
    return x / 3 * env_adsr(d, min(0.25, d * 0.3), 0.2, 0.8, min(0.3, d * 0.4))


@cached
def i_organ(f, d):
    x = additive(vib(f, d, 0.003, 6.5, 0.0), d, [(1, 1), (2, 0.8), (3, 0.5), (4, 0.35), (6, 0.25), (8, 0.18)])
    return x * env_adsr(d, 0.004, 0.02, 0.9, min(0.03, d * 0.3))


@cached
def i_guitar(f, d):
    # 歪んだギター：ルート・5度・オクターブを重ねて強く歪ませる（パワーコード）
    x = sum(additive(f * r, d, saw_h(10)) * g for r, g in ((1, 1), (1.4983, 0.8), (2, 0.6)))
    x = soft_clip(x * 0.6, 5)
    return band(x, 90, 4200) * env_adsr(d, 0.003, 0.05, 0.85, min(0.03, d * 0.3))


@cached
def i_mute(f, d):
    # ブリッジミュートの刻み：短く詰まった歪み
    dd = min(d, 0.12)
    x = sum(additive(f * r, dd, saw_h(10)) for r in (1, 1.4983))
    return band(soft_clip(x * 0.7, 5), 80, 2500) * env_exp(dd, 0.04, 0.002)


@cached
def i_lead_gtr(f, d):
    x = additive(vib(f, d, 0.01, 6, 0.12), d, saw_h(14))
    return band(soft_clip(x * 0.8, 4), 200, 4500) * env_note(d, 0.004, 0.05, 0.85, 0.05)


@cached
def b_saw(f, d):
    return additive(f, d, saw_h(12)) * env_adsr(d, 0.004, 0.1, 0.65, min(0.03, d * 0.3))


@cached
def b_sine(f, d):
    # 低音が出ないスピーカーでも聞こえるよう、2〜3倍の倍音を持たせる
    return additive(f, d, [(1, 1), (2, 0.55), (3, 0.25)]) * env_adsr(d, 0.006, 0.15, 0.7, min(0.05, d * 0.3))


@cached
def b_up(f, d):
    # ウッドベース：はじいて減衰する
    dd = max(d, 0.3)
    return additive(f, dd, [(1, 1), (2, 0.6), (3, 0.3), (4, 0.15)], bright=4) * env_exp(dd, 0.35, 0.003)


@cached
def b_pluck(f, d):
    return additive(f, d, [(1, 1), (2, 0.7), (3, 0.4), (4, 0.2)], bright=5) * env_exp(d, 0.25, 0.002)


# ------------------------------------------------------------ 打楽器（ピークを 1 にそろえる）

def over(*xs) -> np.ndarray:
    """長さの違う音を頭そろえで足す"""
    n = max(len(x) for x in xs)
    out = np.zeros(n)
    for x in xs:
        out[: len(x)] += x
    return out


def norm(x):
    return x / (np.max(np.abs(x)) + 1e-9)


@functools.lru_cache(maxsize=None)
def drum(name: str) -> np.ndarray:
    if name == 'kick':
        x = over(thump(150, 48, 0.32, 0.08), band(noise(0.006), 2000, 8000) * 0.4)
    elif name == 'kick2':  # メタルのツーバス（短く硬い）
        x = over(thump(170, 60, 0.12, 0.035), band(noise(0.004), 3000, 9000) * 0.6)
    elif name == 'snare':
        x = over(band(noise(0.22), 1200, 8000) * env_exp(0.22, 0.06) * 0.8, np.sin(phase(glide(240, 180, 0.12))) * env_exp(0.12, 0.04))
    elif name == 'clap':
        x = np.zeros(int(SR * 0.25))
        for k, at in enumerate((0, 0.011, 0.022)):
            b = band(noise(0.2), 900, 5000) * env_exp(0.2, 0.012 if k < 2 else 0.07)
            i = int(at * SR)
            x[i:i + len(b)] += b[: len(x) - i]
    elif name == 'rim':
        x = over(np.sin(2 * np.pi * 1700 * t_of(0.04)) * env_exp(0.04, 0.008), band(noise(0.02), 2000, 6000) * env_exp(0.02, 0.004) * 0.6)
    elif name == 'brush':
        x = band(noise(0.25), 1500, 9000) * env_adsr(0.25, 0.02, 0.05, 0.4, 0.15)
    elif name == 'hat':
        x = band(noise(0.06), 7000, 16000) * env_exp(0.06, 0.014)
    elif name == 'ohat':
        x = band(noise(0.3), 6000, 16000) * env_exp(0.3, 0.09)
    elif name == 'ride':
        x = metal(3200, 0.6, 0.35) * 0.4 + band(noise(0.6), 5000, 14000) * env_exp(0.6, 0.2) * 0.6
    elif name == 'crash':
        x = band(noise(1.8), 3000, 15000) * env_exp(1.8, 0.55, 0.002)
    elif name == 'taiko':
        x = over(thump(105, 55, 0.6, 0.18), band(noise(0.05), 100, 1200) * env_exp(0.05, 0.015) * 0.5)
    elif name == 'shime':  # 締太鼓：高く乾いた音
        x = over(thump(420, 300, 0.1, 0.03), band(noise(0.02), 1000, 5000) * env_exp(0.02, 0.006) * 0.5)
    elif name == 'kane':  # 鉦：チャンチキの金属音
        x = metal(1900, 0.35, 0.12)
    elif name == 'tom':
        x = thump(160, 95, 0.3, 0.1)
    elif name == 'tamb':
        x = band(noise(0.12), 5000, 14000) * env_exp(0.12, 0.04)
    elif name == 'nkick':  # 8bit のキック
        x = additive(glide(220, 50, 0.1), 0.1, square_h(9)) * env_exp(0.1, 0.035)
    elif name == 'nsnare':
        x = RNG.uniform(-1, 1, int(SR * 0.12)) * env_exp(0.12, 0.04)
    elif name == 'nhat':
        x = band(RNG.uniform(-1, 1, int(SR * 0.03)), 6000, 16000) * env_exp(0.03, 0.008)
    else:
        raise KeyError(name)
    return norm(x)


# ------------------------------------------------------------ 楽譜

PCS = {'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11}
QUAL = {
    '': [0, 4, 7], 'm': [0, 3, 7], '7': [0, 4, 7, 10], 'm7': [0, 3, 7, 10], 'M7': [0, 4, 7, 11],
    'm7b5': [0, 3, 6, 10], 'dim': [0, 3, 6], 'sus4': [0, 5, 7], '5': [0, 7], '6': [0, 4, 7, 9], 'm6': [0, 3, 7, 9],
}


def note(tok: str) -> int:
    """'C#5' → 73。数字だけなら MIDI 番号"""
    if tok.lstrip('-').isdigit():
        return int(tok)
    pc = PCS[tok[0]]
    i = 1
    while i < len(tok) and tok[i] in '#b':
        pc += 1 if tok[i] == '#' else -1
        i += 1
    return 12 * (int(tok[i:]) + 1) + pc


def chord(name: str) -> tuple[int, list[int]]:
    """'F#m7' → (根音の音名 0..11, 根音からの音程)"""
    pc = PCS[name[0]]
    i = 1
    while i < len(name) and name[i] in '#b':
        pc += 1 if name[i] == '#' else -1
        i += 1
    return pc % 12, QUAL[name[i:]]


def parse_mel(s) -> list:
    """8分音符の並び。数字か音名＝鳴らす、'-'＝前の音を伸ばす、'.'＝休み。'|' は読みやすさのための区切り"""
    if isinstance(s, list):
        return [('.' if v is None else v) for v in s]
    return [t if t in '-.' else note(t) for t in s.replace('|', ' ').split()]


class Song:
    def __init__(self, name, tempo, sections, form, layers, swing=0.0, level=-16.0, rev=(1.4, 0.22), fill='snare'):
        self.name, self.tempo, self.swing, self.level, self.rev, self.fill = name, tempo, swing, level, rev, fill
        self.bars = []  # 1小節ずつ：(コードの並び（半小節ずつにもなる）, メロディ8つ, 区切りの頭か, 区切りの終わりか)
        for k, sec in enumerate(form):
            chords, mel = sections[sec]
            mel = parse_mel(mel)
            assert len(mel) == len(chords) * 8, (name, sec, len(mel), len(chords))
            for b, c in enumerate(chords):
                self.bars.append((c.split(','), mel[b * 8:(b + 1) * 8], b == 0, b == len(chords) - 1))
        self.layers = layers

    @property
    def step(self) -> float:
        return 60 / self.tempo / 4

    @property
    def length(self) -> float:
        return len(self.bars) * 16 * self.step

    def t(self, bar: int, s: float) -> float:
        """小節 bar の 16分の s 番目の時刻（スウィングは裏の8分を遅らせる）"""
        si = int(s)
        sw = self.swing * self.step if si % 4 == 2 else 0
        return (bar * 16 + s) * self.step + sw

    def chord_at(self, bar: int, s: int) -> tuple[int, list[int]]:
        cs = self.bars[bar][0]
        return chord(cs[0] if len(cs) == 1 or s < 8 else cs[1])


def voice(root: int, ivs: list[int], lo: int, hi: int) -> list[int]:
    """和音の構成音を lo 以上 hi 未満に並べる"""
    pcs = {(root + i) % 12 for i in ivs}
    return [n for n in range(lo, hi) if n % 12 in pcs]


def bass_note(root: int, ivs: list[int], ch: str, base: int) -> int:
    r = base + (root - base) % 12
    off = {'r': 0, 'o': 12, '5': 7, '3': ivs[1] if len(ivs) > 1 else 4, '7': ivs[3] if len(ivs) > 3 else 10, 'b': -12}[ch]
    if ch == '5' and len(ivs) > 2 and ivs[2] == 6:
        off = 6
    return r + off


# ------------------------------------------------------------ レイヤーの描画

class Buf:
    def __init__(self, n: int):
        self.x = np.zeros(n)

    def add(self, src: np.ndarray, at: float, g: float = 1.0):
        i = int(round(at * SR))
        if i < 0 or g == 0:
            return
        end = i + len(src)
        if end > len(self.x):
            self.x = np.concatenate([self.x, np.zeros(end - len(self.x) + SR)])
        self.x[i:end] += src * g


def pat_at(pat: str, bar: int) -> str:
    p = pat.replace(' ', '').replace('|', '')
    n = len(p) // 16
    return p[(bar % n) * 16:(bar % n + 1) * 16]


def runs(p: str, play: str):
    """パターンの中の鳴らす位置と長さ（次に鳴らすか '_' まで。'.' は伸ばす）"""
    out = []
    for s, ch in enumerate(p):
        if ch in play:
            e = s + 1
            while e < 16 and p[e] == '.':
                e += 1
            out.append((s, e - s, ch))
    return out


def render_layer(song: Song, L: dict) -> np.ndarray:
    buf = Buf(int(song.length * SR) + SR * 3)
    kind = L['kind']
    st = song.step
    nb = len(song.bars)
    for bar in range(nb):
        _, mel, head, tail = song.bars[bar]
        if kind == 'drum':
            p = pat_at(L['pat'], bar)
            if tail and bar == nb - 1 and L.get('fill_pat'):
                p = L['fill_pat']
            elif tail and L.get('tail_pat'):
                p = L['tail_pat']
            for s, ch in enumerate(p):
                if ch in 'xXg':
                    g = {'x': 0.8, 'X': 1.0, 'g': 0.35}[ch]
                    hum = RNG.uniform(0.92, 1.0)
                    buf.add(drum(L['inst']), song.t(bar, s), g * hum)
        elif kind == 'crash':
            if head and (bar % 8 == 0):
                buf.add(drum('crash'), song.t(bar, 0), 1.0)
        elif kind == 'fill':
            # 最後の小節の後半に、だんだん強くなる16分のロール（ループの頭に戻る合図）
            if bar == nb - 1:
                for s in range(8, 16):
                    buf.add(drum(L['inst']), song.t(bar, s), 0.35 + 0.08 * (s - 8))
        elif kind == 'bass':
            p = pat_at(L['pat'], bar)
            for s, n, ch in runs(p, 'ro53 7b'):
                root, ivs = song.chord_at(bar, s)
                f = midi(bass_note(root, ivs, ch, L.get('base', 33)))
                buf.add(L['inst'](f, n * st * L.get('gate', 0.92)), song.t(bar, s))
        elif kind == 'walk':
            # ウッドベースのウォーキング：1拍目は根音、2・3拍目は和音の音、4拍目は次の根音へ半音で近づく
            for beat in range(4):
                s = beat * 4
                root, ivs = song.chord_at(bar, s)
                base = L.get('base', 36)
                r = base + (root - base) % 12
                if beat == 0:
                    n = r
                elif beat == 3:
                    nroot, _ = song.chord_at((bar + (1 if s >= 8 else 0)) % nb, 0 if s >= 8 else 8)
                    nr = base + (nroot - base) % 12
                    n = nr + (1 if (bar + beat) % 2 else -1)
                else:
                    n = r + ivs[min(beat, len(ivs) - 1)]
                buf.add(L['inst'](midi(n), st * 3.6), song.t(bar, s), RNG.uniform(0.85, 1))
        elif kind == 'comp':
            p = pat_at(L['pat'], bar)
            lo, hi = L.get('range', (55, 72))
            for s, n, ch in runs(p, 'x'):
                root, ivs = song.chord_at(bar, s)
                notes = voice(root, ivs, lo, hi)
                if L.get('top'):
                    notes = notes[-L['top']:]
                d = n * st * L.get('gate', 0.9)
                for k, m in enumerate(notes):
                    buf.add(L['inst'](midi(m), d), song.t(bar, s) + k * L.get('strum', 0), 1 / len(notes) ** 0.5)
        elif kind == 'power':
            p = pat_at(L['pat'], bar)
            for s, n, ch in runs(p, 'xm'):
                root, _ = song.chord_at(bar, s)
                base = L.get('base', 40)
                f = midi(base + (root - base) % 12)
                inst = i_mute if ch == 'm' else L['inst']
                buf.add(inst(f, n * st * 0.95), song.t(bar, s), 0.8 if ch == 'm' else 1)
        elif kind == 'arp':
            p = pat_at(L['pat'], bar)
            lo, hi = L.get('range', (69, 88))
            k = 0
            for s, n, ch in runs(p, 'a'):
                root, ivs = song.chord_at(bar, s)
                notes = voice(root, ivs, lo, hi)
                seq = notes + notes[-2:0:-1] if L.get('updown') else notes
                m = seq[(k + bar * 3 * L.get('shift', 0)) % len(seq)]
                k += 1
                buf.add(L['inst'](midi(m), n * st * L.get('gate', 0.8)), song.t(bar, s))
        elif kind == 'lead':
            for e, tok in enumerate(mel):
                if tok in ('-', '.'):
                    continue
                n = 1
                while e + n < len(mel) and mel[e + n] == '-':
                    n += 1
                # 次の小節の頭まで伸びる音（小節の最後の '-'）はここでは切る（読みやすさ優先）
                s = e * 2
                m = tok + L.get('shift', 0)
                d = n * 2 * st * L.get('gate', 0.92)
                buf.add(L['inst'](midi(m), d), song.t(bar, s))
                if L.get('echo'):
                    es, eg = L['echo']
                    buf.add(L['inst'](midi(m), d), song.t(bar, s) + es * st, eg)
        elif kind == 'texture':
            if bar == 0:
                buf.add(L['make'](song.length), 0)
        else:
            raise KeyError(kind)
    return buf.x


def crackle(dur: float) -> np.ndarray:
    """レコードのチリチリ（稽古の lo-fi）"""
    n = int(SR * dur)
    x = band(RNG.normal(0, 1, n), 800, 6000) * 0.15
    pops = RNG.random(n) < 6 / SR
    x[pops] += RNG.uniform(-1, 1, pops.sum()) * 4
    return band(x, 500, 9000)


def rms(x: np.ndarray) -> float:
    return float(np.sqrt(np.mean(x ** 2)) + 1e-12)


def render(song: Song) -> np.ndarray:
    n = int(round(song.length * SR))
    dry = np.zeros(n + SR * 4)
    wet = np.zeros(n + SR * 4)
    for L in song.layers:
        x = render_layer(song, L)
        g = 10 ** (L.get('db', 0) / 20)
        if L['kind'] in ('drum', 'crash', 'fill'):
            x = x * 0.35 * g
        else:
            x = x / rms(x[:n]) * 0.08 * g
        x = x[: len(dry)]
        dry[: len(x)] += x
        if L.get('rev', L['kind'] not in ('drum', 'bass', 'walk', 'fill')):
            wet[: len(x)] += x * L.get('send', 1.0)
    t, w = song.rev
    tail = reverb(wet, t, 1.0) - np.concatenate([wet, np.zeros(int(SR * t))]) * 0.5
    mixed = np.concatenate([dry, np.zeros(int(SR * t))]) + tail * w
    # 円環にたたむ：ループ1周を超えた余韻を頭に重ねる
    loop = np.zeros(n)
    for k in range(0, len(mixed), n):
        seg = mixed[k:k + n]
        loop[: len(seg)] += seg
    # BONUS・RUSH の曲は、通常時から入ったときに跳ね上がりすぎないよう一段下げる
    level = song.level - (OVERLAY_TRIM if song.name.endswith(('-bonus', '-rush')) else 0)
    loop = loop / rms(loop) * 10 ** (level / 20)
    peak = np.max(np.abs(loop))
    if peak > 0.85:
        # 大きいところだけ丸めて 0.85 に収める（小さい音の大きさは変えない）
        loop = 0.85 * np.tanh(loop / 0.85)
    return loop


# ------------------------------------------------------------ 曲

FOUR = 'x...x...x...x...'
BACK = '....x.......x...'
OFF8 = '..x...x...x...x.'
EIGHT = 'x.x.x.x.x.x.x.x.'
SIXT = 'x' * 16
ARP16 = 'a' * 16


def fill(inst='snare', db=-2):
    return {'kind': 'fill', 'inst': inst, 'db': db}


SONGS: list[Song] = []


def song(*a, **k):
    SONGS.append(Song(*a, **k))


# ---- 場面の曲（固定）

# スタート画面：ギャンブル世紀末。ハーフタイムの重いビートに太鼓、金管、ベル
song('title', 96, {
    'A': (['Am', 'F', 'Dm', 'E7'], 'A4 - - C5 E5 - D5 C5 | F5 - - E5 D5 - C5 - | D5 - F5 - A5 - G5 F5 | E5 - - - G#4 - B4 -'),
    'A2': (['Am', 'F', 'Dm', 'E7'], 'A4 - - C5 E5 - D5 C5 | F5 - - E5 D5 - C5 - | D5 - F5 - A5 - G5 F5 | E5 F5 E5 D5 C5 - B4 -'),
    'B': (['F', 'G', 'Em', 'E7'], 'C6 - - B5 A5 - G5 - | B5 - - A5 G5 - D5 - | E5 - G5 - B5 - A5 G5 | G#5 - - - B5 - D6 -'),
}, ['A', 'A2', 'B', 'A2'], [
    {'kind': 'drum', 'inst': 'kick', 'pat': 'x.....x...x.....', 'db': 0},
    {'kind': 'drum', 'inst': 'snare', 'pat': '........x.......', 'db': -2},
    {'kind': 'drum', 'inst': 'taiko', 'pat': 'x...............|x.........x.....', 'db': -3},
    {'kind': 'drum', 'inst': 'hat', 'pat': 'x.x.x.x.x.x.x.x.', 'db': -16},
    {'kind': 'crash', 'db': -8},
    fill('tom', -4),
    {'kind': 'bass', 'inst': b_saw, 'pat': 'r.....r...r.....', 'base': 33, 'db': -3},
    {'kind': 'comp', 'inst': i_strings, 'pat': 'x' + '.' * 15, 'range': (55, 72), 'db': -8},
    {'kind': 'comp', 'inst': i_brass, 'pat': 'x.....x.........', 'range': (60, 74), 'gate': 0.6, 'db': -9},
    {'kind': 'lead', 'inst': i_brass, 'db': 0},
    {'kind': 'lead', 'inst': i_bell, 'shift': 12, 'db': -12},
    {'kind': 'arp', 'inst': i_bell, 'pat': 'a.a.a.a.a.a.a.a.', 'range': (76, 93), 'gate': 1, 'db': -16},
], level=-17, rev=(1.8, 0.3))

# パチンコの通常時：考える邪魔にならない、ゆったりしたホールの BGM
# 通常時の曲の楽譜。BONUS・RUSH のスタンダードは、これをアレンジした曲（通常時から入ると同じ曲が盛り上がって聞こえる）
NORMAL = {
    'A': (['CM7', 'Am7', 'Dm7', 'G7'], 'E5 - - - G5 - - - | . . C5 - E5 - D5 - | F5 - - - A5 - G5 F5 | D5 - - - . . . .'),
    'A2': (['CM7', 'Am7', 'Dm7', 'G7'], 'E5 - - - G5 - - - | . . C5 - E5 - D5 - | F5 - - - A5 - G5 F5 | G5 - - - F5 - D5 -'),
    'B': (['FM7', 'Em7', 'Dm7', 'G7'], 'A5 - - - G5 - E5 - | G5 - - - . . . . | F5 - E5 - D5 - C5 - | B4 - - - D5 - - -'),
}
NORMAL_FORM = ['A', 'A2', 'B', 'A2']


def stretch(sections: dict) -> dict:
    """8分を4分に伸ばす（1小節を2小節に）。速いテンポでも旋律がせわしなくならない"""
    out = {}
    for k, (chords, mel) in sections.items():
        toks = []
        for t in parse_mel(mel):
            toks += [t, '.' if t == '.' else '-']
        out[k] = ([c for c in chords for _ in range(2)], toks)
    return out


song('normal', 100, NORMAL, NORMAL_FORM, [
    {'kind': 'drum', 'inst': 'kick', 'pat': 'x.......x.......', 'db': -6},
    {'kind': 'drum', 'inst': 'rim', 'pat': BACK, 'db': -12},
    {'kind': 'drum', 'inst': 'hat', 'pat': EIGHT, 'db': -20},
    {'kind': 'drum', 'inst': 'tamb', 'pat': OFF8, 'db': -22},
    {'kind': 'bass', 'inst': b_sine, 'pat': 'r.....5.r.......', 'base': 36, 'db': -4},
    {'kind': 'comp', 'inst': i_ep, 'pat': 'x.....x.........', 'range': (52, 67), 'db': -5},
    {'kind': 'lead', 'inst': i_vibe, 'db': -3},
], swing=0.4, level=-21, rev=(1.6, 0.28))

# 稽古：落ち着いた和の lo-fi（琴とやわらかいビート、レコードのチリチリ）
song('keiko', 80, {
    'A': (['DM7', 'Bm7', 'GM7', 'A'], 'F#5 - A5 - B5 - A5 F#5 | E5 - - - . . D5 E5 | F#5 - - - A5 - B5 - | A5 - - - . . . .'),
    'A2': (['DM7', 'Bm7', 'GM7', 'A'], 'F#5 - A5 - B5 - A5 F#5 | E5 - - - . . D5 E5 | F#5 - - - A5 - B5 - | E5 - - - D5 - - -'),
    'B': (['Em7', 'F#m7', 'GM7', 'A'], 'B5 - - - A5 - F#5 - | A5 - - - E5 - . . | D5 - E5 - F#5 - A5 - | E5 - - - . . . .'),
}, ['A', 'A2', 'B', 'A2'], [
    {'kind': 'drum', 'inst': 'kick', 'pat': 'x......x..x.....', 'db': -5},
    {'kind': 'drum', 'inst': 'rim', 'pat': BACK, 'db': -10},
    {'kind': 'drum', 'inst': 'hat', 'pat': EIGHT, 'db': -19},
    {'kind': 'bass', 'inst': b_sine, 'pat': 'r.......r.....5.', 'base': 38, 'db': -5},
    {'kind': 'comp', 'inst': i_ep, 'pat': 'x.......x.......', 'range': (54, 69), 'db': -6},
    {'kind': 'lead', 'inst': i_koto, 'db': -2},
    {'kind': 'arp', 'inst': i_koto, 'pat': '........a.a.a...', 'range': (62, 81), 'db': -14},
    {'kind': 'texture', 'make': crackle, 'db': -24, 'rev': False},
], swing=0.5, level=-21, rev=(1.4, 0.25))


# ---- BONUS・RUSH の曲（交換所）

def drive(kick='kick', snare='snare', hat_db=-14, clap=False):
    """疾走系の共通リズム：4つ打ち・2拍4拍・裏のハイハット"""
    ls = [
        {'kind': 'drum', 'inst': kick, 'pat': FOUR, 'db': 0},
        {'kind': 'drum', 'inst': snare, 'pat': BACK, 'db': -2},
        {'kind': 'drum', 'inst': 'ohat', 'pat': OFF8, 'db': hat_db},
        {'kind': 'drum', 'inst': 'hat', 'pat': SIXT, 'db': hat_db - 8},
        {'kind': 'crash', 'db': -8},
        fill(snare, -3),
    ]
    if clap:
        ls.append({'kind': 'drum', 'inst': 'clap', 'pat': BACK, 'db': -5})
    return ls


# スタンダード：通常時の曲（NORMAL）のアレンジ。旋律とコードはそのままで、テンポとリズムで盛り上げる
song('standard-rush', 160, stretch(NORMAL), NORMAL_FORM, drive() + [
    {'kind': 'bass', 'inst': b_saw, 'pat': 'r.o.r.o.r.o.r.o.', 'base': 36, 'db': -2},
    {'kind': 'arp', 'inst': i_square, 'pat': ARP16, 'range': (64, 84), 'gate': 0.6, 'updown': True, 'db': -11},
    {'kind': 'comp', 'inst': i_pad, 'pat': 'x' + '.' * 15, 'range': (55, 72), 'db': -12},
    {'kind': 'lead', 'inst': i_square, 'shift': 12, 'db': 0},
    {'kind': 'lead', 'inst': i_saw, 'db': -8},
], level=-15, rev=(1.2, 0.2))

song('standard-bonus', 170, stretch(NORMAL), NORMAL_FORM, drive(clap=True) + [
    {'kind': 'bass', 'inst': b_saw, 'pat': 'r.r.o.r.r.r.o.r.', 'base': 36, 'db': -2},
    {'kind': 'comp', 'inst': i_brass, 'pat': 'x.....x...x.....', 'range': (60, 76), 'gate': 0.5, 'db': -7},
    {'kind': 'arp', 'inst': i_bell, 'pat': 'a.a.a.a.a.a.a.a.', 'range': (79, 96), 'gate': 1, 'db': -14},
    {'kind': 'arp', 'inst': i_square, 'pat': ARP16, 'range': (67, 84), 'gate': 0.5, 'db': -16},
    {'kind': 'lead', 'inst': i_brass, 'shift': 12, 'db': 0},
    {'kind': 'lead', 'inst': i_square, 'shift': 12, 'db': -10},
], level=-15, rev=(1.2, 0.2))

# ユーロビート
song('euro-rush', 172, {
    'A': (['Am', 'F', 'G', 'Em'], [76, 79, 81, 79, 76, 74, 72, 74, 77, 81, 84, 81, 77, 76, 74, 76, 79, 83, 86, 83, 79, 77, 76, 77, 76, 79, 83, 88, 86, 84, 83, 79]),
    'A2': (['Am', 'F', 'G', 'Em'], [76, 79, 81, 79, 76, 74, 72, 74, 77, 81, 84, 81, 77, 76, 74, 76, 79, 83, 86, 83, 79, 77, 76, 77] + parse_mel('E5 G5 B5 E6 - D6 B5 G5')),
    'B': (['F', 'G', 'Am', 'E'], 'C6 - C6 D6 E6 - D6 C6 | D6 - D6 E6 F6 - E6 D6 | E6 - A6 - G6 E6 D6 C6 | B5 - G#5 - E5 - B5 -'),
}, ['A', 'A2', 'B', 'A2'], drive(clap=True, hat_db=-12) + [
    {'kind': 'bass', 'inst': b_saw, 'pat': 'r.o.r.o.r.o.r.o.', 'base': 33, 'db': -1},
    {'kind': 'arp', 'inst': i_saw, 'pat': ARP16, 'range': (69, 88), 'gate': 0.5, 'updown': True, 'db': -11},
    {'kind': 'comp', 'inst': i_pad, 'pat': 'x.......x.......', 'range': (57, 72), 'db': -12},
    {'kind': 'lead', 'inst': i_super, 'db': 0},
    {'kind': 'lead', 'inst': i_super, 'shift': 12, 'db': -9},
], level=-14, rev=(1.0, 0.2))

song('euro-bonus', 176, {
    'A': (['A', 'Dm', 'G', 'A'], [81, 84, 88, 84, 81, 79, 76, 79, 77, 81, 84, 86, 84, 81, 77, 81, 79, 83, 86, 88, 86, 83, 79, 83, 81, 85, 88, 93, 88, 85, 81, 85]),
    'A2': (['A', 'Dm', 'G', 'A'], [81, 84, 88, 84, 81, 79, 76, 79, 77, 81, 84, 86, 84, 81, 77, 81, 79, 83, 86, 88, 86, 83, 79, 83] + parse_mel('A6 - E6 - C#6 - A5 -')),
    'B': (['F', 'G', 'A', 'A'], 'D6 - F6 - A6 - G6 F6 | G6 - F6 E6 D6 - B5 - | C#6 - E6 - A6 - G6 E6 | C#6 - - - E6 - A6 -'),
}, ['A', 'A2', 'B', 'A2'], drive(clap=True, hat_db=-12) + [
    {'kind': 'bass', 'inst': b_saw, 'pat': 'r.o.r.o.r.o.r.o.', 'base': 33, 'db': -1},
    {'kind': 'arp', 'inst': i_saw, 'pat': ARP16, 'range': (69, 90), 'gate': 0.5, 'updown': True, 'db': -11},
    {'kind': 'comp', 'inst': i_brass, 'pat': 'x.....x.........', 'range': (60, 76), 'gate': 0.5, 'db': -10},
    {'kind': 'lead', 'inst': i_super, 'db': 0},
    {'kind': 'lead', 'inst': i_super, 'shift': -12, 'db': -9},
], level=-14, rev=(1.0, 0.2))

# 和風：太鼓・締太鼓・鉦、琴と笛
WA_DRUMS = [
    {'kind': 'drum', 'inst': 'taiko', 'pat': 'x.....x...x.x...', 'db': 0},
    {'kind': 'drum', 'inst': 'shime', 'pat': '..x...x.x.x...xx', 'db': -9},
    {'kind': 'drum', 'inst': 'kane', 'pat': 'x...x...x...x...', 'db': -16},
    {'kind': 'drum', 'inst': 'snare', 'pat': BACK, 'db': -10},
    fill('shime', -4),
]
song('wa-rush', 140, {
    'A': (['D5', 'G5', 'A5', 'E5'], [74, 76, 79, 81, 79, 76, 74, None, 79, 81, 83, 81, 79, 76, 79, None, 81, 83, 86, 83, 81, 79, 76, 79, 74, None, 76, 79, 76, 74, 71, 74]),
    'A2': (['D5', 'G5', 'A5', 'E5'], [74, 76, 79, 81, 79, 76, 74, None, 79, 81, 83, 81, 79, 76, 79, None, 81, 83, 86, 83, 81, 79, 76, 79] + parse_mel('E5 - G5 E5 D5 - - -')),
    'B': (['Bm', 'Em', 'A5', 'A5'], 'B5 - A5 - B5 - D6 - | E6 - D6 B5 A5 - G5 - | A5 - B5 A5 G5 - E5 - | D5 - - - E5 - G5 -'),
}, ['A', 'A2', 'B', 'A2'], WA_DRUMS + [
    {'kind': 'bass', 'inst': b_pluck, 'pat': 'r.r.r.r.r.r.r.r.', 'base': 38, 'db': -3},
    {'kind': 'arp', 'inst': i_koto, 'pat': ARP16, 'range': (62, 83), 'gate': 1, 'db': -10},
    {'kind': 'lead', 'inst': i_flute, 'db': 0},
    {'kind': 'lead', 'inst': i_shami, 'shift': -12, 'db': -7},
], level=-15, rev=(1.5, 0.25))

song('wa-bonus', 150, {
    'A': (['D5', 'G5', 'B5', 'A5'], [86, 83, 81, 79, 81, 83, 86, None, 88, 86, 83, 81, 83, 86, 88, None, 91, 88, 86, 83, 86, 88, 91, 88, 86, None, 83, 81, 79, 81, 83, 86]),
    'A2': (['D5', 'G5', 'B5', 'A5'], [86, 83, 81, 79, 81, 83, 86, None, 88, 86, 83, 81, 83, 86, 88, None, 91, 88, 86, 83, 86, 88, 91, 88] + parse_mel('D6 - B5 - A5 - D6 -')),
    'B': (['G', 'A', 'Bm', 'A'], 'G6 - E6 - D6 - B5 - | A5 - B5 - D6 - E6 - | D6 - E6 - G6 - E6 D6 | B5 - - - A5 - - -'),
}, ['A', 'A2', 'B', 'A2'], WA_DRUMS + [
    {'kind': 'drum', 'inst': 'kane', 'pat': '..x...x...x.x.x.', 'db': -18},
    {'kind': 'bass', 'inst': b_pluck, 'pat': 'r...r.o.r...r.o.', 'base': 38, 'db': -3},
    {'kind': 'arp', 'inst': i_shami, 'pat': 'a.aaa.aaa.aaa.aa', 'range': (62, 81), 'gate': 1, 'db': -10},
    {'kind': 'lead', 'inst': i_koto, 'db': 0},
    {'kind': 'lead', 'inst': i_flute, 'shift': -12, 'db': -6},
], level=-15, rev=(1.5, 0.25))

# チップチューン：8bit
CHIP_DRUMS = [
    {'kind': 'drum', 'inst': 'nkick', 'pat': 'x.....x.x.......', 'db': 0},
    {'kind': 'drum', 'inst': 'nsnare', 'pat': BACK, 'db': -3},
    {'kind': 'drum', 'inst': 'nhat', 'pat': EIGHT, 'db': -12},
    fill('nsnare', -4),
]
song('chip-rush', 160, {
    'A': (['Am', 'F', 'G', 'E'], [72, 76, 79, 84, 83, 79, 76, 79, 74, 77, 81, 86, 84, 81, 77, 81, 76, 79, 83, 88, 86, 83, 79, 83, 77, 81, 84, 89, 88, 84, 81, 79]),
    'A2': (['Am', 'F', 'G', 'E'], [72, 76, 79, 84, 83, 79, 76, 79, 74, 77, 81, 86, 84, 81, 77, 81, 76, 79, 83, 88, 86, 83, 79, 83] + parse_mel('E6 - B5 - G#5 - E5 -')),
    'B': (['Dm', 'E', 'Am', 'E'], 'D6 - F6 - A6 - F6 D6 | E6 - G#6 - B6 - G#6 E6 | A6 - E6 - C6 - A5 - | B5 - G#5 - E5 - B5 -'),
}, ['A', 'A2', 'B', 'A2'], CHIP_DRUMS + [
    {'kind': 'bass', 'inst': i_tri, 'pat': 'r.o.r.o.r.o.r.o.', 'base': 33, 'db': 0},
    {'kind': 'arp', 'inst': i_chip, 'pat': ARP16, 'range': (69, 90), 'gate': 0.5, 'db': -12},
    {'kind': 'lead', 'inst': i_chip, 'echo': (3, 0.35), 'db': 0},
], level=-15, rev=(0.6, 0.08))

song('chip-bonus', 168, {
    'A': (['C', 'Am', 'F', 'G'], [84, 88, 91, 88, 84, 88, 91, 96, 81, 84, 88, 84, 81, 84, 88, 93, 77, 81, 84, 81, 77, 81, 84, 89, 79, 83, 86, 83, 91, 89, 88, 86]),
    'A2': (['C', 'Am', 'F', 'G'], [84, 88, 91, 88, 84, 88, 91, 96, 81, 84, 88, 84, 81, 84, 88, 93, 77, 81, 84, 81, 77, 81, 84, 89] + parse_mel('G6 F6 E6 D6 B5 - G5 -')),
    'B': (['F', 'G', 'E', 'G'], 'A5 - C6 - F6 - E6 - | D6 - B5 - G5 - B5 D6 | G#5 - B5 - E6 - D6 B5 | D6 - - - G6 - - -'),
}, ['A', 'A2', 'B', 'A2'], CHIP_DRUMS + [
    {'kind': 'bass', 'inst': i_tri, 'pat': 'r.r.o.r.r.r.o.r.', 'base': 36, 'db': 0},
    {'kind': 'arp', 'inst': i_chip, 'pat': ARP16, 'range': (72, 93), 'gate': 0.5, 'updown': True, 'db': -12},
    {'kind': 'lead', 'inst': i_chip, 'echo': (3, 0.35), 'db': 0},
], level=-15, rev=(0.6, 0.08))

# 演歌：ストリングスとこぶしの効いた笛、ヨナ抜き短音階
ENKA_DRUMS = [
    {'kind': 'drum', 'inst': 'kick', 'pat': 'x.......x.......', 'db': -2},
    {'kind': 'drum', 'inst': 'snare', 'pat': '....x.......x.gx', 'db': -4},
    {'kind': 'drum', 'inst': 'hat', 'pat': EIGHT, 'db': -15},
    {'kind': 'drum', 'inst': 'tom', 'pat': '..............x.|................', 'db': -9},
    {'kind': 'crash', 'db': -10},
    fill('tom', -3),
]
song('enka-rush', 128, {
    'A': (['Am', 'Dm', 'E7', 'Am'], 'E5 - - A5 - - C6 - | B5 - A5 - F5 - E5 - | F5 - - E5 - - B4 - | A4 - - - - - - -'),
    'B': (['F', 'E7', 'Am', 'E7'], 'F5 - - E5 F5 - A5 - | B5 - - - E5 - - - | C6 - B5 - A5 - E5 - | E5 - F5 - E5 - - -'),
    'B2': (['F', 'E7', 'Am', 'E7'], 'F5 - - E5 F5 - A5 - | B5 - - - E5 - - - | C6 - B5 - A5 - E5 - | B4 - C5 - B4 - - -'),
}, ['A', 'B', 'A', 'B2'], ENKA_DRUMS + [
    {'kind': 'bass', 'inst': b_sine, 'pat': 'r...5...r...5...', 'base': 33, 'db': -3},
    {'kind': 'comp', 'inst': i_strings, 'pat': 'x.......x.......', 'range': (57, 76), 'db': -5},
    {'kind': 'comp', 'inst': i_piano, 'pat': '..x...x...x...x.', 'range': (60, 72), 'gate': 0.5, 'db': -13},
    {'kind': 'lead', 'inst': i_flute, 'db': 0},
    {'kind': 'lead', 'inst': i_koto, 'shift': 12, 'db': -12},
], level=-15, rev=(1.8, 0.3))

song('enka-bonus', 138, {
    'A': (['C', 'Am', 'F', 'G'], 'G5 - A5 - C6 - - - | E6 - D6 C6 A5 - - - | A5 - C6 - D6 - E6 D6 | D6 - - - - - - -'),
    'B': (['Am', 'Em', 'F', 'G'], 'E6 - - - D6 - C6 - | G5 - - - E5 - G5 - | A5 - C6 - A5 - G5 E5 | D5 - - - G5 - - -'),
}, ['A', 'B', 'A', 'B'], ENKA_DRUMS + [
    {'kind': 'bass', 'inst': b_sine, 'pat': 'r...5...r...5...', 'base': 36, 'db': -3},
    {'kind': 'comp', 'inst': i_strings, 'pat': 'x.......x.......', 'range': (60, 79), 'db': -5},
    {'kind': 'comp', 'inst': i_brass, 'pat': '....x.......x...', 'range': (60, 74), 'gate': 0.5, 'db': -10},
    {'kind': 'lead', 'inst': i_strings, 'shift': 0, 'db': -2},
    {'kind': 'lead', 'inst': i_flute, 'shift': 12, 'db': -5},
], level=-15, rev=(1.8, 0.3))

# ジャズ：スウィングのライドとウォーキングベース、サックスとピアノ
JAZZ_DRUMS = [
    {'kind': 'drum', 'inst': 'ride', 'pat': 'x...x.x.x...x.x.', 'db': -8},
    {'kind': 'drum', 'inst': 'hat', 'pat': BACK, 'db': -10},
    {'kind': 'drum', 'inst': 'brush', 'pat': '......g.....x..g', 'db': -12},
    {'kind': 'drum', 'inst': 'kick', 'pat': 'x...............|..........g.....', 'db': -12},
    fill('snare', -6),
]
song('jazz-rush', 184, {
    'A': (['Dm7', 'Gm7', 'Em7b5,A7', 'Dm7'], 'D5 F5 A5 C6 - A5 G5 F5 | G5 - Bb5 - D6 C6 Bb5 G5 | G5 - E5 - C#6 - A5 - | D6 - - - . . . .'),
    'A2': (['Dm7', 'Gm7', 'Em7b5,A7', 'Dm7'], 'D5 F5 A5 C6 - A5 G5 F5 | G5 - Bb5 - D6 C6 Bb5 G5 | G5 - E5 - C#6 - A5 - | D6 C6 A5 F5 E5 D5 C#5 E5'),
    'B': (['Gm7', 'C7', 'FM7', 'Em7b5,A7'], 'Bb5 - A5 G5 F5 - D5 - | E5 - G5 Bb5 D6 - C6 Bb5 | A5 - - - C6 - - - | Bb5 - G5 - G5 - E5 -'),
}, ['A', 'A2', 'B', 'A2'], JAZZ_DRUMS + [
    {'kind': 'walk', 'inst': b_up, 'base': 36, 'db': -2},
    {'kind': 'comp', 'inst': i_piano, 'pat': '..x.....x..x....|x.....x.....x...', 'range': (53, 69), 'gate': 0.4, 'db': -7},
    {'kind': 'lead', 'inst': i_sax, 'db': 0},
], swing=0.6, level=-16, rev=(1.3, 0.22))

song('jazz-bonus', 196, {
    'A': (['FM7', 'Dm7', 'Gm7', 'C7'], 'A5 - C6 - F6 - E6 C6 | D6 - - - A5 - - - | Bb5 - D6 - G6 - F6 D6 | E6 - - - C6 - - -'),
    'A2': (['FM7', 'Dm7', 'Gm7', 'C7'], 'A5 - C6 - F6 - E6 C6 | D6 - - - A5 - - - | Bb5 - D6 - G6 - F6 D6 | C6 - - - E6 - G6 -'),
    'B': (['Am7', 'D7', 'Gm7', 'C7'], 'C6 - E6 - G6 - E6 C6 | F#6 - - - D6 - C6 A5 | Bb5 - A5 G5 F5 - D5 - | E5 - G5 - Bb5 - C6 -'),
}, ['A', 'A2', 'B', 'A2'], JAZZ_DRUMS + [
    {'kind': 'walk', 'inst': b_up, 'base': 36, 'db': -2},
    {'kind': 'comp', 'inst': i_brass, 'pat': 'x.....x.....x...|......x...x.....', 'range': (58, 74), 'gate': 0.45, 'db': -7},
    {'kind': 'comp', 'inst': i_piano, 'pat': '..x.....x..x....', 'range': (53, 69), 'gate': 0.4, 'db': -10},
    {'kind': 'lead', 'inst': i_brass, 'db': 0},
    {'kind': 'lead', 'inst': i_sax, 'shift': -12, 'db': -7},
], swing=0.6, level=-15, rev=(1.3, 0.22))

# メタル：ツーバスと刻み、歪んだギターのリード
METAL_DRUMS = [
    {'kind': 'drum', 'inst': 'kick2', 'pat': SIXT, 'db': -3},
    {'kind': 'drum', 'inst': 'snare', 'pat': BACK, 'db': 0},
    {'kind': 'drum', 'inst': 'hat', 'pat': EIGHT, 'db': -12},
    {'kind': 'drum', 'inst': 'crash', 'pat': 'x.......x.......|................', 'db': -10},
    {'kind': 'crash', 'db': -6},
    fill('tom', -1),
]
song('metal-rush', 168, {
    'A': (['E5', 'E5', 'C5,D5', 'E5'], 'E5 - G5 - B5 - - A5 | G5 - F#5 - E5 - D5 - | E5 - - - F#5 - G5 A5 | B5 - - - - - - -'),
    'A2': (['E5', 'E5', 'C5,D5', 'E5'], 'E5 - G5 - B5 - - A5 | G5 - F#5 - E5 - D5 - | E5 - - - F#5 - G5 A5 | B5 - A5 - G5 - F#5 -'),
    'B': (['C5', 'D5', 'B5', 'B5'], 'C6 - B5 - G5 - E5 - | D6 - C6 - A5 - F#5 - | B5 - - - D#6 - F#6 - | F#6 - E6 - D#6 - B5 -'),
}, ['A', 'A2', 'B', 'A2'], METAL_DRUMS + [
    {'kind': 'power', 'inst': i_guitar, 'pat': 'mmxmmxmmmmxmmxmm', 'base': 40, 'db': -2},
    {'kind': 'bass', 'inst': b_saw, 'pat': 'r.r.r.r.r.r.r.r.', 'base': 28, 'db': -6},
    {'kind': 'lead', 'inst': i_lead_gtr, 'db': 0},
], level=-14, rev=(1.0, 0.15))

song('metal-bonus', 180, {
    'A': (['E5', 'B5', 'C#5', 'A5'], 'E6 - - - B5 - E6 - | D#6 - - - B5 - F#5 - | E6 - D#6 - C#6 - B5 - | A5 - B5 - C#6 - - -'),
    'A2': (['E5', 'B5', 'C#5', 'A5'], 'E6 - - - B5 - E6 - | D#6 - - - B5 - F#5 - | E6 - D#6 - C#6 - B5 - | A5 - - - B5 - - -'),
    'B': (['A5', 'B5', 'C#5', 'B5'], 'C#6 - - - A5 - C#6 - | D#6 - - - B5 - D#6 - | E6 - F#6 - G#6 - E6 - | F#6 - - - D#6 - B5 -'),
}, ['A', 'A2', 'B', 'A2'], METAL_DRUMS + [
    {'kind': 'power', 'inst': i_guitar, 'pat': 'x.......x...x...', 'base': 40, 'db': -3},
    {'kind': 'power', 'inst': i_guitar, 'pat': '....mmmm....mmmm', 'base': 40, 'db': -9},
    {'kind': 'bass', 'inst': b_saw, 'pat': 'r.r.r.r.r.r.r.r.', 'base': 28, 'db': -6},
    {'kind': 'lead', 'inst': i_lead_gtr, 'db': 0},
    {'kind': 'lead', 'inst': i_lead_gtr, 'shift': -5, 'db': -9},
], level=-14, rev=(1.0, 0.15))


# ------------------------------------------------------------ 書き出し

def main() -> None:
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    keep_wav = '--wav' in sys.argv
    os.makedirs(OUT, exist_ok=True)
    loops = {}
    total = 0
    with tempfile.TemporaryDirectory() as tmp:
        for s in SONGS:
            loops[s.name] = len(s.bars) * 16 * s.step
            if args and not any(a in s.name for a in args):
                continue
            x = render(s)
            p = int(PAD * SR)
            full = np.concatenate([x[-p:], x, x[:p]])
            wav = os.path.join(OUT if keep_wav else tmp, f'{s.name}.wav')
            write_wav(wav, full)
            mp3 = os.path.join(OUT, f'{s.name}.mp3')
            subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', wav, '-ac', '1', '-ar', '44100', '-b:a', '80k', mp3], check=True)
            size = os.path.getsize(mp3)
            total += size
            print(f'{s.name:16s} {len(x) / SR:5.1f}s  peak {np.max(np.abs(x)):.2f}  rms {20 * np.log10(rms(x)):5.1f}dB  {size / 1024:5.0f}KB')
    print(f'合計 {total / 1024:.0f}KB')
    lines = [
        '/**',
        ' * BGM のループ1周の長さ（秒）。tools/bgm.py で書き出したもの（手で直さない）',
        f' * ファイルは「末尾 {PAD} 秒 + 1周 + 先頭 {PAD} 秒」。BGM_PAD 秒から1周ぶんをループさせる',
        ' */',
        f'export const BGM_PAD = {PAD};',
        'export const BGM_LOOPS = {',
    ]
    lines += [f"  '{k}': {v:.6f}," for k, v in loops.items()]
    lines += ['} as const;', '', 'export type BgmFile = keyof typeof BGM_LOOPS;', '']
    with open(TS_OUT, 'w') as f:
        f.write('\n'.join(lines))


if __name__ == '__main__':
    main()
