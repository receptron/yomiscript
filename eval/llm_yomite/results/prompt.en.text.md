You are acting as a **Yomite**: you write YomiScript, a language-neutral pronunciation notation that a speech synthesizer (the Katarite) reads. Do not use any tools; answer directly.

## YomiScript

- One utterance per item: `<lang> /… ↘/` for a statement, `<lang> /… ↗/` for a question. `<lang>` is a BCP 47 language tag (`ja`, `en-US`, …).
- The pronunciation is IPA.
  - Japanese: phonemic IPA, mora by mora. し `ɕi`, ち `tɕi`, つ `tsɯ`, ふ `ɸɯ`, ら `ɾa`, う `ɯ`, じ `dʑi`, ず `dzɯ`, を `o`, きゃ `kʲa`. Long vowel `ː`. Moraic nasal by context: `m` before p b m, `n` before t d n ɾ dz, `ɲ` before tɕ dʑ ɲ, `ŋ` before k ɡ, `ɴ` elsewhere. Geminate = doubled consonant (`kitte`, `mattɕi`). A devoiced vowel takes `◌̥` (`sɯ̥`). No spaces needed.
  - English, French: IPA with `ˈ` / `ˌ` stress at the start of the syllable, `.` between syllables, spaces between words.
- Japanese pitch accent: `ꜛ` right after the mora where the pitch rises, `ꜜ` right after the accent-nucleus mora (the pitch falls after it). A flat word has no `ꜜ`.
- ` | ` accent-phrase boundary, ` ‖ ` breath group / pause.
- A span in another language goes in braces with its language tag: `{en-US ˈmi.tɪŋ}`.
- **Pitch values.** Right after each mora (Japanese) or syllable (other languages), write `<f0:v>` or a contour `<f0:v1,v2,v3>`: the target pitch in semitones relative to the speaker's normal level (0 = normal, positive = higher, negative = lower; typically between −6 and +6). A devoiced mora gets no value. **The synthesizer follows only these values**; it ignores `ꜛ` `ꜜ` `ˈ` for pitch. So the values must carry the accent, the intonation (gradual fall over a phrase, phrase-final rises, the final fall or question rise) and any emphasis you want.

## Examples

Input (en-US): The quick brown fox jumps over the lazy dog.
Output: en-US /ðə<f0:1.5,-0.06,0.65> ˈkwɪk<f0:0.73,7.16,-0.7> ˈbɹaʊn<f0:2.11,1.22,0.64> ˈfɑks<f0:-0.4,-3.9,-3.6> ˈdʒʌmps<f0:2.08,2.37,3.92> ˈoʊ<f0:1.33,-1.16,0.02>.vəɹ<f0:0.28,-1.77,-1.67> ðə<f0:-1.89,-2.4,-2.5> ˈleɪ<f0:-2.79,0.75,-0.97>.zi<f0:-0.26,-1.01,-2.91> ˈdɔɡ<f0:0.4,-5.13,-17.13> ↘/

Input (en-US): Our new computer is surprisingly powerful.
Output: en-US /ˌaʊ<f0:2.07,2.82,2.89>.əɹ<f0:2.88,2.6,2.43> ˈnu<f0:4.13,8.18,7.48> kəm<f0:4.84,-0.47,-3.9>.ˈpju<f0:-2.33,0.48,-2.5>.ɾəɹ<f0:-3.23,-2.27,-7.55> ɪz<f0:-1.11,-1.03,-0.89> səɹ<f0:0.21,-1.09,-3.19>.ˈpɹaɪ<f0:-2.08,0.47,1.73>.zɪŋ<f0:2.62,0.18,-1.34>.li<f0:-1.6,-2.74,-2.58> ˈpaʊ<f0:-3.2,3.38,-2.84>.əɹ<f0:-3.51,-5.12,-13.22>.fᵊl ↘/

## Task

For each item, write the YomiScript for the given text in the given language, with pitch values for every mora or syllable.

Return **only** a JSON object mapping each item name to its YomiScript string, with no other text:
`{"<name>": "<YomiScript>", …}`

## Items

- door (en-US): Did you remember to lock the front door?
- shopping (en-US): We need to buy milk, eggs, and bread.
- idea (en-US): Honestly, I think that's the best idea anyone has had all week.
- rain (en-US): If it rains tomorrow, we'll stay home and watch a movie.
- meeting (en-US): The meeting starts at nine thirty, so please don't be late.
- tokyo (en-US): Wait, you're moving to Tokyo next month?
- kyoto (en-US): I recently visited Kyoto and ate sushi there.
- museum (en-US): She asked whether the museum was open on Mondays.
