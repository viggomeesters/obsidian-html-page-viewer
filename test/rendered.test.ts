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
    assert.equal(button(view, "Scripts OFF").getAttribute("aria-pressed"), "false");
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

  it("keeps scripts per view: a new tab starts with them off", async () => {
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

  it(
    "turns scripts off when another file opens in the same view",
    { todo: "scripts stay on for the next file in the tab (#18)" },
    async () => {
      const harness = await Harness.load();
      const view = harness.newView();
      harness.open(view, "trusted.html", PAGE);
      button(view, "Scripts OFF").click();

      harness.open(view, "other.html", PAGE);
      const iframe = frame(view);
      assert.ok(iframe);
      assert.deepEqual(sandboxTokens(iframe), []);
      assert.equal(securityPill(view), "Scripts OFF");
    },
  );

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
