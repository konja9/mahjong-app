import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'io.github.konja9.pachifuto',
  appName: 'パチふと',
  webDir: 'dist',
  backgroundColor: '#0b0a0e',
  plugins: {
    SystemBars: {
      // 画面いっぱいに描き、ノッチやナビゲーションバーの分は CSS の env(safe-area-inset-*) で避ける
      initialViewportFitValueHint: 'cover',
      // 背景が暗いので、ステータスバーの文字とアイコンは白
      style: 'DARK',
    },
  },
};

export default config;
