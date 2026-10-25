import { JSDOM } from "jsdom";

// Obsidian runs plugins in a browser window and adds helper methods to DOM
// nodes. The tests recreate both: a jsdom window, at Obsidian's own origin, as
// the global scope, and the helpers this plugin uses, which behave as
// Obsidian's do for the options the plugin passes.

const dom = new JSDOM("<!doctype html><html><head></head><body></body></html>", {
  url: "app://obsidian.md/index.html",
});
const { window } = dom;

const globals = [
  "window",
  "document",
  "Node",
  "Element",
  "HTMLElement",
  "HTMLIFrameElement",
  "DocumentFragment",
  "Text",
] as const;
for (const name of globals) {
  Object.defineProperty(globalThis, name, {
    configurable: true,
    value: name === "window" ? window : window[name],
  });
}

interface ElementInfo {
  cls?: string | string[];
  text?: string;
  attr?: Record<string, string | number | boolean | null>;
  title?: string;
  type?: string;
  value?: string;
  href?: string;
}

function applyInfo(el: HTMLElement, info: ElementInfo | string | undefined): void {
  if (info === undefined) return;
  const options = typeof info === "string" ? { cls: info } : info;
  if (options.cls !== undefined) {
    const classes = Array.isArray(options.cls) ? options.cls : options.cls.split(" ");
    el.classList.add(...classes.filter(Boolean));
  }
  if (options.text !== undefined) el.textContent = options.text;
  for (const [name, value] of Object.entries(options.attr ?? {})) {
    if (value === null || value === false) el.removeAttribute(name);
    else el.setAttribute(name, value === true ? "" : String(value));
  }
  if (options.title !== undefined) el.title = options.title;
  if (options.type !== undefined) el.setAttribute("type", options.type);
  if (options.value !== undefined) el.setAttribute("value", options.value);
  if (options.href !== undefined) el.setAttribute("href", options.href);
}

function define(target: object, methods: Record<string, unknown>): void {
  for (const [name, value] of Object.entries(methods)) {
    Object.defineProperty(target, name, { configurable: true, writable: true, value });
  }
}

define(window.Node.prototype, {
  createEl(
    this: Node,
    tag: string,
    info?: ElementInfo | string,
    callback?: (el: HTMLElement) => void,
  ): HTMLElement {
    const el = window.document.createElement(tag);
    applyInfo(el, info);
    this.appendChild(el);
    callback?.(el);
    return el;
  },
  createDiv(this: Node, info?: ElementInfo | string): HTMLElement {
    return (this as HTMLElement).createEl("div", info);
  },
  createSpan(this: Node, info?: ElementInfo | string): HTMLElement {
    return (this as HTMLElement).createEl("span", info);
  },
  empty(this: Node): void {
    while (this.firstChild) this.removeChild(this.firstChild);
  },
  appendText(this: Node, text: string): void {
    this.appendChild(window.document.createTextNode(text));
  },
});

define(window.Element.prototype, {
  addClass(this: Element, ...classes: string[]): void {
    this.classList.add(...classes);
  },
  removeClass(this: Element, ...classes: string[]): void {
    this.classList.remove(...classes);
  },
  toggleClass(this: Element, classes: string | string[], value: boolean): void {
    for (const cls of Array.isArray(classes) ? classes : [classes]) {
      this.classList.toggle(cls, value);
    }
  },
  hasClass(this: Element, cls: string): boolean {
    return this.classList.contains(cls);
  },
});
