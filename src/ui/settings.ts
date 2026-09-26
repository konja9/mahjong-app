import type { Filters, Mode } from '../core/generator';
import { DEFAULT_RULES, type Rules } from '../core/rules';
import { load, save } from './storage';

export type EffectLevel = 'off' | 'lite' | 'max';
export type AnswerStyle = 'choice' | 'input';
export type PlayMode = 'normal' | 'practice';

export interface Settings {
  /** 最上位タブ：ノーマル（パチンコ台あり）かプラクティス（演出なし） */
  playMode: PlayMode;
  mode: Mode;
  /** 回答方式：4択か数値入力か */
  answerStyle: AnswerStyle;
  count: number; // 0 = 無制限
  timeLimit: number; // 秒、0 = なし
  filters: Filters;
  effects: EffectLevel;
  sound: boolean;
  volume: number; // 0..1
  rules: Rules;
}

const reducedMotion =
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export const DEFAULT_SETTINGS: Settings = {
  playMode: 'normal',
  mode: 'hayami',
  answerStyle: 'choice',
  count: 25,
  timeLimit: 0,
  filters: { seat: 'any', win: 'any' },
  effects: reducedMotion ? 'lite' : 'max',
  sound: true,
  volume: 0.5,
  rules: DEFAULT_RULES,
};

const KEY = 'tensu.settings.v1';

export function loadSettings(): Settings {
  const s = load<Settings>(KEY, DEFAULT_SETTINGS);
  // 旧バージョンのテーマ設定は使わない
  const { theme: _theme, ...rest } = s as Settings & { theme?: unknown };
  return {
    ...rest,
    filters: { ...DEFAULT_SETTINGS.filters, ...s.filters },
    rules: { ...DEFAULT_RULES, ...s.rules },
  };
}

export function saveSettings(s: Settings): void {
  save(KEY, s);
}
