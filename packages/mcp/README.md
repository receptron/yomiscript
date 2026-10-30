# @yomiscript/mcp

`yomiscript-mcp` is an MCP server (stdio) with one tool, `speak`. The calling LLM writes what it wants to say as
YomiScript, so it decides how every word is read from the context it wrote it in: homographs, names, numbers and
abbreviations. A Katarite speaks it on this machine (Kokoro-82M, fp32). The server has no LLM and no text front end
of its own (D24).

- The tool's description is `YOMISCRIPT_INSTRUCTIONS` from `@yomiscript/core`: the notation, the Japanese mora
  table, the original-text annotation `<t:…>` (D23) and examples. Input: `{ "yomiscript": string }`.
- It returns the original text (the `<t:…>` values joined) and the duration: `Spoke "一日から三日まで休みです。" (2.90 s).`
- A YomiScript error returns `isError` with the parser's message, so the LLM can fix what it wrote and call again.
  Nothing is spoken in that case.
- Calls are spoken one at a time.
- The Katarite is loaded on the first call. On a Mac, the first Japanese sentence took 1.1 s, a second one 0.3 s.

## Settings (environment)

| variable | default | |
|---|---|---|
| `YOMISCRIPT_MODELS` | `~/.cache/yomiscript/kokoro` | directory with `models/` and `voices/` |
| `YOMISCRIPT_MODEL` | `fp32` | `fp32` or `w16` |
| `YOMISCRIPT_KATARITE` | `kokoro` | which Katarite: `kokoro` or `supertonic` (models from `$YOMISCRIPT_SUPERTONIC`, default `~/.cache/supertonic3`) |
| `YOMISCRIPT_PLAY` | `1` | `0`: do not play on this machine |
| `YOMISCRIPT_RETURN_AUDIO` | `0` | `1`: also return the audio to the client as MCP audio content (base64 WAV) |

## Register it

Claude Code:

```bash
claude mcp add yomiscript -e YOMISCRIPT_MODELS=/path/to/models -- npx -y @yomiscript/mcp
# from this repository, before it is published:
claude mcp add yomiscript -e YOMISCRIPT_MODELS=$PWD/demo/ys_web -- node $PWD/packages/mcp/dist/server.js
```

Claude Desktop (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "yomiscript": {
      "command": "npx",
      "args": ["-y", "@yomiscript/mcp"],
      "env": { "YOMISCRIPT_MODELS": "/path/to/models" }
    }
  }
}
```

TODO: download the models from Hugging Face on first use, so that `YOMISCRIPT_MODELS` is optional.
