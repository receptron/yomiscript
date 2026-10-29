"""Kokoro-82M の voices-v1.0.bin（npz）から、デモ用の声ファイル voices/<名前>.bin を書き出す。
各ファイルは style ベクトル (510, 1, 256) float32 をリトルエンディアンの生バイト列で保存したもの（522,240 バイト）。
使い方: python export_voices.py [voices-v1.0.bin] [声の名前 ...]
"""
import os, sys, numpy as np
DEFAULT = ['af_heart', 'am_michael', 'bf_emma', 'ff_siwis', 'jf_alpha', 'jm_kumo', 'zf_xiaoxiao']
src = sys.argv[1] if len(sys.argv) > 1 else 'voices-v1.0.bin'
names = sys.argv[2:] or DEFAULT
d = np.load(src)
os.makedirs('voices', exist_ok=True)
for n in names:
    a = np.ascontiguousarray(d[n], dtype='<f4')
    assert a.shape == (510, 1, 256), (n, a.shape)
    a.tofile(f'voices/{n}.bin'); print(n, a.shape, a.nbytes)
