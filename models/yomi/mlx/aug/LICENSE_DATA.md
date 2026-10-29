# Augmentation data sources and licenses (Yomi-0 aug v1)

The data itself is not included in the repository (regenerate with `aug/build_text.py`, `aug/aozora.py` and `prepare_data.py --aug`, or use the release tarball).

| Source | Obtained from | License | Use |
|---|---|---|---|
| Japanese Wikipedia (2023-11-01) | HF `wikimedia/wikipedia` 20231101.ja shards 14/15 | CC BY-SA 4.0 (and GFDL) | Sentences from body paragraphs, distilled with pyopenjtalk |
| Tatoeba Japanese sentences | downloads.tatoeba.org per_language/jpn | CC BY 2.0 FR (some CC0) | Sentences distilled with pyopenjtalk |
| Aozora Bunko (400 works, out of copyright, modern kanji and kana) | aozora.gr.jp work texts (zip with ruby) | Public domain (following Aozora Bunko's handling guidelines) | Distilled using ruby as a constraint on the correct reading |
| Rule set (`aug/rules.py`) | Created by mulmovoice | CC BY 4.0 | Examples of numbers, dates, times, counters and abbreviations |
| Labeling | pyopenjtalk / OpenJTalk (Modified BSD), NAIST-JDIC-based dictionary (BSD) | — | Assigning readings, accents and phrase boundaries |

Notes:
- Because it includes sentences from Wikipedia, redistributing the dataset (tarball) is subject to the **CC BY-SA 4.0 share-alike terms**. Attribution: the authors of each Japanese Wikipedia article.
- Tatoeba sentences are CC BY 2.0 FR. Attribution: contributors to Tatoeba (https://tatoeba.org).
- Which license terms extend to the trained model weights is legally unsettled. Confirm before publishing.
- Sentences that match or contain sentences from the evaluation sets (`eval/data/`: the 280 JSUT sentences and the 70-sentence hard set) have been excluded. Abbreviations that appear in the hard set are not used in the rule set.
