import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { sandboxValue } from "../src/main";
import { resourcePath } from "./support/obsidian";
import { button, frame, Harness, message, sandboxTokens, securityPill, settle } from "./support/harness";

const PAGE = "<!doctype html><title>Report</title><p>Quarterly figures</p>";

describe("rendered view", () => {
  it("renders the page in a sandboxed frame from its resource URL", async () => {
    const harness = await Harness.load();
    const view = harness.newView();
    const file = harness.open(view, "Reports/q3 report.html", PAGE);

    const iframe = frame(view);
    assert.ok(iframe, "the view shows a frame");
    const src = iframe.getAttribute("src") ?? "";
    assert.ok(src.startsWith(`${resourcePath(file)}&`), `the frame loads the file's resource URL: ${src}`);
    assert.match(src, /[?&]html-page-viewer-refresh=\d+$/, "the URL carries a refresh marker");
    assert.equal(iframe.getAttribute("title"), "q3 report.html");
    assert.equal(iframe.getAttribute("referrerpolicy"), "no-referrer");
    assert.equal(view.getDisplayText(), "q3 report");
  });

  it("starts with scripts off", async () => {
    const harness = await Harness.load();
    const view = harness.newView();
    harness.open(view, "page.html", PAGE);

    const iframe = frame(view);
    assert.ok(iframe);
    assert.deepEqual(sandboxTokens(iframe), []);
    assert.equal(securityPill(view), "Scripts OFF");
    const scripts = button(view, "Scripts OFF");
    assert.equal(scripts.getAttribute("aria-pressed"), "false");
    assert.equal(scripts.title, "Allow JavaScript on every open, including after file edits");
  });

  it("grants only allow-scripts when scripts are turned on, and revokes it when turned off", async () => {
    const harness = await Harness.load();
    const view = harness.newView();
    harness.open(view, "page.html", PAGE);

    button(view, "Scripts OFF").click();
    let iframe = frame(view);
    assert.ok(iframe);
    assert.deepEqual(sandboxTokens(iframe), ["allow-scripts"]);
    assert.equal(securityPill(view), "Scripts ON");
    assert.equal(button(view, "Scripts ON").getAttribute("aria-pressed"), "true");
    assert.equal(button(view, "Scripts ON").title, "Disable JavaScript for this file");

    button(view, "Scripts ON").click();
    iframe = frame(view);
    assert.ok(iframe);
    assert.deepEqual(sandboxTokens(iframe), []);
    assert.equal(securityPill(view), "Scripts OFF");
  });

  it("never grants same-origin access, forms, popups, or navigation", () => {
    const allowed = new Set(["allow-scripts"]);
    for (const scriptsEnabled of [false, true]) {
      const tokens = sandboxValue(scriptsEnabled).split(/\s+/).filter(Boolean);
      assert.deepEqual(
        tokens.filter((token) => !allowed.has(token)),
        [],
        `sandbox with scripts ${scriptsEnabled ? "on" : "off"}`,
      );
    }
  });

  it("keeps scripts off for a different file in another tab", async () => {
    const harness = await Harness.load();
    const first = harness.newView();
    harness.open(first, "first.html", PAGE);
    button(first, "Scripts OFF").click();

    const second = harness.newView();
    harness.open(second, "second.html", PAGE);
    const iframe = frame(second);
    assert.ok(iframe);
    assert.deepEqual(sandboxTokens(iframe), []);
  });

  it("restores permission only when returning to the same file in a tab", async () => {
    const harness = await Harness.load();
    const view = harness.newView();
    harness.open(view, "trusted.html", PAGE);
    button(view, "Scripts OFF").click();

    harness.open(view, "other.html", PAGE);
    assert.equal(securityPill(view), "Scripts OFF");
    assert.equal(frame(view)?.getAttribute("sandbox"), "");

    harness.open(view, "trusted.html", PAGE);
    assert.equal(frame(view)?.getAttribute("sandbox"), "allow-scripts");
  });

  it("restores saved permission on plugin reload and saves rapid toggles in order", async () => {
    const first = await Harness.load();
    const original = first.newView();
    first.open(original, "trusted.html", PAGE);
    button(original, "Scripts OFF").click();
    await first.flushPluginSaves();

    const reopened = await Harness.load(first.app.pluginData);
    const view = reopened.newView();
    const sameFile = reopened.newView();
    reopened.open(view, "trusted.html", PAGE);
    reopened.open(sameFile, "trusted.html", PAGE);
    assert.equal(frame(view)?.getAttribute("sandbox"), "allow-scripts");
    assert.equal(frame(sameFile)?.getAttribute("sandbox"), "allow-scripts");

    button(view, "Scripts ON").click();
    assert.equal(frame(sameFile)?.getAttribute("sandbox"), "");
    button(view, "Scripts OFF").click();
    button(view, "Scripts ON").click();
    await reopened.flushPluginSaves();
    assert.equal(reopened.app.maxConcurrentPluginSaves, 1);
    assert.deepEqual(reopened.app.pluginData, { scriptPaths: [] });
  });

  it("forgets renamed and deleted paths without rerendering unrelated tabs", async () => {
    const harness = await Harness.load();
    const renamed = harness.newView();
    const deleted = harness.newView();
    const other = harness.newView();
    harness.open(renamed, "Reports/a.html", PAGE);
    harness.open(deleted, "b.html", PAGE);
    harness.open(other, "c.html", PAGE);
    for (const view of [renamed, deleted, other]) button(view, "Scripts OFF").click();
    const otherFrame = frame(other);
    assert.ok(otherFrame);

    harness.app.vaultEvents.get("rename")?.({ path: "Archive" }, "Reports");
    harness.app.vaultEvents.get("delete")?.({ path: "b.html" }, "");
    assert.equal(frame(renamed)?.getAttribute("sandbox"), "");
    assert.equal(frame(deleted)?.getAttribute("sandbox"), "");
    assert.equal(frame(other), otherFrame);
    await harness.flushPluginSaves();
    assert.deepEqual(harness.app.pluginData, { scriptPaths: ["c.html"] });
  });

  it("reloads the file and the frame when refreshed", async () => {
    const harness = await Harness.load();
    const view = harness.newView();
    harness.open(view, "page.html", PAGE);
    const before = frame(view);
    harness.app.files.set("page.html", "<p>Updated</p>");

    button(view, "Refresh preview").click();
    await settle();

    assert.deepEqual(harness.app.reads, ["page.html"]);
    assert.equal(view.getViewData(), "<p>Updated</p>");
    const after = frame(view);
    assert.ok(after);
    assert.notEqual(after, before, "the frame is replaced");
  });

  it("reports a file that cannot be read when refreshed", async () => {
    const harness = await Harness.load();
    const view = harness.newView();
    harness.open(view, "page.html", PAGE);
    harness.app.readError = new Error("permission denied");

    button(view, "Refresh preview").click();
    await settle();

    assert.equal(message(view), "Unable to read HTML file: permission denied");
    assert.equal(frame(view), null);
  });
});

describe("view messages", () => {
  it("says when no file is attached", async () => {
    const harness = await Harness.load();
    const view = harness.newView();
    view.setViewData(PAGE, true);
    assert.equal(message(view), "No HTML file is attached to this viewer.");
    assert.equal(frame(view), null);
  });

  it("refuses files that are not HTML", async () => {
    const harness = await Harness.load();
    const view = harness.newView();
    harness.open(view, "notes.md", "# Notes");
    assert.equal(message(view), "This viewer only supports .html and .htm files.");
    assert.equal(frame(view), null);
  });

  it("says when the file is empty", async () => {
    const harness = await Harness.load();
    const view = harness.newView();
    harness.open(view, "empty.htm", "  \n\t\n");
    assert.equal(message(view), "This HTML file is empty.");
    assert.equal(frame(view), null);
  });

  it("accepts .htm and upper-case extensions", async () => {
    const harness = await Harness.load();
    for (const path of ["page.htm", "PAGE.HTML"]) {
      const view = harness.newView();
      harness.open(view, path, PAGE);
      assert.ok(frame(view), path);
    }
  });

  it("shows the file's name and path above the page", async () => {
    const harness = await Harness.load();
    const view = harness.newView();
    harness.open(view, "Reports/2026/summary.html", PAGE);
    const header = view.contentEl.querySelector(".html-page-viewer__header");
    assert.equal(header?.querySelector(".html-page-viewer__filename")?.textContent, "summary.html");
    assert.equal(header?.querySelector(".html-page-viewer__path")?.textContent, "Reports/2026/summary.html");
  });

  it("clears the view", async () => {
    const harness = await Harness.load();
    const view = harness.newView();
    harness.open(view, "page.html", PAGE);
    view.clear();
    assert.equal(view.getViewData(), "");
    assert.equal(view.contentEl.childElementCount, 0);
  });
});
