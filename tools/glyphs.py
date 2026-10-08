#!/usr/bin/env python3
"""
ロゴの文字を書き出す（src/ui/brand/glyphs.ts）。
- タイトル「パチふと」：Reggae One の字形を SVG のパスに（1em=1000、上端が0）
- 副題「パチンコ符計算トレーニング」：DotGothic16 の字形を 16×21 の LED の粒（点灯するかどうか）に
フォントは devDependencies の @fontsource から読む。アプリにはパスと粒の表だけが入る（フォントは入れない）

使い方：python3 tools/glyphs.py  （fonttools・brotli が要る：pip install fonttools brotli）
"""
import glob
import os

from fontTools.pens.pointInsidePen import PointInsidePen
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont

ROOT = os.path.join(os.path.dirname(__file__), '..')
TITLE = 'パチふと'
# スタート画面のボタン「パチンコ」「稽古」の文字（TITLE と同じ字形。重なる字は1つだけ書き出す）
BUTTONS = 'ンコ稽古'
SUB = 'パチンコ符計算トレーニング'
# LED の粒の数：1文字あたり 16 列 × 21 行（DotGothic16 の1ドット＝1粒。行は字の高さの 1.32 倍ぶん）
COLS, ROWS = 16, 21


def find(pattern: str, ch: str):
    for f in sorted(glob.glob(os.path.join(ROOT, pattern))):
        font = TTFont(f)
        cmap = font.getBestCmap()
        if ord(ch) in cmap:
            return font, cmap[ord(ch)]
    raise SystemExit(f'not found: {ch} in {pattern}')


def title_path(ch: str) -> str:
    font, name = find('node_modules/@fontsource/reggae-one/files/reggae-one-*-400-normal.woff2', ch)
    gs = font.getGlyphSet()
    s = 1000 / font['head'].unitsPerEm
    asc = font['hhea'].ascent
    pen = SVGPathPen(gs)
    gs[name].draw(TransformPen(pen, (s, 0, 0, -s, 0, asc * s)))
    return pen.getCommands()


def led_rows(ch: str) -> list[str]:
    font, name = find('node_modules/@fontsource/dotgothic16/files/dotgothic16-*-400-normal.woff2', ch)
    gs = font.getGlyphSet()
    upm = font['head'].unitsPerEm
    asc = font['hhea'].ascent
    step = upm / COLS
    rows = []
    for r in range(ROWS):
        bits = ''
        for c in range(COLS):
            pen = PointInsidePen(gs, ((c + 0.5) * step, asc - (r + 0.5) * step))
            gs[name].draw(pen)
            bits += '1' if pen.getResult() else '0'
        rows.append(bits)
    return rows


def main() -> None:
    lines = [
        '/**',
        ' * ロゴの文字（tools/glyphs.py で書き出したもの。手で直さない）',
        ' * - TITLE：Reggae One の「パチふと」と、ボタンの「ンコ稽古」のパス（1em=1000、上端が0）',
        f' * - SUB：DotGothic16 の副題の LED の粒（1文字 {COLS}列×{ROWS}行。"1" が点灯）',
        ' */',
        'export const TITLE: Record<string, string> = {',
    ]
    for ch in TITLE + BUTTONS:
        lines.append(f"  '{ch}': '{title_path(ch)}',")
    lines.append('};')
    lines.append('')
    lines.append(f"export const SUB_TEXT = '{SUB}';")
    lines.append('export const SUB: string[][] = [')
    for ch in SUB:
        lines.append(f"  [{', '.join(repr(r) for r in led_rows(ch))}], // {ch}")
    lines.append('];')
    out = os.path.join(ROOT, 'src', 'ui', 'brand', 'glyphs.ts')
    with open(out, 'w') as f:
        f.write('\n'.join(lines).replace('"', "'") + '\n')
    print('wrote', out)


if __name__ == '__main__':
    main()
