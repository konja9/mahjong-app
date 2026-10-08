// スタート画面のボタンの SVG を、単体のファイルとして store/brand/ に書き出す
//   npx -p tsx tsx scripts/brand-buttons.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { modeButtonSvg } from '../src/ui/brand/modeButtons.ts';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'store', 'brand');
mkdirSync(OUT, { recursive: true });
const files = {
  'btn-pachinko.svg': modeButtonSvg('pachinko', { sub: '所持金 1,000 yan' }),
  'btn-keiko.svg': modeButtonSvg('keiko', { sub: 'yan を使わずに練習' }),
};
for (const [name, svg] of Object.entries(files)) {
  writeFileSync(join(OUT, name), svg.replace('<svg ', '<svg width="1024" height="276" ') + '\n');
  console.log('wrote', join(OUT, name));
}
