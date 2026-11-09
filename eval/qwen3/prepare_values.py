"""Write local dictionary sources for rows_values.mjs; never modify external datasets."""

import json

from memory import HERE
from rows import KANA_IPA
from values_data import dictionary_entries


def main():
    (HERE / "work/kana_ipa.json").write_text(json.dumps(KANA_IPA, ensure_ascii=False))
    rows = [[r["surface"], r["pron"], r["fall"]] for r in dictionary_entries()]
    (HERE / "work/word_falls.json").write_text(json.dumps(rows, ensure_ascii=False))
    print(len(rows), "spoken dictionary keys")


if __name__ == "__main__":
    main()
