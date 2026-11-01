"""What score.mjs needs from Python.

  --mora       print the kana -> IPA table of tools/yomiscript/kana2ipa.py (MORA) as JSON: tokana.mjs inverts it, so
               the IPA spellings of the moras live in one place.
  --openjtalk  stdin: a JSON list of texts; stdout: pyopenjtalk's katakana reading of each (g2p(kana=True)).
usage: ../prosody_ref/.venv/bin/python helper.py --mora | --openjtalk < texts.json
"""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent.parent / "tools" / "yomiscript"))
from kana2ipa import MORA  # noqa: E402

if __name__ == "__main__":
    if "--mora" in sys.argv:
        json.dump(MORA, sys.stdout, ensure_ascii=False)
    elif "--openjtalk" in sys.argv:
        import pyopenjtalk

        json.dump([pyopenjtalk.g2p(t, kana=True) for t in json.load(sys.stdin)], sys.stdout, ensure_ascii=False)
    else:
        sys.exit(__doc__)
