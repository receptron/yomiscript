#!/usr/bin/env node
// yomiscript-mcp: the MCP server on stdio. Settings come from the environment (see README.md):
//   YOMISCRIPT_KATARITE (kokoro), YOMISCRIPT_MODEL (fp32 | w16), YOMISCRIPT_MODELS (dir with models/ and voices/), YOMISCRIPT_VOICE,
//   YOMISCRIPT_PLAY (1; 0 = do not play here), YOMISCRIPT_RETURN_AUDIO (0; 1 = also return the WAV to the client)
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { openKatarite, playWav, toWav, writeWav, type ModelPrecision } from "yomiscript";
import fs from "node:fs/promises";
import { createServer } from "./tool.ts";

const env = process.env;
const on = (v: string | undefined, dflt: boolean): boolean => (v === undefined ? dflt : !/^(0|false|no|off)$/i.test(v));
const model: ModelPrecision = env.YOMISCRIPT_MODEL === "w16" ? "w16" : "fp32";

const server = createServer({
  katarite: () => openKatarite(env.YOMISCRIPT_KATARITE ?? "kokoro", { model, models: env.YOMISCRIPT_MODELS, voice: env.YOMISCRIPT_VOICE }),
  play: on(env.YOMISCRIPT_PLAY, true)
    ? async (s) => {
        const file = await writeWav(s);
        try {
          return await playWav(file);
        } finally {
          await fs.rm(file, { force: true });
        }
      }
    : undefined,
  wav: toWav,
  returnAudio: on(env.YOMISCRIPT_RETURN_AUDIO, false),
});
await server.connect(new StdioServerTransport());
