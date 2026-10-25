import assert from "node:assert/strict";
import HtmlPageViewerPlugin from "../../src/main";
import { App, Plugin, TFile, WorkspaceLeaf } from "./obsidian";

export const VIEW_TYPE = "html-page-viewer";

/** The parts of the plugin's view that Obsidian calls. */
export interface HtmlView {
  file: TFile | null;
  readonly contentEl: HTMLElement;
  setViewData(data: string, clear: boolean): void;
  getViewData(): string;
  getDisplayText(): string;
  clear(): void;
}

/** A loaded plugin in a stand-in Obsidian, with helpers to open views. */
export class Harness {
  readonly app = new App();
  readonly plugin: Plugin;

  private constructor() {
    this.plugin = new HtmlPageViewerPlugin(this.app as never, {} as never) as unknown as Plugin;
  }

  static async load(): Promise<Harness> {
    const harness = new Harness();
    await (harness.plugin as unknown as HtmlPageViewerPlugin).onload();
    return harness;
  }

  /** Creates a view as Obsidian does for a new tab. */
  newView(): HtmlView {
    const creator = this.plugin.views.get(VIEW_TYPE);
    assert.ok(creator, "the plugin registers its view");
    return creator(new WorkspaceLeaf(this.app)) as HtmlView;
  }

  /** Loads a file into a view as Obsidian does when a file opens in its tab. */
  open(view: HtmlView, path: string, data: string): TFile {
    const file = new TFile(path);
    this.app.files.set(path, data);
    view.file = file;
    view.setViewData(data, true);
    return file;
  }
}

export function frame(view: HtmlView): HTMLIFrameElement | null {
  return view.contentEl.querySelector("iframe.html-page-viewer__frame");
}

export function sandboxTokens(iframe: HTMLIFrameElement): string[] {
  const value = iframe.getAttribute("sandbox");
  assert.notEqual(value, null, "the frame has a sandbox attribute");
  return (value ?? "").split(/\s+/).filter(Boolean);
}

export function button(view: HtmlView, label: string | RegExp): HTMLButtonElement {
  const buttons = [...view.contentEl.querySelectorAll("button")];
  const found = buttons.find((candidate) => {
    const name = candidate.getAttribute("aria-label") ?? candidate.textContent ?? "";
    return typeof label === "string" ? name === label : label.test(name);
  });
  assert.ok(found, `a button labelled ${String(label)}`);
  return found;
}

export function message(view: HtmlView): string | null {
  return view.contentEl.querySelector(".html-page-viewer__message")?.textContent ?? null;
}

export function securityPill(view: HtmlView): string | null {
  return view.contentEl.querySelector(".html-page-viewer__security-pill")?.textContent ?? null;
}

/** Waits for promises the view started without awaiting them. */
export function settle(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
