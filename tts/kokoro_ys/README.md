# tts/kokoro_ys — YomiScript → Kokoro-82M speech synthesis (reference implementation)

> **Status: earlier experiment in the old notation.** The Kokoro Katarite is now `@yomiscript/kokoro`
> ([`packages/kokoro/`](../../packages/kokoro/)), which reproduces the original Kokoro exactly (D21, D22).

A reference implementation that generates speech from YomiScript input alone. It does not use text analysis (misaki's front stage); instead it converts YomiScript's symbols into Kokoro phoneme sequences and pitch instructions. In YomiScript you write how you want each word to be pronounced.

## Main files
- `ys2kokoro.py` / `ys2kokoro_v2.py` / `misaki_hepburn.py`: conversion from YomiScript to Kokoro phonemes (misaki-style IPA)
- `pitch_v3.py` / `prosody_v4.py`: build F0 from accent marks and replace Kokoro's predicted pitch (durations stay as Kokoro predicts)
- `mix.py`: synthesis policy per language tag `{lang|...}` (ja uses F0 override, en/fr use Kokoro's own pitch; each segment is synthesized and concatenated; a foreign-language segment of a single word is read only with that language's voice). `mix5〜8.py` and `mix_v4.py` are intermediate versions
- `osaka.py` / `osaka_n.py`: comparing Tokyo-type and Osaka-type accent (`^ja-x-osaka|`, `=` for high-onset)
- `run.py` / `run_v2.py`: generate 4-language samples
- `wh*.py` / `whisper*.json`: language identification and transcription evaluation with Whisper (small), and their results

## Setup
Place the Kokoro-82M (Apache-2.0, hexgrad) weights and voices in this directory (they are not included in the repository).
```
pip install kokoro-onnx soundfile numpy
curl -LO https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/kokoro-v1.0.onnx
curl -LO https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/voices-v1.0.bin
```
Scripts that use F0 override, such as `prosody_v4.py`, also need the PyTorch version (Python 3.11 recommended): `pip install kokoro torch` (weights are fetched automatically from `hexgrad/Kokoro-82M`).

## Running
Run in this directory (paths are relative).
```
python run_v2.py      # 4-language samples
python mix.py         # mixed-language sentences
python osaka_n.py     # Tokyo vs. Osaka reading comparison
```
