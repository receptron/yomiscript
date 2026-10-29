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

Input: ja /aꜛtaɾaɕiꜜi | {en-US ˈsmɑɹt.foʊn}o | kaꜛimaꜜɕita ↘/
Output: ja /a<f0:-2>ꜛta<f0:2.5>ɾa<f0:2.05>ɕi<f0:1.6>ꜜi<f0:-3.4> | {en-US ˈsmɑɹt<f0:3,1>.foʊn<f0:-1.5,-5>}o<f0:2.5> | ka<f0:-2>ꜛi<f0:2.5>ma<f0:2.05>ꜜɕi̥ta<f0:-3.1> ↘/

Input: en-US /wi ˈhæd ˈɹɑ.mən fəɹ ˈlʌnʧ ‖ ɪn {ja oꜛːsaka} ↘/
Output: en-US /wi<f0:-1.5> ˈhæd<f0:3,1> ˈɹɑ<f0:3,1>.mən<f0:-1.5> fəɹ<f0:-1.5> ˈlʌnʧ<f0:3,1,2.5> ‖ ɪn<f0:-1.5,-5> {ja o<f0:-2>ꜛː<f0:2.5>sa<f0:2.05>ka<f0:1.6>} ↘/

## Task

For each item you are given YomiScript with accent marks but no pitch values. Add `<f0:…>` values for every mora or syllable. Keep the IPA, the marks, the boundaries and the language tags exactly as given; you may only add `<f0:…>` values and `◌̥` for devoiced vowels.

Return **only** a JSON object mapping each item name to its YomiScript string, with no other text:
`{"<name>": "<YomiScript>", …}`

## Items

- tokyo_n1: ja /kʲoꜜːwa | aꜜmeɡa | ɸɯꜛɾisoꜜːnanode ‖ kaꜜsao | moꜜtte | deꜛkakemaꜜsɯ ↘/
- osaka_n1 (Japanese accent: Osaka / Keihan-type dialect): ja /kʲoꜜːwa | aꜛmeꜜɡa | ɸɯɾiꜛsoꜜːnanode ‖ kaꜛsaꜜo | motꜛte | dekakeꜛmaꜜsɯ ↘/
- ja_1: ja /aꜛidʑoːnotameꜜɲi ‖ kaꜜnodʑono | keꜛtteꜜŋɡa | miꜛeꜜnakatta ↘/
- mix_12: ja /keꜛsawa | kɯꜛɾowaꜜssaɴo | taꜛbemaꜜɕita ↘/
- mix_1: ja /kʲoꜜːwa | {en-US mə.ˈʃiːn ˈlɝːn.ɪŋ}no | beꜛŋkʲoːo | ɕiꜛmaꜜsɯ ↘/
- en-US_1: en-US /wi ˈnid tə ˈbaɪ ˈmɪlk ‖ ˈɛɡz ‖ ənd ˈbɹɛd ↘/
- mix_4: en-US /ˈaɪ ˈɹi.sənt.li ˈvɪz.ɪ.tɪd {ja kʲoꜜːto} ənd ˈeɪt {ja sɯꜜɕi} ˈðɛɹ ↘/
