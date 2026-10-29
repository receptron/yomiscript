import json
import pathlib
import unittest

from kana2ipa import convert

ROOT = pathlib.Path(__file__).resolve().parents[2]


class T(unittest.TestCase):
    def test_basic(self):
        self.assertEqual(convert("^キョ]ーワ#ヨ]イ#テ[ンキデス$"), "/kʲoꜜːwa | joꜜi | teꜛŋkidesɯ ↘/")

    def test_n(self):
        self.assertEqual(convert("サンポ"), "/sampo/")
        self.assertEqual(convert("アンナイ"), "/annai/")
        self.assertEqual(convert("ホンヤ"), "/hoɴja/")
        self.assertEqual(convert("ホン"), "/hoɴ/")

    def test_q(self):
        self.assertEqual(convert("キッテ"), "/kitte/")
        self.assertEqual(convert("マッチ"), "/mattɕi/")
        self.assertEqual(convert("ア]ッ$"), "/aꜜʔ ↘/")

    def test_devoice(self):
        self.assertEqual(convert("デス$", devoice=True), "/desɯ̥ ↘/")
        self.assertEqual(convert("キシャ", devoice=True), "/ki̥ɕa/")

    def test_mora(self):
        self.assertEqual(convert("ト]ーキョー", mora_sep=True), "/toꜜː.kʲoː/")

    def test_eval_all(self):
        p = ROOT / "eval/data/jsut_basic5000_subset.jsonl"
        n = 0
        for line in p.read_text().splitlines():
            convert(json.loads(line)["kana_prosody"])
            n += 1
        self.assertGreater(n, 100)


if __name__ == "__main__":
    unittest.main()
