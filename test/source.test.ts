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

  it("shows markup as text without creating HTML elements", async () => {
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

  it("keeps a comment highlighted on the lines it continues on (#14)", async () => {
    const view = await showSource("<!-- A comment\n     over two lines -->");
    assert.deepEqual(tokens(lines(view)[1]), [["comment", "     over two lines -->"]]);
  });

  it("highlights attributes on the lines after the tag name (#14)", async () => {
    const view = await showSource('<img\n  src="photo.png"\n  alt="A photo">');
    assert.deepEqual(tokens(lines(view)[1]), [
      ["punctuation", "  "],
      ["attr", "src"],
      ["punctuation", "="],
      ["string", '"photo.png"'],
    ]);
    assert.deepEqual(tokens(lines(view)[2]), [
      ["punctuation", "  "],
      ["attr", "alt"],
      ["punctuation", "="],
      ["string", '"A photo"'],
      ["punctuation", ">"],
    ]);
  });

  it("keeps a quoted value highlighted on the lines it continues on", async () => {
    const view = await showSource('<p title="first\nsecond">Text</p>');
    assert.deepEqual(tokens(lines(view)[1]), [
      ["string", 'second"'],
      ["punctuation", ">"],
      ["text", "Text"],
      ["punctuation", "</"],
      ["tag", "p"],
      ["punctuation", ">"],
    ]);
  });

  it("keeps the spaces between attributes (#52)", async () => {
    for (const data of ["<input a b c>", "<input disabled >", '<a href = "x">y</a>']) {
      const view = await showSource(data);
      assert.equal(lines(view)[0].querySelector(".html-page-viewer__source-code")?.textContent, data);
    }
    const view = await showSource("<input disabled hidden>");
    assert.deepEqual(tokens(lines(view)[0]), [
      ["punctuation", "<"],
      ["tag", "input"],
      ["punctuation", " "],
      ["attr", "disabled"],
      ["punctuation", " "],
      ["attr", "hidden"],
      ["punctuation", ">"],
    ]);
  });

  it("ends a tag at a > outside its quoted values (#53)", async () => {
    const view = await showSource('<p title="a > b">Text</p>');
    assert.deepEqual(tokens(lines(view)[0]).slice(3, 7), [
      ["attr", "title"],
      ["punctuation", "="],
      ["string", '"a > b"'],
      ["punctuation", ">"],
    ]);
  });

  it("highlights attribute names as HTML reads them (#53)", async () => {
    const view = await showSource('<a @click="go()" :class="c" [value]="v" #ref>');
    const names = tokens(lines(view)[0]).filter(([kind]) => kind === "attr").map(([, text]) => text);
    assert.deepEqual(names, ["@click", ":class", "[value]", "#ref"]);
  });

  it("shows the contents of scripts and styles as text (#53)", async () => {
    const view = await showSource(
      '<script>\nif (a<b && c>d) go();\nfor (i = 0; i <n; i++) {}\n</SCRIPT>\n<style>a<b {}</style><p class="x">',
    );
    assert.deepEqual(tokens(lines(view)[1]), [["text", "if (a<b && c>d) go();"]]);
    assert.deepEqual(tokens(lines(view)[2]), [["text", "for (i = 0; i <n; i++) {}"]]);
    assert.deepEqual(tokens(lines(view)[3]), [
      ["punctuation", "</"],
      ["tag", "SCRIPT"],
      ["punctuation", ">"],
    ]);
    const last = tokens(lines(view)[4]);
    assert.deepEqual(last.slice(0, 4), [
      ["punctuation", "<"],
      ["tag", "style"],
      ["punctuation", ">"],
      ["text", "a<b {}"],
    ]);
    assert.ok(last.some(([kind, text]) => kind === "attr" && text === "class"));
  });

  it("starts a tag only at a < that HTML reads as markup (#53)", async () => {
    const view = await showSource("x < y, a<1, and <3");
    assert.deepEqual(tokens(lines(view)[0]), [["text", "x < y, a<1, and <3"]]);
  });

  it("ends comments and declarations where HTML does", async () => {
    const view = await showSource("<!-->a<!--->b<!-- c --!>d<!DOCTYPE html><?xml?>e");
    assert.deepEqual(tokens(lines(view)[0]), [
      ["comment", "<!-->"],
      ["text", "a"],
      ["comment", "<!--->"],
      ["text", "b"],
      ["comment", "<!-- c --!>"],
      ["text", "d"],
      ["punctuation", "<!DOCTYPE html><?xml?>"],
      ["text", "e"],
    ]);
  });

  it("shows any text unchanged, line by line", async () => {
    // Fragments of markup in random order, from a fixed seed.
    const pieces = [
      ...["<", ">", "/", "!", "?", "-", "--", "=", '"', "'", " ", "\t", "\n", "a", "B", "1", "&amp;"],
      ...["<!--", "-->", "--!>", "<!DOCTYPE", "<p ", "x=", "\r"],
      ...["<script>", "</script>", "</SCRIPT ", "</scriptx>", "<style>", "</style>", "<title>", "<plaintext>"],
    ];
    let seed = 1;
    const random = (limit: number): number => {
      seed = (seed * 48271) % 2147483647;
      return seed % limit;
    };
    const harness = await Harness.load();
    for (let run = 0; run < 300; run += 1) {
      let data = "";
      const length = 1 + random(40);
      for (let piece = 0; piece < length; piece += 1) data += pieces[random(pieces.length)];
      // The view shows a message for a file of only whitespace.
      if (data.trim() === "") continue;
      const view = harness.newView();
      harness.open(view, "page.html", data);
      button(view, "Source").click();
      const shown = lines(view).map((line) => line.querySelector(".html-page-viewer__source-code")?.textContent);
      assert.deepEqual(shown, data.split("\n"), JSON.stringify(data));
    }
  });

  it("shows a file that ends inside a tag, a value, a comment, or a script unchanged", async () => {
    const page = '<!DOCTYPE html>\n<p class="a\nb" hidden>Text<!-- c\n--!><script>x<y</script >';
    const harness = await Harness.load();
    for (let end = 1; end <= page.length; end += 1) {
      const data = page.slice(0, end);
      const view = harness.newView();
      harness.open(view, "page.html", data);
      button(view, "Source").click();
      const shown = lines(view).map((line) => line.querySelector(".html-page-viewer__source-code")?.textContent);
      assert.deepEqual(shown, data.split("\n"), JSON.stringify(data));
    }
  });
});
