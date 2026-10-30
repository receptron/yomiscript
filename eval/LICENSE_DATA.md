# Evaluation data licenses

## data/jsut_basic5000_subset.jsonl
- Source: `text_kana/basic5000.yaml` and `e2e_symbol/{katakana,phoneme}.yaml` from [sarulab-speech/jsut-label](https://github.com/sarulab-speech/jsut-label) (JSUT BASIC5000; 280 sentences sampled at even intervals).
- According to jsut-label's LICENCE.txt, the text has been modified and pronunciation information added. The sources and licenses of the text are:
  - Wikipedia: CC-BY-SA 3.0
  - Tanaka Corpus: CC-BY 2.0
  - JSUT: CC-BY-SA 4.0
- Because of the share-alike (SA) clause, this file is also redistributed under **CC-BY-SA 4.0** (credit: Saruwatari Lab, The University of Tokyo, JSUT / jsut-label; Wikipedia contributors; Tanaka Corpus). The repository's Apache-2.0 license does not apply.
- Regenerate: `python eval/scripts/prepare_jsut.py <clone of jsut-label>`
- Audio (wav) is not included.

## data/hard_set.tsv
- Created by the yomiscript project. CC BY 4.0.
- **The reference readings are provisional and need human review.**

## data/general_heldout.jsonl
- 3,000 sentences from Japanese Wikipedia (HF `wikimedia/wikipedia`, 20231101.ja, shard 14) that are not used in
  Yomi-0's training, with readings and prosody from pyopenjtalk (`models/yomi/mlx/tools/build_general_eval.py`).
- The text is from Wikipedia: **CC BY-SA 4.0** (and GFDL). Attribution: the authors of each Japanese Wikipedia
  article. The repository's Apache-2.0 license does not apply.
