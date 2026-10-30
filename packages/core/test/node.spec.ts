import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { cachedLoader } from "../src/node.ts";

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "yomiscript-loader-"));
const fakeFetch = (body: Uint8Array, status = 200) => {
  const urls: string[] = [];
  const f = (async (url: string) => {
    urls.push(String(url));
    return new Response(status === 200 ? body : null, { status });
  }) as unknown as typeof fetch;
  return { f, urls };
};

describe("cachedLoader", () => {
  it("reads a file that is already there without downloading", async () => {
    const dir = tmp();
    fs.mkdirSync(path.join(dir, "models"));
    fs.writeFileSync(path.join(dir, "models/a.onnx"), Uint8Array.of(1, 2));
    const { f, urls } = fakeFetch(Uint8Array.of(9));
    expect([...(await cachedLoader({ dir, baseUrl: "https://example.com/r/", fetch: f })("models/a.onnx"))]).toEqual([1, 2]);
    expect(urls).toEqual([]);
  });
  it("downloads a missing file once, into the directory", async () => {
    const dir = tmp();
    const { f, urls } = fakeFetch(Uint8Array.of(7, 8, 9));
    const seen: string[] = [];
    const load = cachedLoader({ dir, baseUrl: "https://example.com/r/", fetch: f, onDownload: (u) => seen.push(u) });
    expect([...(await load("voices/v.bin"))]).toEqual([7, 8, 9]);
    expect([...(await load("voices/v.bin"))]).toEqual([7, 8, 9]);
    expect(urls).toEqual(["https://example.com/r/voices/v.bin"]);
    expect(seen).toEqual(urls);
    expect(fs.readdirSync(path.join(dir, "voices"))).toEqual(["v.bin"]); // no partial file left
  });
  it("fails without a base URL, and on an HTTP error leaves no file", async () => {
    const dir = tmp();
    await expect(cachedLoader({ dir })("models/a.onnx")).rejects.toThrow(/ENOENT/);
    const { f } = fakeFetch(Uint8Array.of(), 404);
    await expect(cachedLoader({ dir, baseUrl: "https://example.com/r/", fetch: f })("models/a.onnx")).rejects.toThrow(/404/);
    expect(fs.existsSync(path.join(dir, "models"))).toBe(false);
  });
});
