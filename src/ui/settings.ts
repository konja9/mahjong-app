import type { CallFilter, Filters, Mode } from '../core/generator';
import type { Study } from '../core/steps';
import { DEFAULT_RULES, type Rules } from '../core/rules';
import type { KeikoSource } from './keiko';
import { load, save } from './storage';

export type EffectLevel = 'off' | 'lite' | 'max';
/** 回答方式：選択（4択・固定ボタン）か数値入力 */
export type AnswerStyle = 'choice' | 'input';
export type PlayMode = 'pachinko' | 'keiko';

export interface Settings {
  /** 最上位タブ：パチンコ（台・yan あり）か稽古（演出なし・数え方の練習） */
  playMode: PlayMode;
  /** パチンコの出題の種目（稽古は種目なしで、手牌の段階練習だけ） */
  mode: Mode;
  /** 回答方式：選択か数値入力（パチンコ・稽古で共通） */
  answerStyle: AnswerStyle;
  count: number; // 0 = 無制限
  filters: Filters;
  /** 稽古の学習モード：重点学習（7段階）／簡易学習（符 → 翻 → 点数） */
  keikoStudy: Study;
  /** 稽古の出題の絞り込み（鳴き） */
  keikoFilters: { call: CallFilter };
  /** 稽古の出題：通常／復習（間違えた手）／苦手（正答率の低い要素） */
  keikoSource: KeikoSource;
  effects: EffectLevel;
  /** 効果音の音量 0..1（0 で鳴らさない） */
  sfxVolume: number;
  /** BGM の音量 0..1（0 で鳴らさない） */
  bgmVolume: number;
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
  keikoStudy: 'focus',
  keikoFilters: { call: 'any' },
  keikoSource: 'normal',
  effects: reducedMotion ? 'lite' : 'max',
  sfxVolume: 0.5,
  bgmVolume: 0.5,
  rules: DEFAULT_RULES,
};

const KEY = 'tensu.settings.v1';

export function loadSettings(): Settings {
  const s = load<Settings>(KEY, DEFAULT_SETTINGS);
  // 旧バージョンのテーマ設定は使わない
  // 制限時間（timeLimit）はなくなった
  // サウンドのあり／なし（sound）と1つの音量（volume）は、効果音と BGM の2つの音量になった
  //（初期値を混ぜる前の保存データで見る。混ぜたあとは新しい音量が必ずあるように見えるため）
  const raw = load<Record<string, unknown>>(KEY, {});
  const { theme: _theme, timeLimit: _timeLimit, sound: _sound, volume: _volume, ...rest } = s as Settings & {
    theme?: unknown;
    timeLimit?: unknown;
    sound?: unknown;
    volume?: unknown;
  };
  const call = (s.keikoFilters as { call?: CallFilter } | undefined)?.call;
  return {
    ...rest,
    playMode: migratePlayMode(rest.playMode),
    // 以前の「段階」は、稽古そのものが段階練習になったので選択に読み替える
    answerStyle: rest.answerStyle === 'input' ? 'input' : 'choice',
    keikoStudy: rest.keikoStudy === 'quick' ? 'quick' : 'focus',
    filters: { ...DEFAULT_SETTINGS.filters, ...s.filters },
    // 形・分布の絞り込みはなくなった（鳴きだけ残す）
    keikoFilters: { call: call === 'menzen' || call === 'open' ? call : 'any' },
    rules: { ...DEFAULT_RULES, ...s.rules },
    ...migrateVolume(
      { sfxVolume: raw.sfxVolume as number | undefined, bgmVolume: raw.bgmVolume as number | undefined },
      raw.sound as boolean | undefined,
      raw.volume as number | undefined,
    ),
  };
}

const vol = (v: unknown, def: number): number => (typeof v === 'number' && v >= 0 && v <= 1 ? v : def);

/** 以前の「サウンド あり／なし」と音量を、効果音と BGM の音量に読み替える（なしだった人は両方 0） */
export function migrateVolume(
  s: Partial<Pick<Settings, 'sfxVolume' | 'bgmVolume'>>,
  sound?: boolean,
  volume?: number,
): Pick<Settings, 'sfxVolume' | 'bgmVolume'> {
  if (sound === false && s.sfxVolume === undefined) return { sfxVolume: 0, bgmVolume: 0 };
  return {
    sfxVolume: vol(s.sfxVolume, vol(volume, DEFAULT_SETTINGS.sfxVolume)),
    bgmVolume: vol(s.bgmVolume, DEFAULT_SETTINGS.bgmVolume),
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
