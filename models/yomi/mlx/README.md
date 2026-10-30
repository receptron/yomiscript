# Yomi-0 MLX prototype

A small dense Transformer (encoder-decoder, no MoE, D2) that turns Japanese text into **kana reading + accent nucleus + phrase boundaries**.
The input is a character-level vocabulary; the output is a kana + prosody symbol sequence in the jsut-label `e2e_symbol` format.

```
Input:   水をマレーシアから買わなくてはならないのです。
Output:  ^ミ[ズヲ#マ[レ]ーシアカラ#カ[ワナ]クテワ#ナ[ラ]ナイノデス$
Symbols: ^ sentence start  $ sentence end  ? question  # accent phrase boundary  _ pause  [ rise  ] accent nucleus
```

## Size (measured parameter counts; vocabulary from BASIC5000: 2639 input, 91 output)

| config | d_model | enc/dec layers | parameters |
|---|---|---|---|
| `configs/smoke.json` | 128 | 2/2 | 1.33M (for smoke testing) |
| `configs/tiny.json` | 256 | 4/3 | 7.11M |
| `configs/small.json` | 384 | 6/4 | 21.30M |

## Data

- Human labels: [jsut-label](https://github.com/sarulab-speech/jsut-label) BASIC5000. The 280 evaluation sentences in `eval/data/` are **excluded**. The remaining 4720 sentences are split into train 4520 / dev 200 (fixed seed). See `eval/LICENSE_DATA.md` for the license.
- Optional distillation (`--distill-text`): labels open text (one sentence per line) with pyopenjtalk and writes it to `data/distill.jsonl` (`source: "distill"`). **Because it is distillation, quality is capped at pyopenjtalk**, and the model also learns its misreadings. It is meant for building a base with more data; final evaluation uses the human labels.
- `data/` and `ckpt/` are not checked into git. `prepare_data.py` clones jsut-label automatically and builds them.

4520 sentences is small, so tiny/small will likely overfit on human data alone (not verified).

## Setup on Mac (Apple Silicon)

```bash
git clone https://github.com/receptron/yomiscript && cd yomiscript/models/yomi/mlx
uv venv && source .venv/bin/activate      # without uv: python3 -m venv .venv && source .venv/bin/activate
uv pip install -r requirements.txt         # or pip install -r requirements.txt
# to also use distillation: uv pip install pyopenjtalk
```

## Commands

```bash
# 1. Build data (clones jsut-label into data/jsut-label)
python prepare_data.py
#   to add distillation: python prepare_data.py --distill-text corpus.txt --distill-max 50000

# 2. Training
python train.py --config configs/tiny.json  --out ckpt/tiny
python train.py --config configs/small.json --out ckpt/small --dtype bfloat16
#   mix in distilled data: --distill   resume: --resume   override step count: --steps N

# 3. Inference
python infer.py --ckpt ckpt/tiny "今日は良い天気です。"
python infer.py --ckpt ckpt/tiny --plain < sentences.txt

# 4. Evaluation (eval/ JSUT 280 sentences + hard set of 70 sentences)
python evaluate.py --ckpt ckpt/tiny --out ckpt/tiny/eval.json

# 5. Latency (old vs new decoding side by side, batch 1 and batched inference)
python bench.py --ckpt ckpt/tiny_aug
```

## Faster inference (#11)

`yomi.generate` is sped up in three ways. The output token sequence is identical to the old decoding and to the reference implementation that recomputes the whole prefix every step.

- The self-attention KV cache is allocated at a fixed length, and each step computes only the one new token (the old version concatenated arrays every step)
- The encoder-side K/V for cross-attention are computed once up front (the old version recomputed them every step)
- The single-step decoder function is wrapped in `mx.compile` (cache length is rounded up to multiples of 32 to limit recompilation)

The old decoding is kept as `yomi.generate_legacy` and the reference implementation as `yomi.generate_nocache`.
The checkpoint format is unchanged, so `ckpt/tiny_aug`, whether still training or already trained, can be used as is.

### Benchmark commands on Mac

Run these after training finishes (when the GPU is not busy).

```bash
cd yomiscript && git pull && cd models/yomi/mlx
source .venv/bin/activate
python bench.py --ckpt ckpt/tiny_aug --device gpu
python bench.py --ckpt ckpt/tiny_aug --device cpu
python bench.py --ckpt ckpt/tiny_aug --device gpu --dtype bfloat16
python evaluate.py --ckpt ckpt/tiny_aug --out ckpt/tiny_aug/eval.json   # check that accuracy matches the previous run
```

The `results` in the output list `legacy` (old) / `fast` (new, with compile) / `fast_nocompile` (new, without compile).
`batch1` is per-sentence latency, `batch32_ms_per_sent` is the time per sentence when 32 sentences are batched together,
and `identical_outputs_vs_first_mode` is the number of sentences whose output matched the old decoding.

`mx.compile` for training steps is enabled with `python train.py ... --compile` (loss is identical).
It is off by default because it was about 5% slower on Linux CPU. The effect on Mac GPU has not been measured.

### Measurements on Linux CPU (x86_64, 8 cores, mlx 0.32.4, float32)

Measured with untrained weights; the output never emits the end-of-sentence symbol and generates up to the maximum length, so these numbers are for longer outputs than in real use.

| model | old median | new median (with compile) | new (without compile) | speedup |
|---|---|---|---|---|
| smoke (1.33M, n=50) | 73.2ms | 48.5ms | 52.3ms | 1.51x |
| same shape as tiny_aug, random init (7.11M, n=30) | 563.5ms | 213.1ms | 253.5ms | 2.64x |

Numbers on Mac GPU have not been measured yet.

Checkpoints are saved, overwriting, every `save_every` steps to `ckpt/<name>/` (model.safetensors, optimizer.safetensors, meta.json).

## Training with augmented data (aug v1)

JSUT's 4,520 sentences alone do not cover enough kanji readings, so we use augmented data: about 300k sentences of open text labeled with pyopenjtalk.
Sources and licenses: [`aug/LICENSE_DATA.md`](aug/LICENSE_DATA.md).

| source | sentences used | notes |
|---|---|---|
| Tatoeba | 99,985 | distilled |
| Wikipedia (1 shard) | 98,481 | distilled |
| Aozora Bunko (modern kanji and kana, 400 works) | 97,559 | of which 8,099 sentences have readings corrected from ruby (`src: "ruby"`) |
| Rule set | 2,122 × 5 | numbers, dates, times, counters, abbreviations (`src: "rule"`) |
| Total `distill.jsonl` | 306,635 lines | + JSUT train 4,520 / dev 200 |

### Option A: prebuilt data tarball (about 22MB)

Download it from [release yomi-aug-v1](https://github.com/receptron/yomiscript/releases/tag/yomi-aug-v1) and extract it into `data/` (with `gh` as below, or from the release page).

```bash
cd yomiscript && git pull && cd models/yomi/mlx
source .venv/bin/activate
mkdir -p data && gh release download yomi-aug-v1 -R receptron/yomiscript -p yomi_aug_data_v1.tar.gz -D /tmp --clobber
tar xzf /tmp/yomi_aug_data_v1.tar.gz -C data
python train.py --config configs/tiny_aug.json --out ckpt/tiny_aug --distill
```

See `aug/LICENSE_DATA.md` for licenses (the Wikipedia-derived part is CC BY-SA).

### Option B: build from scratch on Mac (requires pyopenjtalk; no multi-GB downloads, about 1GB)

```bash
cd yomiscript && git pull && cd models/yomi/mlx
source .venv/bin/activate
uv pip install -r aug/requirements.txt     # pyopenjtalk, pyarrow
python aug/build_text.py                   # Tatoeba + 1 Wikipedia shard (about 170MB) -> data/aug_text/*.txt
python aug/aozora.py --works 400           # 400 Aozora Bunko works (fetched at 0.3 s intervals, 5-6 min)
python prepare_data.py --aug               # label with pyopenjtalk -> data/distill.jsonl, data/aug_stats.json
python train.py --config configs/tiny_aug.json --out ckpt/tiny_aug --distill
```

- The vocabulary changes, so you cannot `--resume` from the earlier `ckpt/tiny`. Train from scratch into a new output directory.
- `tiny_aug` is 60,000 steps. **Estimated** at 1-2 hours from the previous Mac measurement (about 0.06 s/step); it may take longer because the sentences are longer.
- Options: `--aug-max N` (cap per source, default 100k), `--rule-repeat N` (rule set repetitions, default 5), `--workers N`.

### Honest caveat: the distillation ceiling

The readings in the augmented data are pyopenjtalk output, so the model **also learns pyopenjtalk's errors as is**. The most we can expect is "closer to pyopenjtalk than with JSUT alone";
it gives no basis for surpassing pyopenjtalk (especially on homographs: pyopenjtalk scores 51.4% on the hard set). Surpassing it requires human readings such as ruby, a context-aware lexicon (YomiScript), and human labels.
On Aozora Bunko ruby, pyopenjtalk's reading matched in 32,167 of 43,273 cases (74.3%, a loose comparison that ignores long-vowel differences). Ruby also includes proper nouns and authors' idiosyncratic readings (gikun), so this is not the misreading rate on ordinary text.

- Verification (Linux CPU): `prepare_data.py --aug` takes about 45 seconds on 8 cores; 200 steps of training with the smoke config + `--distill` (train loss 3.31→2.66, dev loss 2.95→2.83, about 2.4 s/step). Not yet checked on Mac.

## Rough time estimates (**estimated, not measured**)

Rough estimates assuming an M1-M3 class Mac (GPU). These are not measurements.

| task | estimate |
|---|---|
| prepare_data.py (no distillation) | under 1 min |
| distillation, 50k sentences | 5-15 min |
| tiny 20,000 steps | 30 min to 1.5 hours |
| small 40,000 steps | 2-5 hours |
| evaluate.py | 1-3 min |

## Verification status

Verified by running the following on Linux CPU (x86_64, `mlx[cpu]` 0.32.4). **Not yet checked on Mac (Metal GPU).**

- prepare_data.py: built 4720 sentences (280 excluded); a 3-sentence distillation test also succeeded
- 300 steps of training with the smoke config: train loss 3.34 → 2.60, dev loss 2.83 → 2.64 (about 2 s/step, 598 s total)
- Inference, evaluation, benchmark, `--resume` and `--dtype bfloat16` all run to completion
- The smoke model's accuracy is near zero (0% JSUT sentence accuracy); this **only confirms that the code runs**. Measure accuracy by training tiny/small on a Mac.

## Notes

- Prosody evaluation aligns the output kana + symbol sequence character by character and compares it. The numbers should be close to the pyopenjtalk baseline (phoneme level), but the procedure is not strictly the same.
- Decoding is greedy + KV cache. Distribution with 8-bit quantization (D3) and the Memory layer (MoLD) are not in yet.
