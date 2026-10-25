import assert from "node:assert/strict";
import fs from "node:fs";
import { describe, it } from "node:test";
import { button, frame, Harness, type HtmlView } from "./support/harness";

async function showSource(data: string): Promise<HtmlView> {
  const harness = await Harness.load();
  const view = harness.newView();
  harness.open(view, "page.html", data);
  button(view, "Source").click();
  return view;
}

function lines(view: HtmlView): Element[] {
  return [...view.contentEl.querySelectorAll(".html-page-viewer__source-line")];
}

function tokens(line: Element): [string, string][] {
  const code = line.querySelector(".html-page-viewer__source-code");
  assert.ok(code);
  return [...code.childNodes].map((node) => [
    node instanceof HTMLElement ? node.className.replace("html-page-viewer__tok-", "") : "text",
    node.textContent ?? "",
  ]);
}

describe("source view", () => {
  it("replaces the frame with the source, and switches back", async () => {
    const view = await showSource("<p>Hello</p>");
    assert.equal(frame(view), null);
    assert.ok(view.contentEl.querySelector(".html-page-viewer__source"));

    button(view, "Rendered").click();
    assert.ok(frame(view));
    assert.equal(view.contentEl.querySelector(".html-page-viewer__source"), null);
  });

  for (const fixture of ["static.html", "interactive.html"]) {
    it(`shows every line of ${fixture} with its number and its text unchanged`, async () => {
      const data = fs.readFileSync(`test-fixtures/${fixture}`, "utf8");
      const view = await showSource(data);
      const expected = data.split("\n");
      const shown = lines(view);
      assert.equal(shown.length, expected.length);
      shown.forEach((line, index) => {
        assert.equal(line.querySelector(".html-page-viewer__line-number")?.textContent, String(index + 1));
        assert.equal(line.querySelector(".html-page-viewer__source-code")?.textContent, expected[index]);
      });
    });
  }

  it("shows markup as text and never runs it", async () => {
    const data = '<script>window.ran = true;</script><img src="x" onerror="window.ran = true">';
    const view = await showSource(data);
    const source = view.contentEl.querySelector(".html-page-viewer__source");
    assert.ok(source);
    assert.equal(source.querySelector("script, img"), null);
    assert.equal(source.querySelector(".html-page-viewer__source-code")?.textContent, data);
  });

  it("highlights tag names, attributes, values, and comments", async () => {
    const view = await showSource('<a href="notes.html" download>Notes</a> <!-- see also -->');
    assert.deepEqual(tokens(lines(view)[0]), [
      ["punctuation", "<"],
      ["tag", "a"],
      ["punctuation", " "],
      ["attr", "href"],
      ["punctuation", "="],
      ["string", '"notes.html"'],
      ["punctuation", " "],
      ["attr", "download"],
      ["punctuation", ">"],
      ["text", "Notes"],
      ["punctuation", "</"],
      ["tag", "a"],
      ["punctuation", ">"],
      ["text", " "],
      ["comment", "<!-- see also -->"],
    ]);
  });

  it(
    "keeps a comment highlighted on the lines it continues on",
    { todo: "highlighting is per line (#14)" },
    async () => {
      const view = await showSource("<!-- A comment\n     over two lines -->");
      assert.deepEqual(tokens(lines(view)[1]), [["comment", "     over two lines -->"]]);
    },
  );

  it(
    "highlights attributes on the lines after the tag name",
    { todo: "highlighting is per line (#14)" },
    async () => {
      const view = await showSource('<img\n  src="photo.png"\n  alt="A photo">');
      assert.ok(tokens(lines(view)[1]).some(([kind, text]) => kind === "attr" && text === "src"));
    },
  );
});
