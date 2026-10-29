# MoLD (Memory-of-Language/Domain) prototype — Yomi-0 (issue #8, H12)

A prototype that uses "shared weights" plus "swappable Memory" so that reading knowledge can be added or replaced later.
The only lexicon format is **YomiScript's (formerly KOE-IR) `.koedict`**. Any other lexicon must first be converted to `.koedict`.

## Two kinds of Memory

| | Lexicon memory (LexMemory) | Trained memory layer (ProductKeyMemory) |
|---|---|---|
| How it is built | Compile a `.koedict` (**no training, deterministic**) | Training (can also freeze the shared weights and train only the memory) |
| Contents | key = surface form (+ context conditions), value = reading | n_keys² slots (key/value). Reads the top-k per token |
| Where it sits | Before the encoder input (replaces the matching span with its kana reading) | In the encoder layer's residual (`model.memory.layers`) |
| Swapping | `MemoryRouter.add()/remove()`, `infer.py --dict` | Load `*.mem.safetensors` with `--memory` |
| Use | Personal names, proper nouns, technical terms, dialect vocabulary | Dialect/domain "habits" (accent tendencies, etc.) |

Lexicon memory fixes the reading (kana); the model copies that kana and predicts only accents and boundaries.
The values of the trained memory layer are **initialized to 0**, so adding it to an existing checkpoint such as tiny_aug does not change the output at first (backward compatible).

## Reading priority
1. Inline annotation `{梨奈|りいな}`
2. Lexicon entry whose context matches (`[context: 女性]` / `--sex female` / context words in the sentence)
3. `[default]`
4. The first entry with no condition
5. The model's own prediction

## Layer structure (for the same surface form, the higher layer wins)
```
user   (100)  User .koedict files (dict/names/*.koedict, etc.)
clean  ( 50)  Aozora Bunko ruby and human-checked readings
base   (  0)  .koedict converted from pyopenjtalk (NAIST-jdic)  * local only, do not commit
```
Specify them with `# layer: base|clean|user` and `# scope: always|name` at the top of the `.koedict` (default is user).
A lexicon with `scope: name` (everything under `dict/names/` gets this automatically) is used only in positions that look like personal names: right before an honorific (さん, くん, 様, …) and where a surname and given name appear side by side.
This prevents the error where the 「正」 in 「正しい」 (correct) gets the personal-name reading タダシ.

### Using pyopenjtalk's dictionary as base
pyopenjtalk's dictionary derives from NAIST-jdic (BSD-style; redistribution requires checking the attribution requirements), so it is not included in the repository.
`tools/pyopenjtalk_to_koedict.py` analyzes a local corpus with pyopenjtalk, collects "surface → most frequent reading" for morphemes containing kanji, and writes them to `mem/base_pyopenjtalk.koedict` (`mem/` is already in .gitignore).
Aozora ruby (clean) and the user lexicon (user) are layered on top to override and correct the base readings.
It can also be used for a "mismatch check" that compares pyopenjtalk's readings against the model output and the other layers (the step before the LLM cross-check in #16).

## Modes
- fixed: `--dialect kansai` uses `@lexicon(dialect: kansai)`. The trained memory is selected with `--memory`
- auto: `mold.detect_mode()` infers it from the input (only simple rules for now)
- An explicit setting always beats auto

## Implementation files
- `mold.py`: `.koedict` parser, `LexMemory`, `MemoryRouter`, `ProductKeyMemory`, `save_memory/load_memory`
- `yomi.py`: if `config.model.memory` is present, inserts memory layers into the encoder layers. `load(..., memory=)`, `predict(..., router=, context=)`
- `train.py`: `--init` (start from existing weights), `--memory-only` (train only the memory layers), `--save-memory`
- `infer.py`: `--dict`, `--sex`, `--context`, `--dialect`, `--memory`, `--show`
- `mold_demo.py`: compares readings with/without lexicon memory and measures latency
- `tools/pyopenjtalk_to_koedict.py`, `tests/test_mold.py`
- `configs/mold_smoke.json` (smoke test), `configs/mold_tiny.json` (same shape as tiny_aug + memory layer)

## Commands to try on the Mac
```bash
cd mulmovoice && git pull
cd models/yomi/mlx
pip install pytest && python -m pytest -q tests          # unit tests

# 1) Lexicon memory only (no training; works as is with the current tiny_aug)
python mold_demo.py --ckpt ckpt/tiny_aug
python infer.py --ckpt ckpt/tiny_aug --show --sex female \
  --dict ../../../dict/names/surnames.koedict --dict ../../../dict/names/given_names.koedict \
  "佐藤光さんが来た。" "智さんに会った。"

# 2) Use pyopenjtalk as the base layer (optional; do not commit the output)
mkdir -p mem && python tools/pyopenjtalk_to_koedict.py --text data/train.jsonl --out mem/base_pyopenjtalk.koedict
python mold_demo.py --ckpt ckpt/tiny_aug --extra mem/base_pyopenjtalk.koedict

# 3) Trained memory layer: continue training from the tiny_aug weights (memory layer initialized to 0)
python train.py --config configs/mold_tiny.json --init ckpt/tiny_aug --out ckpt/mold_tiny --distill \
  --save-memory ckpt/mold_tiny/default.mem.safetensors
python evaluate.py --ckpt ckpt/mold_tiny
python bench.py --ckpt ckpt/mold_tiny

# 3') Freeze the shared weights and train only the memory layer (example of building a domain/dialect memory)
python train.py --config configs/mold_tiny.json --init ckpt/mold_tiny --memory-only --steps 3000 \
  --out ckpt/mold_mem_x --save-memory mem/x.mem.safetensors
python infer.py --ckpt ckpt/mold_tiny --memory mem/x.mem.safetensors "今日は良い天気です。"
```
(The arguments for `evaluate.py` and `bench.py` are the same as before.)

## Next steps
- Formally add `[sex: male|female]` to YomiScript (for now `[context: 男性]` stands in)
- Make lexicon memory a "cross-attention over reading embeddings" instead of source replacement (so the lexicon can supply accents too)
- Combine with non-autoregressive single-pass output (target: 10 ms/sentence)

## Check on the Linux box (2026-10-24, MLX 0.32.4 CPU)
- All 5 unit tests pass. They cover priority (annotation > context > default), gender context, personal-name scope (「正しい」 is not replaced), layer overriding, rejecting anything other than `.koedict`, identical output when memory values are 0 (backward compatibility), saving and swapping memory, and agreement between fast decoding and reference decoding.
- Trained `mold_smoke` (1.76M parameters, one memory layer) for 300 steps on CPU (1151 s, dev loss 2.79). On this box one training step takes about 2.2 s, which is slow, and the model itself cannot yet produce meaningful readings. Check the reading improvement from the lexicon with tiny_aug on the Mac.
- Lexicon memory resolution worked as intended: 梨奈→リナ (default), 智→トモ (female) / サトシ (male), 佐藤光→サトウ + ヒカリ (female) / ヒカル (male), the 市 in 朝市→イチ (context), `{梨奈|りいな}`→リイナ (annotation).
- Latency: `router.resolve` takes 0.028 ms per sentence. The training cost of the trained memory layer was about +1% in a same-shape comparison (CPU).

## Fixes (following the tiny_aug check on the Mac)
1. **Long-vowel normalization**: when inserting a lexicon reading, convert o-row + ウ → ー and e-row + イ → ー to match the training labels (pyopenjtalk's pron form) (サトウ→サトー, ケイ→ケー). `mold.to_pron`. Can be disabled with `MemoryRouter(normalize=False)`. Inline annotations are converted by the same rule.
2. **Phrase boundary between surname and given name**: when a surname and given name side by side are both replaced, insert `#` at the seam between the two readings in the output so the given name becomes a separate accent phrase (`split_name_phrases`). If there is neither `]` nor `[` after the first mora of the given name, add `[`. pyopenjtalk gives 佐藤光 as `サ]トー#ヒ[カリ]ガ`. Can be disabled with `split_names=False`.
3. **No replacement inside a word**: candidates from always lexicons are chosen across all layers in the order "longer match > higher layer". In addition, they are used only when the span is aligned with morpheme boundaries. Boundaries are determined with pyopenjtalk if it is installed; otherwise a simple rule "the neighbors are not kanji" is used. This way the 市 inside 朝市 is not replaced, and only a standalone 市 becomes イチ by context (市役所 is not replaced either). If the base layer (pyopenjtalk conversion) contains 朝市, that longer match wins.

Check commands (Mac):
```bash
git pull && cd models/yomi/mlx && python -m pytest -q tests
python mold_demo.py --ckpt ckpt/tiny_aug
python infer.py --ckpt ckpt/tiny_aug --show --sex female --dict ../../../dict/sample.koedict \
  --dict ../../../dict/names/surnames.koedict --dict ../../../dict/names/given_names.koedict \
  "佐藤光さんが来た。" "朝市の市で魚を買う。" "市役所に行く。"
```

## Name training data (aug/names.py)

The problem where 佐藤光 becomes `^サ[トー#ヒ]カリ` (the correct one is pyopenjtalk's `サ]トー#ヒ[カリ`) is caused by the model not having been trained on sentences containing names. So we synthesize sentences containing names and add them to the training data.

- Source data: `dict/names/surnames_top200.csv` and `given_names_by_generation.csv`. Each given name is treated as one entry of (spelling, reading, gender).
- How to handle rows marked `is_estimated` is chosen with `--estimated`: `skip` excludes them, `down` (default) uses them with weight 0.3, `keep` uses them as is.
- Templates: full name, given name only, surname only. The honorific is chosen to match the gender from さん/様/くん/ちゃん/氏 and so on. Names are placed in both subject and object positions, and cue words such as 彼/彼女 (he/she) are included.
- Labels: accents and phrase boundaries come from pyopenjtalk. Name readings are forced to the lexicon reading, and after generation the reading is verified to match. Sentences where the name does not align with morpheme boundaries are discarded.
- About 10% of names are held out of training (unseen). There are two evaluation sets: `names_eval_seen` and `names_eval_unseen`.
- Evaluation (eval_names.py) runs on each set both without memory and with memory (using the surname and given-name lexicons and passing gender as context). Metrics are name_reading_acc, name_prosody_exact (fraction where the reading and accent of the name part match exactly), sent_kana_acc, boundary_f1 and accent_f1.
- `data/` is not in git. Everyone generates the data themselves.

## Base-layer converter (tools/pyopenjtalk_to_koedict.py)

Analyzes a corpus with pyopenjtalk and, for each morpheme containing kanji, outputs the most frequent reading and accent in the form `表記 = 読み [accent: N];`. Other readings are kept as comments. The header is `# layer: base` and `# scope: always`. Output goes to `mem/` (already in .gitignore) and is not committed because it derives from NAIST-jdic.

## Steps to run on the Mac (names)

```bash
python aug/names.py --out data/names --n-train 30000 --n-eval 1000
python eval_names.py --ckpt ckpt/tiny_aug                       # before training (without/with memory)
python train.py --config configs/tiny_aug_names.json --init ckpt/tiny_aug --out ckpt/tiny_aug_names \
  --distill --extra data/names/names_train.jsonl --extra-repeat 2
python eval_names.py --ckpt ckpt/tiny_aug_names                 # after training (without/with memory)
python evaluate.py --ckpt ckpt/tiny_aug_names                   # check that general sentences have not degraded
python tools/pyopenjtalk_to_koedict.py --text data/train.jsonl data/distill.jsonl --out mem/base_pyopenjtalk.koedict --min-count 2
```

When using `--init`, the vocabulary of the source checkpoint is carried over. If the weight shapes do not match, it stops with an error without starting training.

## Training on the box (Linux CPU) (2026-10-24)

- **CPU speedup:** the pip mlx-cpu wheel bundles the reference netlib BLAS, so it is slow (5.9 GFLOPS on a 1024² matmul). Installing `sudo apt-get install libopenblas0-pthread` and LD_PRELOADing it via `source tools/cpu_env.sh` gave 738 GFLOPS (about 125x). Training tiny (7.7M, batch 64) went from 38 s/step to 2.1–2.3 s/step. Operations other than matmul are now the bottleneck.
- **configs/tiny_box.json:** same shape as tiny_aug, 5000 steps. Trained on 306,635 distilled sentences plus 30,000 names_train sentences (`--distill --extra data/names/names_train.jsonl`).
- **Interim evaluation (1000 steps, dev loss 0.9189, 200 sentences each):**

| Set | Memory | Name reading correct | Name prosody exact match | Whole-sentence kana correct | Boundary F1 | Accent F1 |
|---|---|---|---|---|---|---|
| seen | without | 0.230 | 0.085 | 0.195 | 0.923 | 0.686 |
| seen | with | 0.775 | 0.235 | 0.715 | 0.937 | 0.669 |
| unseen | without | 0.225 | 0.140 | 0.190 | 0.907 | 0.651 |
| unseen | with | 0.780 | 0.265 | 0.705 | 0.956 | 0.677 |

- At 1000 steps, 佐藤光さんが来た。 came out as `^サ[トー#コ[ーサンガ#キ]タ$` without memory and `^サ[トー#ヒ[カルサンガ#キ]タ$` with memory (pyopenjtalk gives `サ]トー#ヒ[カリ`). The boundary `#` between surname and given name appears, but the surname's accent nucleus has not been learned yet. With memory it becomes ヒカル because, when no gender is passed, the lexicon's first reading is selected (`--sex` switches it).
- **Interim evaluation (1500 steps, dev loss 0.7340, 500 sentences each; evaluated on a copy of the in-training checkpoint. dev loss at 2000 steps is 0.6836):**

| Set | Memory | Name reading correct | Name prosody exact match | Whole-sentence kana correct | Boundary F1 | Accent F1 |
|---|---|---|---|---|---|---|
| seen | without | 0.388 | 0.242 | 0.354 | 0.945 | 0.740 |
| seen | with | 0.872 | 0.292 | 0.844 | 0.975 | 0.697 |
| unseen | without | 0.354 | 0.240 | 0.342 | 0.949 | 0.735 |
| unseen | with | 0.822 | 0.280 | 0.810 | 0.975 | 0.698 |

- General sentences at 1500 steps (evaluate.py, JSUT 280 sentences): kana CER 21.3%, sentence accuracy 10.0%, boundary F1 0.796, accent nucleus F1 0.432, accent phrase accuracy 0.359. Accuracy on the 70-sentence hard set is 8.6%. Training is still in progress, so it cannot yet be compared with tiny_aug (60k steps, CER 2.24%) or pyopenjtalk (CER 1.77%).
- At 1500 steps, 佐藤光さんが来た。 came out as `^サ]ト#ミ]ドトサンガ#キ]タ$` without memory, and `^サ[ト]ー#ヒ[#カ[リサンガ#キ]タ$` with the name lexicons and `--sex female`. The gender setting selected ヒカリ. The boundary between surname and given name appears, but the surname's accent (pyopenjtalk: `サ]トー`) still does not match, and an extra boundary is inserted between ヒ and カリ.
- **Why training on the box appears stalled:** the log shows stretches of 78–179 s/step, but the computation is not slow. The training process's elapsed time (based on OS uptime) was about 73 minutes, while about 6.5 hours of wall-clock time had passed since the log was created. The box is suspended while no agent is using it, and that wall-clock gap gets folded into the 50-step average. There was no CPU cgroup throttling (nr_throttled 0), no memory shortage, no swapping, and no other heavy process. While running it does 2.1–3.7 s/step. Training on the box only progresses while the box is awake, so the real comparison is done on the Mac with tiny_aug as the baseline.

## Memory-aware training and swapping trained memory (2026-10-24)

- **mem-aug:** during training, replace the input of some sentences with lexicon kana. It goes through the same path as MemoryRouter at inference (to_pron, personal-name detection, morpheme boundaries), and the target is unchanged. Personal-name sentences are replaced at rate `p_names`, other sentences at rate `p_general`. Configured with `train.mem_aug` in the config or `--mem-aug` (e.g. `configs/tiny_aug_names_mem.json`). This addresses accents breaking with memory, because the model had never seen kana-injected input during training.
- **Why seen with-memory reading accuracy was 0.939:** it was not a label error. In sentences where only the given name appears without an honorific (父の匠 / 名前は璃子 etc., 50 of the 500 seen sentences), the personal-name lexicon was not being used. Cue words around names (`NAME_CUES` / `NAME_TAILS`) were added, and we confirmed that the injected reading matches the label in every sentence of seen and unseen.
- **Loose vs. strict difference:** differences such as イー/イイ and ヨー/ヨウ come from inconsistent long-vowel notation in the reference labels (JSUT), not from model misreadings. Strict numbers come out lower by the amount of this inconsistency.
- **Trained memory (PKM):** the setting in `configs/mold_tiny.json` is 128² = 16,384 slots, topk 8, encoder layer 2, 3000 steps. The memory layer uses a learning rate multiplied by `mem_lr_mult` (10x) and no weight decay (MultiOptimizer; `--resume` is not supported in this case).
- **Swapping:** `--memory-only --only-extra` freezes the shared weights and trains only the memory layer on specific data. Evaluate by swapping it in with `--pkm X.mem.safetensors` in `eval_names.py` / `evaluate.py`.

## Why PKM did not learn, and the fix (2026-10-24)

Training mold_tiny on the Mac left the loss almost flat (0.436). With memory-only it also stayed at 0.426. Investigating with `tools/pkm_diag.py` found three causes:
- **Output too small:** the residual norm was about 156 while the memory output was about 0.02 (ratio 1.6e-4). Because the downstream LayerNorm divides by the residual's magnitude, the gradient to the value table was only about 4e-4.
- **Value table initialized to 0:** at the start all values were 0, so almost no gradient flowed to query and keys.
- **Softmax too flat:** the retrieval score standard deviation was only 0.4, so the top-8 weights were nearly uniform (mean max weight 0.16).

Fixes:
- Initialize the value table with N(0,1) random values and multiply by a scalar gate (initialized to 0). The output at the start is still 0, so it stays backward compatible.
- Multiply the output by the residual's RMS (with stop-gradient) so it acts at the same scale as the residual.
- Multiply retrieval scores by √k_dim to sharpen the softmax.
- When `--init` loads an old-version memory (values ≈ 0), discard it and initialize anew.
- Set the memory-only lr to 3e-3.

Checked on the box (starting from tiny_box, memory-only on personal-name data for 150 steps):
- Training loss: 0.5703 → 0.5666
- Personal-name unseen loss: 0.2338 → 0.2304
- Memory output / residual ratio: 2.5e-5 → 0.14
- Gate: 0 → 0.138

With memory-only, the number of slots used dropped from 1402 → 262 (routing imbalance). Left for future work.

Diagnostics: `python tools/pkm_diag.py --ckpt CKPT [--pkm X.mem.safetensors] --data data/names/names_eval_unseen.jsonl`

## PKM v2 (fixing routing collapse)
- Mac diagnostics (0e899c1): score_std 276 → softmax is one-hot (wmax 0.999), slots used 231/16384, gate ≈ 0, ratio 0.0024.
- Fix: cosine similarity with L2-normalized query halves and subkeys × temperature (`temp`, default 15). Value table starts at 0,
  gate starts at 1 (output at the start is still 0, and gradients flow to the values). Auxiliary load-balancing loss
  (`balance`, default 0.01; n·Σp² − 1 of each half's key distribution). `temp`/`gate_init`/`balance` can be changed in `model.memory`.
- Box (tiny_box frozen + memonly 300 steps on 2000 name sentences): old wmax 0.9998 / slots 193 / names loss 0.179 → new wmax 0.19 / slots 2447 / 0.139.
- Running memonly on names alone worsens general-sentence dev (0.684→0.723). Mixing in general sentences (no `--only-extra`, `--extra-repeat 5`) gives
  dev 0.626 (better than without memory), names 0.153, unknown names 0.224 (without memory 0.239).

## Experimental design to measure the effect of swapping (base model frozen)
mold_tiny trained the base model including names_train, so swapping the memory makes no difference (Mac: seen 99%).
Freeze a base model that has not seen personal-name data (tiny_aug, or tiny_box on the box), train only the memory, and compare:
1. default = `--memory-only --distill` (general sentences only) 2. names = continue from default with `--extra names_train --extra-repeat 2`.
Box (tiny_box frozen, 600 steps, eval_names --limit 200, %):

| memory | JSUT CER | sent | hard | seen reading (model) | unseen reading (model) |
|---|---|---|---|---|---|
| none (values 0) | 19.7 | 17.5 | 15.7 | 57.5 | 48.0 |
| default (general) | 17.3 | 18.9 | 17.1 | 51.0 | 46.5 |
| names (fresh, enc.2) | 19.5 | 16.8 | 11.4 | 69.5 | 55.5 |
| names (lr 1e-2) | 19.1 | 14.6 | 14.3 | 69.0 | 57.5 |
| names (enc.3) | 18.5 | 16.1 | 17.1 | 70.5 | 58.5 |
| names (continued from default) | 18.7 | 16.4 | 12.9 | **72.0** | 59.5 |

### Stacked memory (memory2, box frozen tiny_box, names --limit 200)
Freeze default (enc.2) and train only a names memory2 (enc.3) (`--train-mem mem2`, names×2 + general, 600 steps).
Load them stacked with `--pkm a.mem.safetensors,b.mem.safetensors`.

| Memory | JSUT sent | JSUT CER | hard sent | names seen | names unseen |
|---|---|---|---|---|---|
| default only | 18.9 | 17.3 | 17.1 | 51.0 | 46.5 |
| names alone (continued from default) | 16.4 | 18.7 | 12.9 | 72.0 | 59.5 |
| default + names (no gate) | 15.4 | 17.7 | 11.4 | 67.5 | 54.5 |
| default + names (cond_gate) | 18.2 | 17.7 | 15.7 | 65.0 | 56.5 |

### Preventing leakage in stacked memory (box, same conditions as above, mem2 = enc.3 cond_gate)
The degradation is caused by the names memory gate staying open on general sentences (JSUT) (mean 0.43). Three countermeasures were added to `train.py`:
`--leak-kl` (KL toward the output without mem2 on general sentences), `--gate-l1` (L1 on the gate for non-name tokens), `--gate-sup` (supervised BCE on the gate using the personal-name spans in the `names` field).
Gate statistics are `cond_gate_mean` in `tools/pkm_diag.py` (name tokens / other tokens in name sentences / general sentences).

| Method | JSUT sent | CER | loose | hard | Accent phrase | names seen | unseen | seen prosody | Gate name / other / general |
|---|---|---|---|---|---|---|---|---|---|
| default only | 18.9 | 17.3 | 19.6 | 17.1 | 44.5 | 51.0 | 46.5 | 36.0 | – |
| stack_cg | 18.2 | 17.7 | 18.6 | 15.7 | 45.6 | 65.0 | 56.5 | 51.0 | 1.00 / 0.97 / 0.43 |
| + gate-sup 1 (**recommended**) | 18.6 | 17.7 | 19.3 | 15.7 | 45.1 | 66.0 | 57.5 | 49.5 | 0.79 / 0.07 / 0.08 |
| + leak-kl 1 | 18.6 | 18.0 | 19.3 | 17.1 | 43.6 | 64.5 | 55.5 | 47.0 | 1.00 / 0.95 / 0.40 |
| + kl 1 + gate-sup 1 | 18.6 | 17.9 | 18.9 | 14.3 | 44.0 | 63.5 | 56.5 | 46.5 | 0.79 / 0.07 / 0.08 |
| + gate-l1 0.3 | 18.9 | 17.3 | 19.6 | 17.1 | 44.5 | 51.0 | 46.5 | 36.0 | 0 / 0 / 0 (collapsed) |
