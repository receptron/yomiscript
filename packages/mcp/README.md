# @mulmovoice/mcp

`mulmovoice-mcp` is an MCP server (stdio) with one tool, `speak`. The calling LLM writes what it wants to say as
YomiScript, so it decides how every word is read from the context it wrote it in: homographs, names, numbers and
abbreviations. A Katarite speaks it on this machine (Kokoro-82M, fp32). The server has no LLM and no text front end
of its own (D24).

- The tool's description is `YOMISCRIPT_INSTRUCTIONS` from `@mulmovoice/core`: the notation, the Japanese mora
  table, the original-text annotation `<t:…>` (D23) and examples. Input: `{ "yomiscript": string }`.
- It returns the original text (the `<t:…>` values joined) and the duration: `Spoke "一日から三日まで休みです。" (2.90 s).`
- A YomiScript error returns `isError` with the parser's message, so the LLM can fix what it wrote and call again.
  Nothing is spoken in that case.
- Calls are spoken one at a time.
- The Katarite is loaded on the first call. On a Mac, the first Japanese sentence took 1.1 s, a second one 0.3 s.

## Settings (environment)

| variable | default | |
|---|---|---|
| `MULMOVOICE_MODELS` | `~/.cache/mulmovoice/kokoro` | directory with `models/` and `voices/` |
| `MULMOVOICE_MODEL` | `fp32` | `fp32` or `w16` |
| `MULMOVOICE_KATARITE` | `kokoro` | which Katarite: `kokoro` or `supertonic` (models from `$MULMOVOICE_SUPERTONIC`, default `~/.cache/supertonic3`) |
| `MULMOVOICE_PLAY` | `1` | `0`: do not play on this machine |
| `MULMOVOICE_RETURN_AUDIO` | `0` | `1`: also return the audio to the client as MCP audio content (base64 WAV) |

## Register it

Claude Code:

```bash
claude mcp add mulmovoice -e MULMOVOICE_MODELS=/path/to/models -- npx -y @mulmovoice/mcp
# from this repository, before it is published:
claude mcp add mulmovoice -e MULMOVOICE_MODELS=$PWD/demo/ys_web -- node $PWD/packages/mcp/dist/server.js
```

Claude Desktop (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "mulmovoice": {
      "command": "npx",
      "args": ["-y", "@mulmovoice/mcp"],
      "env": { "MULMOVOICE_MODELS": "/path/to/models" }
    }
  }
}
```

TODO: download the models from Hugging Face on first use, so that `MULMOVOICE_MODELS` is optional.
