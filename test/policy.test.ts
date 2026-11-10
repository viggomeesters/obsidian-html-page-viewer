import assert from "node:assert/strict";
import fs from "node:fs";
import { describe, it } from "node:test";
import esbuild from "esbuild";

// The security model promises that the plugin's own code makes no network
// requests and does not touch the clipboard. These smoke checks look for
// recognizable API use in the bundled plugin code.
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

  it("has no direct calls to vault file mutation APIs", () => {
    assert.doesNotMatch(bundle, /\bvault\.(?:adapter\.)?(?:modify|process|create|createBinary|delete|trash|rename|append|write|writeBinary|remove)\s*\(/);
  });
});

describe("styles", () => {
  it("use no !important overrides", () => {
    assert.doesNotMatch(fs.readFileSync("styles.css", "utf8"), /!important/);
  });
});
