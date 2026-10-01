import { defineConfig, type Plugin } from 'vitest/config';

/** 同梱フォントは woff2 だけにする（fontsource の CSS は古いブラウザ向けの woff も並べており、ビルドが倍に膨らむ） */
function woff2Only(): Plugin {
  return {
    name: 'woff2-only',
    enforce: 'pre',
    transform(code, id) {
      if (!id.includes('@fontsource') || !id.endsWith('.css')) return null;
      return code.replace(/,\s*url\([^)]*\.woff\) format\('woff'\)/g, '');
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [woff2Only()],
  test: {
    include: ['tests/**/*.test.ts'],
  },
});
