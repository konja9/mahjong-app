/**
 * BGM のループ1周の長さ（秒）。tools/bgm.py で書き出したもの（手で直さない）
 * ファイルは「末尾 0.5 秒 + 1周 + 先頭 0.5 秒」。BGM_PAD 秒から1周ぶんをループさせる
 */
export const BGM_PAD = 0.5;
export const BGM_LOOPS = {
  'title': 40.000000,
  'normal': 38.400000,
  'keiko': 48.000000,
  'standard-rush': 25.600000,
  'standard-bonus': 23.272727,
  'euro-rush': 22.325581,
  'euro-bonus': 21.818182,
  'wa-rush': 27.428571,
  'wa-bonus': 25.600000,
  'chip-rush': 24.000000,
  'chip-bonus': 22.857143,
  'enka-rush': 30.000000,
  'enka-bonus': 27.826087,
  'jazz-rush': 20.869565,
  'jazz-bonus': 19.591837,
  'metal-rush': 22.857143,
  'metal-bonus': 21.333333,
} as const;

export type BgmFile = keyof typeof BGM_LOOPS;
