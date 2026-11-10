import fs from "node:fs";
import assert from "node:assert/strict";
import vm from "node:vm";
import { transformSync } from "esbuild";

const manifest = JSON.parse(fs.readFileSync("manifest.json", "utf8"));
const releasePackage = JSON.parse(fs.readFileSync("package.json", "utf8"));
const releaseVersions = JSON.parse(fs.readFileSync("versions.json", "utf8"));
const main = fs.readFileSync("src/main.ts", "utf8");
const styles = fs.readFileSync("styles.css", "utf8");
const staticFixture = fs.readFileSync("test-fixtures/static.html", "utf8");
const interactiveFixture = fs.readFileSync("test-fixtures/interactive.html", "utf8");

const assertions = [
  [manifest.id === "html-page-viewer", "manifest id is html-page-viewer"],
  [manifest.version === releasePackage.version && /^\d+\.\d+\.\d+$/.test(manifest.version) && releaseVersions[manifest.version] === manifest.minAppVersion, "release version matches package and supported app version"],
  [main.includes("sandboxValue(this.scriptsEnabled)"), "iframe sandbox is derived from script toggle"],
  [main.includes("allow-scripts"), "script toggle grants only allow-scripts"],
  [main.includes("renderSource(container, this.data)"), "source view code path exists"],
  [main.includes("this.app.vault.getResourcePath(file)"), "rendered view uses vault resource path"],
  [!main.includes("navigator.clipboard"), "plugin code has no clipboard access"],
  [!styles.includes("!important"), "styles do not use important overrides"],
  [staticFixture.includes("<!-- Static fixture"), "static fixture contains an HTML comment for source highlighting"],
  [interactiveFixture.includes("<script>"), "interactive fixture contains script for toggle testing"],
];

const failures = assertions.filter(([passes]) => !passes).map(([, label]) => label);

if (failures.length > 0) {
  for (const failure of failures) {
    console.error(`FAIL: ${failure}`);
  }
  process.exit(1);
}

console.log("HTML Page Viewer smoke checks passed.");

// Exercise the registered view and toolbar with the small part of the host API they use.
class Element {
  children = [];
  attributes = {};
  addClass() {}
  toggleClass() {}
  empty() { this.children = []; }
  setAttribute(name, value) { this.attributes[name] = value; }
  addEventListener(_event, handler) { this.click = handler; }
  createEl(tag, options = {}) {
    const child = Object.assign(new Element(), { tag, ...options });
    this.children.push(child);
    return child;
  }
  createDiv(options) { return this.createEl("div", options); }
  createSpan(options) { return this.createEl("span", options); }
  find(predicate) {
    if (predicate(this)) return this;
    return this.children.map((child) => child.find(predicate)).find(Boolean);
  }
}

let saved;
let writes = 0;
const leaves = [];
const vaultEvents = new Map();
const app = {
  vault: {
    on: (name, callback) => vaultEvents.set(name, callback),
    getResourcePath: (file) => file.path,
  },
  workspace: { getLeavesOfType: () => leaves },
};
const module = { exports: {} };
const obsidian = {
  Plugin: class {
    app = app;
    loadData() { return saved; }
    async saveData(data) {
      await new Promise((resolve) => setImmediate(resolve));
      saved = JSON.parse(JSON.stringify(data));
      writes++;
    }
    registerView(_type, createView) { this.createView = createView; }
    registerExtensions() {}
    registerEvent() {}
    addCommand() {}
  },
  TextFileView: class {
    app = app;
    contentEl = new Element();
  },
  setIcon() {},
};
vm.runInNewContext(transformSync(main, { loader: "ts", format: "cjs" }).code, {
  module,
  require: () => obsidian,
});

async function openViewer() {
  const plugin = new module.exports.default();
  await plugin.onload();
  return plugin;
}

function addView(plugin) {
  const leaf = {};
  leaf.view = plugin.createView(leaf);
  leaves.push(leaf);
  return leaf.view;
}

function show(view, path) {
  view.file = { path, name: path, extension: "html" };
  view.setViewData(interactiveFixture);
}

function iframe(view) {
  return view.contentEl.find((node) => node.tag === "iframe");
}

function scripts(view) {
  return iframe(view).attributes.sandbox;
}

function toggleButton(view) {
  return view.contentEl.find((node) => node.attributes["aria-pressed"] !== undefined);
}

function toggle(view) {
  toggleButton(view).click();
}

const view = addView(await openViewer());
show(view, "reports/a.html");
assert.equal(scripts(view), "");
assert.equal(toggleButton(view).text, "Scripts OFF");
assert.equal(toggleButton(view).attributes.title, "Allow JavaScript on every open, including after file edits");
toggle(view);
assert.equal(scripts(view), "allow-scripts");
assert.equal(toggleButton(view).text, "Scripts ON");
assert.equal(toggleButton(view).attributes.title, "Disable JavaScript for this file");
show(view, "reports/b.html");
assert.equal(scripts(view), "");
show(view, "reports/a.html");
assert.equal(scripts(view), "allow-scripts");
await new Promise((resolve) => setImmediate(() => setImmediate(resolve)));
assert.equal(writes, 1);

leaves.length = 0;
const plugin = await openViewer();
const reopened = addView(plugin);
const otherTab = addView(plugin);
show(reopened, "reports/a.html");
show(otherTab, "reports/a.html");
assert.equal(scripts(reopened), "allow-scripts");
toggle(reopened);
assert.equal(scripts(otherTab), "");
toggle(reopened);
toggle(reopened);
assert.equal(scripts(reopened), "");
for (let i = 0; i < 4; i++) await new Promise((resolve) => setImmediate(resolve));
assert.equal(writes, 4);
assert.deepEqual(saved.scriptPaths, []);

show(otherTab, "unrelated.html");
toggle(otherTab);
const otherFrame = iframe(otherTab);
toggle(reopened);
vaultEvents.get("rename")({ path: "renamed" }, "reports");
assert.equal(scripts(reopened), "");
assert.equal(iframe(otherTab), otherFrame);
show(reopened, "reports/a.html");
assert.equal(scripts(reopened), "");
toggle(reopened);
vaultEvents.get("delete")({ path: "reports/a.html" });
assert.equal(scripts(reopened), "");
console.log("Per-file script permission checks passed.");
