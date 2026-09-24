import './styles/main.css';
import './styles/fonts';
import { App } from './ui/app';

const app = new App(document.getElementById('app')!);

// 動作確認用：?debug で正解をコンソールから参照できる
if (new URLSearchParams(location.search).has('debug')) {
  (window as unknown as { tensu: App }).tensu = app;
}
