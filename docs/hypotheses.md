# Hypotheses (H0–H12)

The numbers in the success criteria are targets.

## H0

- **Hypothesis**: An intermediate language (KOE-IR) that carries reading, accent, phrase boundaries, pauses and style tags but no timbre lets the front end and the acoustic back end be developed and swapped independently
- **Method**: Feed the same KOE-IR to 2-3 back ends (Kokoro family, VITS family, our own Koe-S) and compare misreading rates and subjective evaluation
- **Success criteria**: Misreading rate goes down on every back end, and the spec conformance tests pass. At least one external implementation appears

## H1

- **Hypothesis**: A small model (tens of millions to 100 million parameters) that outputs reading, accent and phrase boundaries at once reads kanji more accurately than the lexicon-based pyopenjtalk
- **Method**: Compare against pyopenjtalk, pyopenjtalk-plus and zenz on the Joyo Kanji Yomi Benchmark (MIT) and the unified G2P benchmark (CC BY-SA)
- **Success criteria**: Reading accuracy at or above pyopenjtalk, accent nucleus agreement at or above the model bundled with MARINE, under 10ms per sentence on Mac (target)

## H2

- **Hypothesis**: The same model run in reverse (kana→kanji) can also do IME conversion, and sharing reading data improves both directions
- **Method**: Compare multi-task training on reading→orthography and orthography→reading against single-direction training. zenz-v3.2-small (95.1M) is the baseline
- **Success criteria**: Equal conversion accuracy with no more parameters than zenz, or bidirectional training is better

## H3

- **Hypothesis**: A Japanese-leaning Japanese-English + code vocabulary (about 48k-64k) gives a better balance of Mac speed and quality than a Japanese-only vocabulary or a 100k vocabulary
- **Method**: With 4 vocabularies (32k/48k/64k/100k) × a 125M-class model, measure tokens per Japanese character, validation loss, and generation time per character on Mac
- **Success criteria**: Lowest generation time per Japanese character, with loss no more than 1% worse than the best vocabulary (target)

## H4

- **Hypothesis**: Adding a sparse external Memory to a ternary core gives quality at or above a BF16 dense model at the same Mac decode speed
- **Method**: Compare scaling curves for 4 conditions (BF16 dense / ternary dense / BF16 + Memory / ternary + Memory) × 30M, 125M, 350M
- **Success criteria**: At the same bytes read per token, ternary + Memory has validation loss at or below BF16 dense. Consistent across the 3 sizes

## H5

- **Hypothesis**: On Mac unified memory, the lookup cost of the Memory layer stays under 10% of decode time
- **Method**: On Metal/MLX, vary table size (0.1-4GB) and top-k and measure per-token latency
- **Success criteria**: Overhead under 10% (target)

## H6

- **Hypothesis**: A custom Metal kernel for ternary weights is faster than existing Mac paths
- **Method**: On a 1B-class ternary model, compare against bitnet.cpp (CPU) and the llama.cpp TQ format
- **Success criteria**: At least 1.5x the existing paths (target). Release the kernel as OSS

## H7

- **Hypothesis**: Putting our own G2P in front of a TTS reduces misreadings
- **Method**: Replace the front stage of Kokoro-82M and Irodori-TTS Small, read the audio back with ASR, and compare CER
- **Success criteria**: Misreading rate drops significantly while the real-time factor is maintained

## H8

- **Hypothesis**: A small JEPA-style predictor can do short-horizon planning in toy environments on Mac more cheaply than LLM language planning
- **Method**: Train V-JEPA 2-AC-style latent prediction + CEM planning in simple grid-world and GUI-operation environments
- **Success criteria**: Success rate at or above an LLM-only baseline, under 1 second per plan (target)

## H9

- **Hypothesis**: Training Yomi-0 as ternary from scratch reaches the same accuracy as BF16 training + 8-bit quantization (comparison experiment only; the main path is dense BF16→8-bit)
- **Method**: With the same data and scale, compare BF16→8-bit (with QAT if needed), 4-bit, and ternary trained from scratch
- **Success criteria**: If the difference in reading and accent accuracy is within 1 point (target), use ternary for front-end research in the TTS/LLM line

## H10

- **Hypothesis**: Adapt with Memory instead of LoRA: a Yomi-0 with a sparse key-value Memory layer can adapt to a new domain (new words, proper nouns, abbreviations) with memory writes alone, without updating weights. @import-ing a .koedict is itself a write from the lexicon into the model's Memory (Memory write). Prior work: product-key memory (Lample et al. 2019), Memory Layers at Scale (Meta 2024), kNN-LM (Khandelwal et al. 2019). kNN-LM adapts to a domain just by swapping the retrieval datastore with no additional training; a model trained on Wikipedia went from 34.84 to 20.47 perplexity on Books (Table 4 of that paper, verified)
- **Method**: On terms from a domain not included in training, compare (a) memory write (b) LoRA (c) simple lexicon substitution. Metrics: reading accuracy, context-based disambiguation of newly added homographs, latency and RAM usage on Mac. Limitation: Memory can add knowledge (words and readings), not procedural changes such as accent rules. Whether Memory is looked up correctly in context needs separate verification
- **Success criteria**: Reading accuracy within 1 point of LoRA, homograph disambiguation better than lexicon substitution, added latency under 1ms per sentence, and writing 10k words within a few seconds (all targets)

## H11

- **Hypothesis**: MoLD (shared weights + per-language Memory, D10 and D11) can support multiple languages and dialects, with RAM of only "weights + one Memory", and accuracy close to separately built per-language models. Prior work: X-MOD (arXiv:2205.06266), MAD-X (arXiv:2005.00052). Both verified, but their results are on text understanding tasks. Risk: Japanese and English have different phoneme systems, so the shared weights may also need small per-language adjustments
- **Method**: On ja/en (plus the Kansai dialect if time allows), compare 3 approaches: (a) shared weights + per-language Memory (b) separate per-language models (c) shared weights + small per-language adapters. Metrics: reading accuracy, accent accuracy, runtime RAM usage and latency on Mac. Also evaluate auto mode (D12) on sentences that mix languages and texts that mix dialects: classifier accuracy, Memory switching latency (with and without residency), and accuracy gap versus fixed mode
- **Success criteria**: (a)'s reading and accent accuracy within 1 point of (b), RAM below the total of (b) across all languages, added RAM per language for Memory within tens of MB, latency increase within 10% of (b). Auto mode: per-sentence classification accuracy of 95% or more, switching to a resident Memory under 1ms per sentence (all targets)

## H12

- **Hypothesis**: Compiling the lexicon into Memory: the contents of the Lexicon can be written into Memory without training, deterministically, in seconds (write = compile). Key = computed by passing each entry (orthography, optionally part of speech and context features) through a shared encoder. Value = simply a lookup of pretrained reading and accent embeddings. Prerequisite: the model must be trained during pretraining to "follow the Memory values". Verification follows the same idea as compiler tests: automatically run conformance tests on the compiled Memory (is each entry read as the lexicon says). Issue: homographs cannot be told apart by orthography-only keys and need context-aware keys. Approach: include the lexicon's context conditions [context: …] (D13) in the key computation when compiling, and register [default] entries as context-free keys. Related work (verified): kNN-LM (see H10) is close in that it swaps datastores without training. By contrast, the knowledge-editing methods ROME (arXiv:2202.05262) and MEMIT (arXiv:2210.07229) also compute keys from internal states, but optimize values by gradient and rewrite the weights themselves. ROME takes about 2 seconds per edit on GPT-2 XL (A6000); MEMIT takes about 6.5 hours of value computation + about 0.9 hours of updates for 10k edits on GPT-J (both figures from the papers)
- **Method**: Put the same lexicon into the model via (a) compilation (no training) (b) LoRA (c) gradient-based memory write (the H10 approach) and compare. Metrics: compile time, reading and accent accuracy of compiled entries, homograph disambiguation, selection accuracy for context-conditioned entries (whether it picked the entry matching the context, or [default] when none matched), compile time on DGX Spark and Mac, RAM (unified memory) usage on DGX Spark. Also check that the same input yields the same Memory (determinism)
- **Success criteria**: Compiling 10k words within a few seconds on DGX Spark, and within a few seconds on the user-side Mac (Apple Silicon) that loads the lexicon; selection accuracy for context-conditioned entries of 95% or more; RAM growth stays proportional to the number of entries; conformance tests show reading agreement of 99% or more and accent within 1 point of (b); homograph disambiguation equal to or better than (c); the same input always yields identical Memory (all targets)
