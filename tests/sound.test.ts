import { describe, expect, it } from 'vitest';
import { BGM_TRACKS, bgm, configureAudio } from '../src/ui/audio';
import { BGM_LOOPS } from '../src/ui/bgmLoops';
import { migrateVolume } from '../src/ui/settings';
import { ITEMS } from '../src/ui/shop';

/** public/assets/bgm/ にある曲のファイル名 */
const FILES = new Set(Object.keys(import.meta.glob('../public/assets/bgm/*.mp3')).map((p) => p.replace(/^.*\/(.+)\.mp3$/, '$1')));
const existsSync = (path: string) => FILES.has(path.replace(/^.*\/(.+)\.mp3$/, '$1'));

describe('音量の設定の移行', () => {
  it('「サウンド なし」だった人は効果音も BGM も 0', () => {
    expect(migrateVolume({}, false, 0.8)).toEqual({ sfxVolume: 0, bgmVolume: 0 });
  });
  it('前の音量は効果音の音量に。BGM は初期値', () => {
    expect(migrateVolume({}, true, 0.8)).toEqual({ sfxVolume: 0.8, bgmVolume: 0.5 });
    expect(migrateVolume({})).toEqual({ sfxVolume: 0.5, bgmVolume: 0.5 });
  });
  it('新しい設定はそのまま（範囲外は初期値）', () => {
    expect(migrateVolume({ sfxVolume: 0, bgmVolume: 0.3 })).toEqual({ sfxVolume: 0, bgmVolume: 0.3 });
    expect(migrateVolume({ sfxVolume: 2, bgmVolume: -1 })).toEqual({ sfxVolume: 0.5, bgmVolume: 0.5 });
  });
});

describe('音量の設定の読み込み', () => {
  it('保存データの「サウンド なし」を読み替える', async () => {
    const store = new Map<string, string>();
    (globalThis as { localStorage?: unknown }).localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => store.set(k, v),
    };
    const { loadSettings } = await import('../src/ui/settings');
    store.set('tensu.settings.v1', JSON.stringify({ sound: false, volume: 0.7 }));
    expect(loadSettings()).toMatchObject({ sfxVolume: 0, bgmVolume: 0 });
    expect('sound' in loadSettings()).toBe(false);
    store.set('tensu.settings.v1', JSON.stringify({ sound: true, volume: 0.7 }));
    expect(loadSettings()).toMatchObject({ sfxVolume: 0.7, bgmVolume: 0.5 });
    delete (globalThis as { localStorage?: unknown }).localStorage;
  });
});

describe('BGM', () => {
  it('交換所の曲はすべて BONUS・RUSH の2つのファイルがある', () => {
    const shopTracks = ITEMS.filter((i) => i.kind === 'bgm').map((i) => i.value);
    expect(shopTracks).toEqual([...BGM_TRACKS]);
    for (const t of BGM_TRACKS) {
      for (const theme of ['bonus', 'rush']) {
        const name = `${t}-${theme}` as keyof typeof BGM_LOOPS;
        expect(BGM_LOOPS[name]).toBeGreaterThan(10);
        expect(existsSync(`public/assets/bgm/${name}.mp3`)).toBe(true);
      }
    }
    for (const s of ['title', 'normal', 'keiko'] as const) expect(existsSync(`public/assets/bgm/${s}.mp3`)).toBe(true);
  });
  it('新しい3曲は今の曲より高い', () => {
    const price = (id: string) => ITEMS.find((i) => i.id === id)!.price;
    expect([price('bgm-enka'), price('bgm-jazz'), price('bgm-metal')]).toEqual([6000, 7500, 9000]);
    expect(price('bgm-enka')).toBeGreaterThan(price('bgm-chip'));
  });
  it('場面の曲の上に BONUS・RUSH の曲をかぶせ、止めると場面の曲に戻る（音が出せない環境でも落ちない）', () => {
    configureAudio(0.5, 0.5);
    bgm.setTrack('jazz');
    bgm.scene('normal');
    expect(bgm.file).toBe('normal');
    bgm.play('rush');
    expect(bgm.file).toBe('jazz-rush');
    expect(bgm.theme).toBe('rush');
    bgm.play('bonus');
    expect(bgm.file).toBe('jazz-bonus');
    bgm.stop();
    expect(bgm.file).toBe('normal');
    expect(bgm.theme).toBe(null);
    bgm.scene('keiko');
    expect(bgm.file).toBe('keiko');
    configureAudio(0.5, 0);
    expect(bgm.file).toBe(null);
  });
});
