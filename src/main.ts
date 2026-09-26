import './styles/main.css';
import './styles/cabinet.css';
import { App } from './ui/app';
import { bgm } from './ui/audio';

const app = new App(document.getElementById('app')!);

// 動作確認用：?debug で正解をコンソールから参照できる
if (new URLSearchParams(location.search).has('debug')) {
  Object.assign(window, { tensu: app, tensuBgm: bgm });
}
