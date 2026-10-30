#!/usr/bin/env node
// mulmovoice-mcp: the MCP server on stdio. Settings come from the environment (see README.md):
//   MULMOVOICE_KATARITE (kokoro), MULMOVOICE_MODEL (fp32 | w16), MULMOVOICE_MODELS (dir with models/ and voices/), MULMOVOICE_VOICE,
//   MULMOVOICE_PLAY (1; 0 = do not play here), MULMOVOICE_RETURN_AUDIO (0; 1 = also return the WAV to the client)
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { openKatarite, playWav, toWav, writeWav, type ModelPrecision } from "@mulmovoice/cli";
import fs from "node:fs/promises";
import { createServer } from "./tool.ts";

const env = process.env;
const on = (v: string | undefined, dflt: boolean): boolean => (v === undefined ? dflt : !/^(0|false|no|off)$/i.test(v));
const model: ModelPrecision = env.MULMOVOICE_MODEL === "w16" ? "w16" : "fp32";

const server = createServer({
  katarite: () => openKatarite(env.MULMOVOICE_KATARITE ?? "kokoro", { model, models: env.MULMOVOICE_MODELS, voice: env.MULMOVOICE_VOICE }),
  play: on(env.MULMOVOICE_PLAY, true)
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
  returnAudio: on(env.MULMOVOICE_RETURN_AUDIO, false),
});
await server.connect(new StdioServerTransport());
