# @mulmovoice/core

YomiScript: the notation in which an LLM (or any Yomite) writes how a text is read, and a Katarite turns it into
sound. Specification: `spec/yomiscript/README.md` in the repository.

- `parse(ys)`: an utterance -> language sections -> tokens (morae / syllables, boundaries, pauses), with `<f0:…>`
  pitch values and the original text of each span (`<t:…>`, D23). Errors explain what to write instead.
- `realize(ys, { dialect })`: the reference rule-based prosody (accent / stress / tone marks -> `<f0:…>` values).
- `Katarite`, `Speech`, `SpanTime`: the interface every Katarite offers (YomiScript in; audio and when each span is
  spoken out).
- `YOMISCRIPT_INSTRUCTIONS`: what an LLM needs to write YomiScript; the description of the `speak` tool in the MCP
  server and the gui-chat-protocol plugin.
