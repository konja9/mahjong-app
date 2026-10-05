import type { Filters, HandConstraints, Mode } from '../core/generator';
import { DEFAULT_RULES, type Rules } from '../core/rules';
import type { KeikoSource } from './keiko';
import { load, save } from './storage';

export type EffectLevel = 'off' | 'lite' | 'max';
/** steps（段階）は稽古の符計算だけ。ほかでは選択として扱う */
export type AnswerStyle = 'choice' | 'input' | 'steps';
export type PlayMode = 'pachinko' | 'keiko';

export interface Settings {
  /** 最上位タブ：パチンコ（台・yan あり）か稽古（演出なし・数え方の練習） */
  playMode: PlayMode;
  mode: Mode;
  /** 回答方式：4択・数値入力・段階（稽古の符計算のみ） */
  answerStyle: AnswerStyle;
  count: number; // 0 = 無制限
  filters: Filters;
  /** 稽古の出題の絞り込み（符計算・実戦のみ） */
  keikoFilters: Omit<HandConstraints, 'want'>;
  /** 稽古の出題：通常／復習（間違えた手）／苦手（正答率の低い要素） */
  keikoSource: KeikoSource;
  effects: EffectLevel;
  sound: boolean;
  volume: number; // 0..1
  rules: Rules;
}

const reducedMotion =
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export const DEFAULT_SETTINGS: Settings = {
  playMode: 'pachinko',
  mode: 'hayami',
  answerStyle: 'choice',
  count: 25,
  filters: { seat: 'any', win: 'any' },
  keikoFilters: { call: 'any', shape: 'any', dist: 'real' },
  keikoSource: 'normal',
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
    playMode: migratePlayMode(rest.playMode),
    filters: { ...DEFAULT_SETTINGS.filters, ...s.filters },
    keikoFilters: { ...DEFAULT_SETTINGS.keikoFilters, ...s.keikoFilters },
    rules: { ...DEFAULT_RULES, ...s.rules },
  };
}

/** 旧バージョンのタブ（ノーマル・プラクティス）を今のタブに読み替える */
export function migratePlayMode(v: unknown): PlayMode {
  if (v === 'keiko' || v === 'practice') return 'keiko';
  return 'pachinko';
}

export function saveSettings(s: Settings): void {
  save(KEY, s);
}
