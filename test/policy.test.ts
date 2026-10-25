import assert from "node:assert/strict";
import fs from "node:fs";
import { describe, it } from "node:test";
import esbuild from "esbuild";

// The security model promises that the plugin's own code makes no network
// requests and does not touch the clipboard. These checks read the bundle the
// build would produce, so they cover every source file and nothing else.
const bundle = (
  await esbuild.build({
    bundle: true,
    entryPoints: ["src/main.ts"],
    external: ["obsidian"],
    format: "cjs",
    platform: "browser",
    target: "es2022",
    write: false,
  })
).outputFiles[0].text;

describe("plugin code", () => {
  const forbidden: [string, RegExp][] = [
    ["the clipboard", /\bclipboard\b/],
    ["fetch", /\bfetch\s*\(/],
    ["XMLHttpRequest", /\bXMLHttpRequest\b/],
    ["WebSocket", /\bWebSocket\b/],
    ["EventSource", /\bEventSource\b/],
    ["sendBeacon", /\bsendBeacon\b/],
    ["Obsidian's request functions", /\brequest(Url)?\b/],
  ];
  for (const [name, pattern] of forbidden) {
    it(`does not use ${name}`, () => {
      assert.doesNotMatch(bundle, pattern);
    });
  }

  it("does not write to vault files", () => {
    assert.doesNotMatch(bundle, /\.(modify|process|create|delete|trash|rename|append)\s*\(/);
  });
});

describe("styles", () => {
  it("use no !important overrides", () => {
    assert.doesNotMatch(fs.readFileSync("styles.css", "utf8"), /!important/);
  });
});
