import type { Filters, Mode } from '../core/generator';
import { DEFAULT_RULES, type Rules } from '../core/rules';
import { load, save } from './storage';

export type EffectLevel = 'off' | 'lite' | 'max';
export type Theme = 'serika' | 'paper' | 'neon';
export type AnswerStyle = 'choice' | 'input';
export type PlayMode = 'normal' | 'practice';
export type MachineSkin = 'classic' | 'luxe' | 'luxe-deco' | 'luxe-shine' | 'luxe-velvet';

export interface Settings {
  /** 最上位タブ：ノーマル（パチンコ台あり）かプラクティス（演出なし） */
  playMode: PlayMode;
  /** ノーマルの大盤振る舞いモード（高打点・役満が大幅に出やすい） */
  generous: boolean;
  /** 台のデザイン */
  machineSkin: MachineSkin;
  /** 台のデザインを利用者が選んだか（未選択なら標準のデザインに追従する） */
  skinChosen: boolean;
  mode: Mode;
  /** 回答方式：4択か数値入力か */
  answerStyle: AnswerStyle;
  count: number; // 0 = 無制限
  timeLimit: number; // 秒、0 = なし
  filters: Filters;
  effects: EffectLevel;
  sound: boolean;
  volume: number; // 0..1
  theme: Theme;
  rules: Rules;
}

const reducedMotion =
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export const DEFAULT_SETTINGS: Settings = {
  playMode: 'normal',
  generous: false,
  machineSkin: 'luxe',
  skinChosen: false,
  mode: 'hayami',
  answerStyle: 'choice',
  count: 25,
  timeLimit: 0,
  filters: { seat: 'any', win: 'any' },
  effects: reducedMotion ? 'lite' : 'max',
  sound: true,
  volume: 0.5,
  theme: 'serika',
  rules: DEFAULT_RULES,
};

const KEY = 'tensu.settings.v1';

export function loadSettings(): Settings {
  const s = load<Settings>(KEY, DEFAULT_SETTINGS);
  const skins: MachineSkin[] = ['classic', 'luxe', 'luxe-deco', 'luxe-shine', 'luxe-velvet'];
  const machineSkin = s.skinChosen && skins.includes(s.machineSkin) ? s.machineSkin : DEFAULT_SETTINGS.machineSkin;
  return {
    ...s,
    machineSkin,
    filters: { ...DEFAULT_SETTINGS.filters, ...s.filters },
    rules: { ...DEFAULT_RULES, ...s.rules },
  };
}

export function saveSettings(s: Settings): void {
  save(KEY, s);
}
