# Before submission

Each item says what it would show. In rough order of importance.

1. **Independent gold readings with agreement.** Two or more annotators (not the authors, no LLM help) read every
   sentence; report inter-annotator agreement (Cohen's or Fleiss' kappa) and adjudicate. Shows that the hard-set
   result is not an artefact of provisional, possibly LLM-influenced gold.
2. **A few hundred homograph sentences, and existing benchmarks.** Several contexts per homograph, balanced between
   readings, plus published sets (e.g. the Joyo Kanji Yomi Benchmark and the unified G2P benchmark named in
   `docs/hypotheses.md` H1). Gives confidence intervals and per-word results instead of 35 sentences.
3. **Repeated runs.** At least 5 calls per LLM and condition, reporting mean and spread, and a run with the prompt
   frozen before seeing the new sets. Shows the result is stable and not prompt-tuned to the test set.
4. **Smaller and local LLMs.** A range of sizes (open-weight models that run locally, small API models). Shows where the
   approach stops working, which matters for an MCP server called by any LLM.
5. **Human listening tests.** MOS for naturalness and a reading-correctness judgement per sentence, comparing Kokoro and
   the Supertonic Katarite on the same YomiScript, the original front ends, and a cloud TTS. Measures naturalness, which
   Whisper cannot, and confirms the informal impression that Supertonic sounds more natural when its reading is right.
6. **Context-aware baselines.** A Japanese G2P that uses context (a neural reading model) next to pyopenjtalk. The
   LLM reading someone else's text is done (`eval/author_reading`, one run): repeat it, review its readings, and try
   terser answers and free conversation.
7. **Latency and token cost in the browser.** The synthesizer's side is measured on one laptop
   (`eval/browser_bench`: loading, real-time factor on WASM and WebGPU, memory). Left: the time to first audio with
   the YomiScript streamed per sentence from the LLM, output tokens per character of speech with and without the text
   layer, a phone and other browsers, and why the encoder's durations go wrong on WebGPU.
8. **Long-utterance splitting.** The Kokoro Katarite must split an utterance at its inner sentence ends to fit Kokoro's
   510 phonemes; then the long passage can be included. Removes the one failure in the sets.
9. **English evaluation.** An English heteronym set (read/lead/live, numbers, abbreviations) and listening, since
   phonetic-detail differences from Kokoro's front end are audible. Shows whether the result carries over beyond Japanese.
10. **Accent from the Yomite.** Optionally let the LLM write accent marks and turn them into pitch values for Kokoro
    (`<f0:…>`), compared with Kokoro's own prosody. Tests whether Japanese pitch accent, not only readings, improves.
11. **Bibliography.** Resolve the entries marked TODO verify in `references.bib` (the LLM-G2P works in Related work are
    checked).
12. **Confirm the commercial misreadings by ear.** Listen to every word the judge marked misread or close
    (`eval/tts_readings/results/review.md`) and correct Table `tab:commercial`; check the judge on commercial speech, not
    only on Kokoro's. Add more voices per service.
13. **A 4-6 page version (issue #20).** The draft is 11-point single-column with six tables. Keep the main line
    (same-call pronunciation in YomiScript; context is what matters) and move the rest:
    - Keep in the body: Introduction (two paragraphs and three contributions), YomiScript (roles, notation, one
      example with the text layer), Setup (sets, Yomites, scoring, a short paragraph on the judge), Table `tab:hard`,
      Table `tab:author`, Table `tab:commercial` (drop the per-category columns or the every/any columns), Limitations
      as one compact paragraph, Conclusion.
    - Move to an appendix: Table `tab:parity` and the parity section (one sentence stays in the body), the Supertonic
      Katarite and Table `tab:asr` (one sentence stays), the judge's validation and the two rejected judges, the
      55-sentence re-scoring of the commercial systems, the prompt rounds, the second YomiScript example.
    - Cut: Table `tab:paritysets` and its paragraph (agreement with Kokoro's front end is not a quality measure),
      "Context: other Yomites we tried" (LLM pitch values and Yomi-0), the text-layer and cost subsection (its numbers
      go into the Discussion's cost paragraph), the Delivery paragraph.
    - Related work: one paragraph each for front ends, LLM front ends, SSML and browser TTS, keeping the three
      differences (who reads, what is handed over, what the TTS keeps).
