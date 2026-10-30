"""Write the demo's voice files voices/<name>.bin from Kokoro-82M's voices-v1.0.bin (npz).
Each file holds the style vectors (510, 1, 256) float32 as raw little-endian bytes (522,240 bytes).
Usage: python export_voices.py [voices-v1.0.bin] [voice name ...]
"""

import os
import sys

import numpy as np

DEFAULT = ["af_heart", "am_michael", "bf_emma", "ff_siwis", "jf_alpha", "jm_kumo", "zf_xiaoxiao"]
src = sys.argv[1] if len(sys.argv) > 1 else "voices-v1.0.bin"
names = sys.argv[2:] or DEFAULT
d = np.load(src)
os.makedirs("voices", exist_ok=True)
for n in names:
    a = np.ascontiguousarray(d[n], dtype="<f4")
    assert a.shape == (510, 1, 256), (n, a.shape)
    a.tofile(f"voices/{n}.bin")
    print(n, a.shape, a.nbytes)
