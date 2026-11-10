import assert from "node:assert/strict";
import fs from "node:fs";
import { describe, it } from "node:test";
import { TFile } from "./support/obsidian";
import { Harness, VIEW_TYPE } from "./support/harness";

function readJson(path: string): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(path, "utf8")) as Record<string, unknown>;
}

describe("plugin", () => {
  it("opens .html and .htm files in its view", async () => {
    const harness = await Harness.load();
    assert.deepEqual(
      [...harness.plugin.extensions],
      [
        ["html", VIEW_TYPE],
        ["htm", VIEW_TYPE],
      ],
    );
  });

  it("offers its command only while an HTML file is active", async () => {
    const harness = await Harness.load();
    const command = harness.plugin.commands.find(({ id }) => id === "open-current-html-in-viewer");
    assert.ok(command?.checkCallback);

    const cases: [string | null, boolean][] = [
      ["page.html", true],
      ["Archive/PAGE.HTM", true],
      ["notes.md", false],
      [null, false],
    ];
    for (const [path, offered] of cases) {
      harness.app.activeFile = path === null ? null : new TFile(path);
      assert.equal(command.checkCallback(true), offered, String(path));
    }
  });

  it("opens the active file in the viewer when the command runs", async () => {
    const harness = await Harness.load();
    const command = harness.plugin.commands.find(({ id }) => id === "open-current-html-in-viewer");
    harness.app.activeFile = new TFile("Archive/page.html");

    assert.equal(command?.checkCallback?.(false), true);
    await new Promise((resolve) => setTimeout(resolve, 0));

    assert.deepEqual(harness.app.leaves.at(-1)?.viewStates, [
      { type: VIEW_TYPE, state: { file: "Archive/page.html" }, active: true },
    ]);
  });
});

describe("manifest", () => {
  const manifest = readJson("manifest.json");
  const pkg = readJson("package.json");
  const versions = readJson("versions.json");

  it("has the same version as package.json", () => {
    assert.equal(manifest.version, pkg.version);
  });

  it("has a version in x.y.z form, as Obsidian's releases require", () => {
    assert.match(String(manifest.version), /^\d+\.\d+\.\d+$/);
  });

  it("lists its version in versions.json with its minimum Obsidian version", () => {
    assert.equal(versions[String(manifest.version)], manifest.minAppVersion);
  });

  it("has an id that Obsidian accepts", () => {
    assert.match(String(manifest.id), /^[a-z0-9]+(-[a-z0-9]+)*$/);
    assert.doesNotMatch(String(manifest.id), /obsidian/);
  });
});
