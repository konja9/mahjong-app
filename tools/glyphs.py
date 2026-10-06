#!/usr/bin/env python3
"""
ロゴの文字を SVG のパスにする（Noto Sans JP 900。@fontsource の分割フォントから探す）。
使い方：python3 tools/glyphs.py パチふと  → 各文字のパスと送り幅を JSON で出す（fonttools・brotli が要る）
"""
import glob
import json
import sys

from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont

FILES = sorted(glob.glob('node_modules/@fontsource/noto-sans-jp/files/noto-sans-jp-*-900-normal.woff2'))


def glyph(ch: str):
    for f in FILES:
        font = TTFont(f)
        cmap = font.getBestCmap()
        if ord(ch) in cmap:
            gs = font.getGlyphSet()
            name = cmap[ord(ch)]
            upm = font['head'].unitsPerEm
            asc = font['hhea'].ascent
            pen = SVGPathPen(gs)
            # フォントの座標（上が正）を SVG（下が正・1em=1000）に直す
            s = 1000 / upm
            gs[name].draw(TransformPen(pen, (s, 0, 0, -s, 0, asc * s)))
            return {'d': pen.getCommands(), 'adv': gs[name].width * s}
    raise SystemExit(f'not found: {ch}')


if __name__ == '__main__':
    print(json.dumps({ch: glyph(ch) for ch in sys.argv[1]}, ensure_ascii=False))
