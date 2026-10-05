// フォントは同梱する（アプリ版をオフラインで動かすため）。重さは以前 Google Fonts で読んでいたものと同じ
import '@fontsource/noto-sans-jp/400.css';
import '@fontsource/noto-sans-jp/700.css';
import '@fontsource/noto-sans-jp/900.css';
import '@fontsource/noto-serif-jp/700.css';
import '@fontsource/jetbrains-mono/latin-400.css';
import '@fontsource/jetbrains-mono/latin-700.css';
import '@fontsource/jetbrains-mono/latin-800.css';
import './styles/main.css';
import './styles/cabinet.css';
import { App } from './ui/app';
import { audioLevel, bgm } from './ui/audio';
import { setupNative } from './ui/native';

const app = new App(document.getElementById('app')!);
setupNative(app);

// 動作確認用：?debug で正解をコンソールから参照できる
if (new URLSearchParams(location.search).has('debug')) {
  Object.assign(window, { tensu: app, tensuBgm: bgm, tensuLevel: audioLevel });
}
