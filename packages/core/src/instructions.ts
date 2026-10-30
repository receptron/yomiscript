// The instructions an LLM needs to write YomiScript for a Katarite: the text of a tool description (MCP, gui-chat-protocol)
// or a system prompt. The same subset was measured in eval/browser_tts (prompt.md there is the experiment's frozen copy).

export const YOMISCRIPT_INSTRUCTIONS = `Write what you want to say as YomiScript, a pronunciation notation: you decide how every word is read, from its context.

- One utterance: \`<lang> /… ↘/\` for a statement, \`<lang> /… ↗/\` for a question. \`<lang>\` is a BCP 47 tag (\`ja\`, \`en-US\`).
- The pronunciation is IPA, as the words are actually spoken: numbers, dates, symbols and abbreviations spelled out, and each word read the way it is meant here.
  - Japanese: phonemic IPA, mora by mora. Rows: a i ɯ e o; ka ki kɯ ke ko (kʲa kʲɯ kʲo); sa ɕi sɯ se so (ɕa ɕɯ ɕo); dza dʑi dzɯ dze dzo; ta tɕi tsɯ te to (tɕa tɕɯ tɕo); da de do; na ɲi nɯ ne no (ɲa ɲɯ ɲo); ha çi ɸɯ he ho (ça çɯ ço); ba bi bɯ be bo; pa pi pɯ pe po; ma mi mɯ me mo (mʲa…); ja jɯ jo; wa; ɾa ɾi ɾɯ ɾe ɾo (ɾʲa…). Loanword sounds: ti di tɯ ɸa ɸi ɸe ɸo wi we wo tsa va. Particles: は \`wa\`, へ \`e\`, を \`o\`. Long vowel \`ː\` as pronounced (先生 \`seːseː\`). Geminate: double the next consonant (\`kitte\`; before tɕ / ts write \`t\`: \`mattɕi\`), \`ʔ\` before a vowel or at the end. ン: \`m\` before p b m, \`n\` before t d n ɾ dz, \`ɲ\` before tɕ dʑ ɲ, \`ŋ\` before k ɡ, \`ɴ\` otherwise. Latin letters and symbols as a Japanese speaker says them (iPhone \`aiɸoɴ\`). Separate words with spaces.
  - English: IPA with \`ˈ\` / \`ˌ\` stress at the start of the syllable, \`.\` between syllables, spaces between words.
- \` ‖ \` marks a pause (a comma). Several sentences stay one utterance: end each inner sentence with \` ↘ \` or \` ↗ \`.
- After each word, write the text it reads in \`<t:…>\`, so that joining them gives back your text exactly: punctuation goes with the word before it (\`desɯ<t:です。>\`) or in its own \`<t:…>\` where nothing is spoken (\`‖<t:、>\`); in English write the spaces too (\`ˈwɝld<t: world.>\`).
- No pitch values and no accent marks: the synthesizer makes the prosody.

Examples:
ja /ɕɯːmatsɯ<t:週末> wa<t:は> ‖<t:、> tomodatɕi<t:友達> to<t:と> kʲoːto<t:京都> e<t:へ> ikɯ<t:行く> joteː<t:予定> desɯ<t:です。> ↘/
ja /tsɯitatɕi<t:一日> kaɾa<t:から> mikka<t:三日> made<t:まで> jasɯmi<t:休み> desɯ<t:です。> ↘/
en-US /ˌaɪ<t:I> ˈɹɛd<t: read> ðə<t: the> ˈlɛ.ɾəɹ<t: letter> ˈtwaɪs<t: twice,> ‖ ˌbʌt<t: but> ɪt<t: it> ˈstɪl<t: still> ˌmeɪd<t: made> ˈnoʊ<t: no> ˈsɛns<t: sense.> ↘/`;
