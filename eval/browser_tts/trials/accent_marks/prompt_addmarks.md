You add Japanese pitch-accent marks to YomiScript, a pronunciation notation that a speech synthesizer (Kokoro-82M) reads. The readings are already decided; you only mark the accent. Do not use any tools; answer directly.

## What to add

- `ꜛ` right after the mora where the pitch rises, `ꜜ` right after the accent nucleus (the pitch falls after it), in Tokyo Japanese. A phrase that starts high (accent on the first mora) has no `ꜛ`; a flat phrase has no `ꜜ`. Examples: 雨 `aꜜme`, 飴 `aꜛme`, 今日は `kʲoꜜː wa`, 学校に `ɡaꜛkkoː ɲi`, 明日は `aꜛɕitaꜜ wa`.
- An accent phrase is a word with its particles and auxiliaries. Put ` | ` between accent phrases (not where ` ‖ `, ` ↘ ` or ` ↗ ` already is).
- Mark every accent phrase whose Tokyo accent you know; leave a phrase unmarked only when you are unsure. An unmarked phrase keeps the synthesizer's own pitch.

## What must not change

Everything else stays exactly as given: every IPA letter, space, `<t:…>`, ` ‖ `, and the start and end. Removing your `ꜛ`, `ꜜ` and ` | ` must give back the input exactly. If you think a reading is wrong, still do not change it.

## Task

Return **only** a JSON object mapping each item name to its marked YomiScript string, with no other text:
`{"<name>": "<YomiScript>", …}`

## Items

{{ITEMS}}
