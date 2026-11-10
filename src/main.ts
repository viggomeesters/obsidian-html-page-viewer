import {
  Notice,
  Plugin,
  TFile,
  TextFileView,
  WorkspaceLeaf,
  setIcon,
} from "obsidian";

const VIEW_TYPE_HTML_PAGE_VIEWER = "html-page-viewer";
const HTML_EXTENSIONS = ["html", "htm"];

type ViewMode = "rendered" | "source";

export default class HtmlPageViewerPlugin extends Plugin {
  private readonly scriptPaths = new Set<string>();
  private pendingSave: Promise<void> = Promise.resolve();

  async onload(): Promise<void> {
    const saved = (await this.loadData()) as { scriptPaths?: unknown } | null;
    if (Array.isArray(saved?.scriptPaths)) {
      for (const path of saved.scriptPaths) {
        if (typeof path === "string") this.scriptPaths.add(path);
      }
    }

    this.registerView(
      VIEW_TYPE_HTML_PAGE_VIEWER,
      (leaf) => new HtmlPageViewerView(leaf, this),
    );
    this.registerExtensions(HTML_EXTENSIONS, VIEW_TYPE_HTML_PAGE_VIEWER);
    this.registerEvent(this.app.vault.on("delete", (file) => this.forgetScriptPaths(file.path)));
    this.registerEvent(this.app.vault.on("rename", (_file, oldPath) => this.forgetScriptPaths(oldPath)));

    this.addCommand({
      id: "open-current-html-in-viewer",
      name: "Open current HTML file in viewer",
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveFile();
        if (!isHtmlFile(file)) return false;

        if (!checking) {
          void this.openHtmlFile(file);
        }
        return true;
      },
    });
  }

  async openHtmlFile(file: TFile): Promise<void> {
    const leaf = this.app.workspace.getLeaf(false);
    await leaf.setViewState({
      type: VIEW_TYPE_HTML_PAGE_VIEWER,
      state: { file: file.path },
      active: true,
    });
  }

  allowsScripts(path: string): boolean {
    return this.scriptPaths.has(path);
  }

  toggleScripts(path: string): void {
    if (!this.scriptPaths.delete(path)) this.scriptPaths.add(path);
    this.saveScriptPaths();
    this.refreshScriptViews();
  }

  private forgetScriptPaths(path: string): void {
    let changed = false;
    for (const allowedPath of this.scriptPaths) {
      if (allowedPath === path || allowedPath.startsWith(`${path}/`)) {
        this.scriptPaths.delete(allowedPath);
        changed = true;
      }
    }
    if (!changed) return;

    this.saveScriptPaths();
    this.refreshScriptViews();
  }

  private refreshScriptViews(): void {
    for (const { view } of this.app.workspace.getLeavesOfType(VIEW_TYPE_HTML_PAGE_VIEWER)) {
      if (view instanceof HtmlPageViewerView) {
        view.refreshScriptPermission();
      }
    }
  }

  private saveScriptPaths(): void {
    const scriptPaths = [...this.scriptPaths];
    this.pendingSave = this.pendingSave
      .then(() => this.saveData({ scriptPaths }))
      .catch(() => {
        new Notice("Could not save script permissions. They may revert when Obsidian restarts.");
      });
  }
}

class HtmlPageViewerView extends TextFileView {
  private mode: ViewMode = "rendered";
  private renderedScriptsEnabled = false;
  private iframe: HTMLIFrameElement | null = null;

  constructor(leaf: WorkspaceLeaf, private readonly plugin: HtmlPageViewerPlugin) {
    super(leaf);
  }

  private get scriptsEnabled(): boolean {
    return isHtmlFile(this.file) && this.plugin.allowsScripts(this.file.path);
  }

  refreshScriptPermission(): void {
    if (this.renderedScriptsEnabled !== this.scriptsEnabled) this.render();
  }

  getViewType(): string {
    return VIEW_TYPE_HTML_PAGE_VIEWER;
  }

  getDisplayText(): string {
    return this.file?.basename ?? "HTML page viewer";
  }

  getIcon(): string {
    return "file-code-2";
  }

  setViewData(data: string): void {
    this.data = data;
    this.render();
  }

  getViewData(): string {
    return this.data;
  }

  clear(): void {
    this.data = "";
    this.iframe = null;
    this.contentEl.empty();
  }

  private render(): void {
    this.renderedScriptsEnabled = this.scriptsEnabled;
    const container = this.contentEl;
    container.empty();
    container.addClass("html-page-viewer");

    const header = container.createDiv({ cls: "html-page-viewer__header" });
    this.renderTitle(header);
    this.renderToolbar(header);

    if (!this.file) {
      renderMessage(container, "No HTML file is attached to this viewer.");
      return;
    }

    if (!isHtmlFile(this.file)) {
      renderMessage(container, "This viewer only supports .html and .htm files.");
      return;
    }

    if (!this.data.trim()) {
      renderMessage(container, "This HTML file is empty.");
      return;
    }

    const security = container.createDiv({ cls: "html-page-viewer__security" });
    security.createSpan({
      cls: "html-page-viewer__security-pill",
      text: this.scriptsEnabled ? "Scripts ON" : "Scripts OFF",
    });
    security.createSpan({
      text: this.scriptsEnabled
        ? "Sandbox allows scripts only; forms, popups, top navigation, and same-origin access remain blocked."
        : "Sandbox blocks scripts, forms, popups, top navigation, and same-origin access.",
    });

    if (this.mode === "source") {
      renderSource(container, this.data);
      return;
    }

    this.renderIframe(container);
  }

  private renderTitle(parent: HTMLElement): void {
    const title = parent.createDiv({ cls: "html-page-viewer__title" });
    title.createDiv({
      cls: "html-page-viewer__filename",
      text: this.file?.name ?? "HTML file",
    });
    title.createDiv({
      cls: "html-page-viewer__path",
      text: this.file?.path ?? "",
    });
  }

  private renderToolbar(parent: HTMLElement): void {
    const toolbar = parent.createDiv({ cls: "html-page-viewer__toolbar" });
    const modeGroup = toolbar.createDiv({
      cls: "html-page-viewer__segmented",
      attr: { "aria-label": "View mode" },
    });
    const renderedButton = createTextButton(modeGroup, "Rendered");
    const sourceButton = createTextButton(modeGroup, "Source");
    renderedButton.toggleClass("is-active", this.mode === "rendered");
    sourceButton.toggleClass("is-active", this.mode === "source");

    renderedButton.addEventListener("click", () => {
      this.mode = "rendered";
      this.render();
    });
    sourceButton.addEventListener("click", () => {
      this.mode = "source";
      this.render();
    });

    const refreshButton = createIconButton(toolbar, "refresh-cw", "Refresh preview");
    refreshButton.addEventListener("click", () => {
      void this.reloadFile();
    });

    const scriptsButton = createTextButton(toolbar, this.scriptsEnabled ? "Scripts ON" : "Scripts OFF");
    scriptsButton.addClass("html-page-viewer__scripts-toggle");
    scriptsButton.toggleClass("is-enabled", this.scriptsEnabled);
    scriptsButton.setAttribute("aria-pressed", String(this.scriptsEnabled));
    scriptsButton.setAttribute("title", this.scriptsEnabled
      ? "Disable JavaScript for this file"
      : "Allow JavaScript on every open, including after file edits");
    const file = this.file;
    const path = file?.path;
    scriptsButton.disabled = !isHtmlFile(file);
    scriptsButton.addEventListener("click", () => {
      if (path !== undefined && this.file === file && file?.path === path) {
        this.plugin.toggleScripts(path);
      }
    });
  }

  private renderIframe(parent: HTMLElement): void {
    const file = this.file;
    if (!file) {
      renderMessage(parent, "No HTML file is attached to this viewer.");
      return;
    }

    const frameWrap = parent.createDiv({ cls: "html-page-viewer__frame-wrap" });
    const iframe = frameWrap.createEl("iframe", {
      cls: "html-page-viewer__frame",
      attr: {
        title: file.name,
        referrerpolicy: "no-referrer",
      },
    });
    iframe.setAttribute("sandbox", sandboxValue(this.scriptsEnabled));
    iframe.src = withCacheBust(this.app.vault.getResourcePath(file));
    this.iframe = iframe;
  }

  private async reloadFile(): Promise<void> {
    if (!this.file) {
      new Notice("No HTML file to refresh");
      return;
    }

    try {
      this.data = await this.app.vault.read(this.file);
      this.render();
    } catch (error) {
      this.contentEl.empty();
      this.contentEl.addClass("html-page-viewer");
      renderMessage(this.contentEl, `Unable to read HTML file: ${getErrorMessage(error)}`);
    }
  }
}

export function sandboxValue(scriptsEnabled: boolean): string {
  return scriptsEnabled ? "allow-scripts" : "";
}

function renderSource(parent: HTMLElement, data: string): void {
  const source = parent.createDiv({ cls: "html-page-viewer__source" });
  const pre = source.createEl("pre");
  let lineNumber = 0;
  const startLine = (): HTMLElement => {
    lineNumber += 1;
    const lineEl = pre.createDiv({ cls: "html-page-viewer__source-line" });
    lineEl.createSpan({ cls: "html-page-viewer__line-number", text: String(lineNumber) });
    return lineEl.createSpan({ cls: "html-page-viewer__source-code" });
  };

  // A token can continue over several lines, as a comment or a tag can, and
  // keeps its highlighting on each of them.
  let code = startLine();
  for (const token of tokenizeHtml(data)) {
    token.text.split("\n").forEach((part, index) => {
      if (index > 0) code = startLine();
      if (part === "") return;
      if (token.kind === "text") {
        code.appendText(part);
      } else {
        code.createSpan({ cls: `html-page-viewer__tok-${token.kind}`, text: part });
      }
    });
  }
}

type TokenKind = "text" | "comment" | "punctuation" | "tag" | "attr" | "string";

interface Token {
  readonly kind: TokenKind;
  text: string;
}

/** Elements whose contents HTML reads as text up to their end tag. */
const RAW_TEXT_ELEMENTS = new Set(["iframe", "noembed", "noframes", "script", "style", "textarea", "title", "xmp"]);

/** HTML's whitespace, which excludes the other spaces that `\s` matches. */
const HTML_SPACE = /[\t\n\f\r ]/;

/** What ends a tag's name, an attribute's name, and a value without quotes. */
const TAG_NAME_END = /[\t\n\f\r />]/;
const ATTRIBUTE_NAME_END = /[\t\n\f\r />=]/;
const UNQUOTED_VALUE_END = /[\t\n\f\r >]/;

/**
 * Splits HTML into tokens to highlight, where HTML's tokenizer would see tags,
 * comments, and text. The tokens' texts together are exactly `html`.
 */
function tokenizeHtml(html: string): Token[] {
  const tokens: Token[] = [];
  const push = (kind: TokenKind, text: string): void => {
    if (text === "") return;
    const last = tokens[tokens.length - 1];
    if (last?.kind === kind) {
      last.text += text;
    } else {
      tokens.push({ kind, text });
    }
  };

  let cursor = 0;
  while (cursor < html.length) {
    const start = nextMarkupStart(html, cursor);
    if (start === -1) {
      push("text", html.slice(cursor));
      break;
    }
    push("text", html.slice(cursor, start));

    if (html.startsWith("<!--", start)) {
      cursor = commentEnd(html, start);
      push("comment", html.slice(start, cursor));
      continue;
    }

    const isEndTag = html[start + 1] === "/";
    const nameStart = start + (isEndTag ? 2 : 1);
    if (!/[A-Za-z]/.test(html[nameStart] ?? "")) {
      // A doctype, or another construct that HTML skips up to the next ">".
      const end = html.indexOf(">", start + 2);
      cursor = end === -1 ? html.length : end + 1;
      push("punctuation", html.slice(start, cursor));
      continue;
    }

    let nameEnd = nameStart;
    while (nameEnd < html.length && !TAG_NAME_END.test(html[nameEnd])) nameEnd += 1;
    push("punctuation", html.slice(start, nameStart));
    push("tag", html.slice(nameStart, nameEnd));
    const end = tokenizeAttributes(html, nameEnd, push);
    if (end === -1) break;
    cursor = end;

    const name = html.slice(nameStart, nameEnd).toLowerCase();
    if (isEndTag) continue;
    if (name === "plaintext") {
      push("text", html.slice(cursor));
      break;
    }
    if (RAW_TEXT_ELEMENTS.has(name)) {
      const end = rawTextEnd(html, cursor, name);
      push("text", html.slice(cursor, end));
      cursor = end;
    }
  }
  return tokens;
}

/** Where the next tag, comment, or declaration starts: a `<` that HTML reads as markup. */
function nextMarkupStart(html: string, from: number): number {
  let start = html.indexOf("<", from);
  while (start !== -1 && !/[A-Za-z/!?]/.test(html[start + 1] ?? "")) {
    start = html.indexOf("<", start + 1);
  }
  return start;
}

/** The end of the comment that starts at `start`, or of `html` if it has none. */
function commentEnd(html: string, start: number): number {
  const body = start + 4;
  // `<!-->` and `<!--->` are whole comments.
  if (html.startsWith(">", body)) return body + 1;
  if (html.startsWith("->", body)) return body + 2;
  const close = /--!?>/g;
  close.lastIndex = body;
  const match = close.exec(html);
  return match ? match.index + match[0].length : html.length;
}

/**
 * Tokenizes a tag's attributes from `start`, after its name, and returns where
 * the tag ends: after its `>`, which a quoted value can contain, or -1 if the
 * file ends first.
 */
function tokenizeAttributes(html: string, start: number, push: (kind: TokenKind, text: string) => void): number {
  let cursor = start;
  while (cursor < html.length) {
    const char = html[cursor];
    if (char === ">") {
      push("punctuation", char);
      return cursor + 1;
    }
    if (char === "/" || HTML_SPACE.test(char)) {
      push("punctuation", char);
      cursor += 1;
      continue;
    }

    // A name runs up to whitespace, "/", ">", or "=", and can start with "=".
    const nameStart = cursor;
    cursor += 1;
    while (cursor < html.length && !ATTRIBUTE_NAME_END.test(html[cursor])) cursor += 1;
    push("attr", html.slice(nameStart, cursor));

    let equals = cursor;
    while (equals < html.length && HTML_SPACE.test(html[equals])) equals += 1;
    if (html[equals] !== "=") continue;

    const separatorStart = cursor;
    cursor = equals + 1;
    while (cursor < html.length && HTML_SPACE.test(html[cursor])) cursor += 1;
    push("punctuation", html.slice(separatorStart, cursor));

    const quote = html[cursor];
    if (quote === "\"" || quote === "'") {
      const close = html.indexOf(quote, cursor + 1);
      const end = close === -1 ? html.length : close + 1;
      push("string", html.slice(cursor, end));
      cursor = end;
    } else {
      const valueStart = cursor;
      while (cursor < html.length && !UNQUOTED_VALUE_END.test(html[cursor])) cursor += 1;
      push("string", html.slice(valueStart, cursor));
    }
  }
  return -1;
}

/** Where the text of a raw text element such as `script` ends: at its end tag. */
function rawTextEnd(html: string, start: number, name: string): number {
  const endTag = new RegExp(`</${name}[\\t\\n\\f\\r />]`, "gi");
  endTag.lastIndex = start;
  return endTag.exec(html)?.index ?? html.length;
}

function createIconButton(parent: HTMLElement, icon: string, label: string): HTMLButtonElement {
  const button = parent.createEl("button", {
    cls: "clickable-icon html-page-viewer__button",
    attr: { "aria-label": label, title: label, type: "button" },
  });
  setIcon(button, icon);
  return button;
}

function createTextButton(parent: HTMLElement, label: string): HTMLButtonElement {
  return parent.createEl("button", {
    cls: "html-page-viewer__text-button",
    text: label,
    attr: { type: "button" },
  });
}

function renderMessage(parent: HTMLElement, message: string): void {
  parent.createDiv({ cls: "html-page-viewer__message", text: message });
}

function withCacheBust(url: string): string {
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}html-page-viewer-refresh=${Date.now()}`;
}

function isHtmlFile(file: TFile | null): file is TFile {
  return Boolean(file && HTML_EXTENSIONS.includes(file.extension.toLowerCase()));
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
