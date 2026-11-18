# qwen-3 values-only experiment

This experimental runner accepts Japanese YomiScript with text spans and supplied
accent phrases. It writes three F0 values per mora and removes accent marks. Values retain
numeric precision rather than using the core formatter's two-decimal rounding.
Inference loads only the saved float32 network and its surface/reading key table;
it does not load a dictionary. Existing dictionary and qwen-2 engines are unchanged:

```sh
node qwen3.mjs --engine qwen3 'ja /soː<t:そう> | da<t:だ> ↘/'
node qwen3.mjs --engine dictionary 'ja /soː<t:そう> da<t:だ> ↘/'
node qwen3.mjs --engine qwen2 'ja /soː<t:そう> da<t:だ> ↘/'
```

The runner uses plain JavaScript inference. This is an experiment confined to this
folder, not an integration into the published package. Training uses PyTorch on
CPU because MPS is unavailable in the sandbox. No audio or services are used.

## Reproduction

Run from this folder using the existing local datasets and cached published models:

```sh
../prosody_ref/.venv/bin/python prepare_values.py
node rows_values.mjs
node complete_words.mjs
../prosody_ref/.venv/bin/python audit_values.py
../prosody_ref/.venv/bin/python train_values.py
../prosody_ref/.venv/bin/python finish_values.py
```

`work/values_movement_pretrain.pt` caches 16 epochs of isolated-word value pretraining;
remove it for a complete retrain. Sentence training writes `work/qwen3_movement.pt`
and `work/values_movement_history.json`, isolated from the older fall-based attempt.
The residual variant uses `work/qwen3_prior.pt` and
`work/values_prior_history.json`. `finish_values.py` compares it against the direct
model, fine-tunes on annotation alone, and copies the global best
checkpoint to `work/qwen3.pt` for export and inference. It verifies the runtime
before invoking the single final test evaluation.
The shipped artifacts are `work/qwen3.bin`, `work/qwen3.json`, `qwen3.mjs`, and
`values_runtime.mjs`, plus the existing core parser package. The metadata contains
memory keys, feature vocabularies, IPA-to-kana mapping, and tensor shapes. The
PyTorch checkpoint and inspection vocabulary are not additional shipped files.

All 421,060 spoken NAIST-JDIC surface/reading keys are included, without the old
12-character/12-mora cutoffs. Nonspoken punctuation entries have no pitch target.
When the source dictionary has several analyses of a surface/reading key, its
first accent wins. For 20,482 entries the isolated-word parser cannot represent,
`complete_words.mjs` uses pronounceable surrogate morae for the linear contour.
This approximates the teacher, particularly for stems ending in a geminate.
Original surface/reading keys and input mora features are retained.

The word encoder combines trainable 32-dimensional memory, first/last surface
characters, mora identity, position, and length. A two-layer bidirectional LSTM
predicts three pitch values per mora. Both isolated-word pretraining and sentence
training use the exact movement distance in `value_metrics.movement_distance`.
All three values per mora are flattened in order; missing values are skipped
and their neighbors joined, including across pauses. For steps a and b,
c = (a - b)^2 + 4 max(0, -ab); distance = mean(c^2)^(1/4).
There is no value regularizer and no extra weighting around accent morae.
Accent strength comes solely from the linear-contour teacher values.
No fall target, fall output, threshold, or fall decoding is used. The residual variant adds the pretrained word-value head to the sentence output;
the direct variant predicts values without this addition. Memory stays trainable
in sentence training. The existing longest surface/reading-prefix lookup is reused;
inflection retrieval remains a limitation. No check-word exceptions are added. The confirmed check labels and their
sentence rows are evaluation-only; ordinary dictionary entries for those words
remain in the required all-entry word pretraining.

Development is SHA-256(name)'s first byte below 32, restricted to non-test rows.
Odd JSUT ids and checks are excluded from training and development. Annotation
has weight 1.0; dictionary/Qwen weights are 0.25/0.35 in phase 1 and 0.10/0.15 in
phase 2. The direct variant uses 12 epochs per phase; the word-value residual variant
uses 6. Each second phase starts from its first phase's best checkpoint. A final annotation-only
teacher-weight candidate tries 20 epochs at learning rate 0.0002 and retains the global best.
Every checkpoint and teacher setting is selected solely by mean sentence movement distance to the
166 annotated development sentences. `work/data_audit.json` records coverage.

Final evaluation is one test look after selection, on the odd JSUT sentences
with all three predictions, gold values, and measured targets available. Gold
uses every mora and all three values. Measured-Qwen comparisons use the same
finite target points for all engines. The corpus metric is the arithmetic mean
of sentence distances in semitones. Earlier fall-output/RMSE experiments already
exist in this folder; they are not used to select this movement experiment.

Checks retain their supplied sentence contexts and phrase boundaries. Their
confirmed accents are independently encoded in `check_teachers.mjs`, then passed
through the published linear contour; other context words retain dictionary
accents. In particular, the confirmed complete 見たいもんだなあ contour has only
the fall after タ. Check distances cover the full supplied sentences and are
never used for training or selection. Text and intermediate data stay in `work/`;
`results/qwen3.json` contains aggregate numbers and check words only.

`verify_metric.py` checks level-shift invariance, opposite movements, joining
across missing values, and finite gradients. Run Ruff with `--no-cache` in the
sandbox because the repository-wide Ruff cache is outside the writable roots.

## Frozen result

The final numbers are in [results/qwen3.json](results/qwen3.json). The direct
values model won development selection after annotation-only fine-tuning.
There were 56 development candidates on 166 annotated sentences and one final
test evaluation on 1,214 odd JSUT ids. The main annotated-value distance improves
on the dictionary, but every supplied check is worse than the dictionary.
Qwen-2 remains closer to measured Qwen. This does not justify replacing the
current engine.

The exported JavaScript matches PyTorch within 0.0000042 semitones on the five
development probes, preserves the YomiScript output contract, and uses only the
saved network and key table. The checkpoint comparison confirms that 20,169
memory vectors changed during sentence training. Changed experiment files pass
Ruff and ESLint; the split extraction preserves the original sentence lists.

Known limitations include the coded prefix lookup (94.5% training-word hit rate,
not verified retrieval accuracy) and 20,482 approximate isolated-word teachers.
The recommended next experiment is inflection-aware memory retrieval, selected
on development data without using these final test scores to choose it.

## qwen-4 continuation: fixed two-teacher selection

The continuation is isolated from the frozen qwen-3 artifacts. Its selection
number is `S = annotation movement distance + measured-Qwen movement distance / 4`.
Both parts use `value_metrics.distance`, the same calculation as
`evaluate_values.py`. Selection uses the same 166 annotated development
sentences, restricted to available measured targets. Missing measured values are
joined exactly as in the previous evaluation. Checks are report-only.

Reproduce locally without services or audio:

```sh
../prosody_ref/.venv/bin/python generate_inflections.py
node inflection_teachers.mjs
../prosody_ref/.venv/bin/python -u run_continuation.py
../prosody_ref/.venv/bin/python calibrate_continuation.py
../prosody_ref/.venv/bin/python refine_continuation.py
../prosody_ref/.venv/bin/python anchored_continuation.py
../prosody_ref/.venv/bin/python refine_continuation.py --annotation-only
../prosody_ref/.venv/bin/python finish_continuation.py
../prosody_ref/.venv/bin/python verify_continuation.py
../prosody_ref/.venv/bin/python report_continuation.py
```

`finish_continuation.py` refuses to repeat a completed final evaluation. The
selection is written to `work/continuation_selection.json` before checks or test
scores are computed. Every final candidate checkpoint receives one test evaluation in a single final
batch, after the development winner is frozen. Each candidate evaluation counts
as a test look; baseline engines are compared on the same rows. The cumulative
look counter is shared with the earlier movement experiment. No test score can
change the frozen winner. Before test scoring, every raw float32 export must
match its checkpoint exactly on development probes, and every held-out memory
vector must match the fresh pretraining checkpoint exactly.

For a full retrain of the continuation, remove `work/continuation_pretrain.pt`
first. Reusing this cache skips pretraining and changes the random-state
progression, so it is not a bitwise replay of the recorded fresh run.

Fresh word pretraining excludes any surface containing the literal check stems
listed in `generate_inflections.py`. Sentence training excludes any sentence
containing such a word. This deliberately broad surface filter also removes
unrelated words containing those characters. The same filter removes entire
lemma families from the generated inflection requests. Earlier checkpoints are
not reused. All dictionary keys are retained, including untrained held-out keys.

The generator reads basic-form verbs and adjectives from NAIST-JDIC. Supported
conjugation classes are ichidan, godan, suru-class verbs ending in する, and
adjectives. The implemented rules cover 21,078 basic entries; 173 unsupported entries
(including zuru-class, kuru-class, and archaic classes) are skipped. Godan
forms use the appropriate voiced or unvoiced ending, with an 行く exception.
Each form is passed through the published `accentMarks` (including its user
dictionary and maintainer rules) alone, after 本を, and after もう. These are
synthetic weak teachers, not verified conjugation or accent annotations. Parser
failures are counted. Of 543,834 requested form/frame examples, the stem filter removes 29,697
(5.4607%). The remaining 514,137 requests yield 513,705 rows and 432 parser
skips. All requests, text rows, and value targets stay in `work/`.
A seeded uniform reservoir of 60,000 successful examples limits CPU cost; each
epoch samples 18,000 of those. Adjective frames are also mechanical weak data.

All candidates share fresh 16-epoch isolated-word pretraining. Each then runs
18 sentence epochs, with learning rate 0.0005 for ten epochs and 0.00015 for eight.
Annotation examples occur four times with weight 1, dictionary examples once
with weight 0.3, and measured examples once with weight 0.25. Synthetic examples
have weight 0.5. Checkpoints are chosen strictly by development S.

- **qwen4:** coded longest-prefix retrieval, direct values, no synthetic teachers.
- **qwen5:** the same model with the inflection teachers.
- **qwen6:** inflection teachers and learned attention over every key whose
  surface is a substring of the word and whose reading is a substring of its
  supplied reading. There is no top-k cutoff. Attention uses mora and within-word
  position as its query; substring order and relative entry offsets are not
  explicitly modeled.
- **qwen7:** the same attention and teachers, with an accent output trained on
  annotation/dictionary and a smaller one-layer bidirectional GRU shape output
  trained on measured Qwen. The output is accent plus one quarter of shape.
  The accent output is detached for measured supervision. Input embeddings are
  shared, so measured supervision can still update those through the shape path.

**qwen8** calibrates the development winner's output gain on a fixed 17-point
grid from 0.6 to 1.4, using development S only. It adds no trained parameters.

**qwen9** starts from the lowest-S checkpoint among qwen4--qwen7 and fine-tunes
for 20 epochs at learning rate 0.0002 on clean training sentences that have both
annotation and measured targets, with weights 1 and 0.25. It receives no new
dictionary or synthetic supervision in this phase and is selected by development S.

**qwen10** starts from the development winner among the direct-output candidates
(qwen4--qwen6), freezes its parameters, and fits only a new shape GRU on paired
annotation/measured targets with weights 1 and 0.25. Both losses supervise the
complete output. The shape is `0.25 * tanh(head)`, so each value changes by at
most 0.25 semitones. Twenty epochs use learning rates 0.001 then 0.0002, with
the unchanged source model also retained as the epoch-zero option.

**qwen11** is the annotation-only counterpart of qwen9, with the same starting
checkpoint, paired-sentence pool, learning rate, and 20-epoch budget. Development
S, including measured Qwen, still selects its checkpoint.

Each candidate has its own `work/qwenN.pt`, raw float32 `.bin`, metadata/key table,
and epoch history. `work/continuation_best.*` contains copies of the selected
candidate. The raw weights and metadata can be loaded with
`infer_continuation.py`, using input mora rows with their supplied word spans and
phrase positions; the inference path never loads the dictionary. Its dependency
is the local Python/PyTorch implementation, not the older JavaScript runner.
Artifact size counts raw float32 weights, the complete UTF-8 key table, feature
metadata, and local inference source, excluding the shared Python/PyTorch runtime.

### Measured continuation results

These are **test** distances for all frozen final candidates; checks are report-only. Decimal MB includes float32 weights, all keys, metadata, and inference source.

| Candidate | Annotation | Measured Qwen | S | Mean checks | MB |
| --- | ---: | ---: | ---: | ---: | ---: |
| qwen4 | 0.4754 | 1.8738 | 0.9438 | 1.0120 | 71.134 |
| qwen5 | 0.4756 | 1.8862 | 0.9472 | 0.5721 | 71.134 |
| qwen6 | 0.4866 | 1.8815 | 0.9570 | 0.5327 | 71.143 |
| qwen7 | 0.7357 | 1.8653 | 1.2021 | 0.8785 | 71.201 |
| qwen8 | 0.4722 | 1.8689 | 0.9394 | 1.0255 | 71.134 |
| qwen9 | 0.4789 | 1.8687 | 0.9460 | 1.0133 | 71.134 |
| qwen10 | 0.4758 | 1.8704 | 0.9434 | 1.0149 | 71.192 |
| qwen11 | 0.4751 | 1.8900 | 0.9476 | 1.0211 | 71.134 |

Development selection (same 166 sentences for every candidate):

| Candidate | Annotation | Measured Qwen | S |
| --- | ---: | ---: | ---: |
| qwen4 | 0.4656 | 1.8672 | 0.9324 |
| qwen5 | 0.4671 | 1.8766 | 0.9362 |
| qwen6 | 0.4827 | 1.8850 | 0.9540 |
| qwen7 | 0.7540 | 1.8969 | 1.2282 |
| qwen8 | 0.4620 | 1.8658 | 0.9285 |
| qwen9 | 0.4674 | 1.8628 | 0.9331 |
| qwen10 | 0.4648 | 1.8663 | 0.9313 |
| qwen11 | 0.4645 | 1.8862 | 0.9361 |

Development selected **qwen8**. The final test batch covers 1214 odd JSUT sentences.

| Test model | Annotation | Measured Qwen | S |
| --- | ---: | ---: | ---: |
| dictionary | 0.4710 | 1.9372 | 0.9553 |
| qwen2 | 0.9199 | 1.6270 | 1.3267 |
| Frozen qwen-3 (earlier look) | 0.4435 | 1.8845 | 0.9147 |

The winner does not beat the stated test benchmark S = 0.914. Eight candidate test looks in one final batch bring the shared counter to **9**. All candidates and the winner were frozen before checks or test; test scores did not change selection.

No candidate beats S = 0.914, and the selected model's checks remain far. Gain calibration and the bounded adapter slightly improve test S over qwen4. Inflection teachers reduce report-only check mean from 1.0120 to 0.5721; attention reduces it further to 0.5327, while worsening S. The unanchored shape branch and both whole-model refinements do not improve S. No new candidate is better on both teacher distances than the dictionary or qwen2.

All eight float32 exports match their checkpoints exactly on development probes, all saved selection scores reproduce, and 11,711 held-out memory vectors stay unchanged. The split and generated-request exclusion audits pass. All inference payloads and individual checkpoints are below 100 decimal MB.

| Best candidate check | Distance |
| --- | ---: |
| 0: そうだ | 0.9312 |
| 1: そうだ | 0.3275 |
| 2: 寝てる | 1.2156 |
| 3: 着てる | 1.1996 |
| 4: 出てる | 1.1427 |
| 5: 見てる | 1.2238 |
| 6: 呼んでる | 0.6945 |
| 7: 読んでる | 1.3026 |
| 8: 持ってる | 1.1233 |
| 9: 盛ってる | 1.0726 |
| 10: 兼ねてる | 1.2834 |
| 11: 食べて | 1.2251 |
| 12: やめて | 0.8042 |
| 13: ぴかぴか | 1.2190 |
| 14: 当軒 | 0.5410 |
| 15: 見たいもんだなあ | 1.1015 |

The check mean is 1.0255. There were 149 development settings: 72 main epoch checkpoints, 60 refinement/adapter checkpoints, and 17 gain settings. Main run wall time was 141.1 minutes; recorded refinement/adapter time was 4.4 minutes.

Selected weights: `work/continuation_best.pt`, with raw float32 weights and metadata alongside it. Full measurements: [results/qwen4.json](results/qwen4.json).

Next step: use a separate development set with held-out verb lemmas to choose inflection retrieval and relative-entry positions; keep these test sentences and confirmed checks for final reporting.

## Listening: not adopted (2026-11-06)

qwen5 and qwen6 against the tools as they are (the dictionary and qwen-2), blind, one listener, 12 short sentences with the checked words and 8 sentences of the story not heard before, 2 repeats (`compare_listen.mjs`, `results/listening_compare.json`): most natural current 8, qwen5 1, qwen6 0, the same 8, no answer 5; unnatural current 6, qwen5 8, qwen6 9. So neither is better by ear, though both are nearer the annotation by the movement distance, and qwen-3 has stopped here. Numbers are not the ear: the published model is the nearest to measured Qwen and the farthest from the annotation as values, which may mean that teachers should lean on Qwen. A memory inside the network is not ruled out by this.

## Earlier attempts

Before the values-only design, experiments 1 to 6 predicted a separate fall output. Only their results stay (`results/lexicon.json`, `memory.json`, `sentence.json`, `sentence2.json`, `sentence3.json`): fall F1 on JSUT's odd ids at best 0.755 with the LLM's phrases, against 0.759 for the dictionary with its own phrases; words in memory reproduced at 98.8%, words it has no entry for at 77.9%.

