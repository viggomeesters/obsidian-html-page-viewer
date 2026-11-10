<p align="center">
  <img src="assets/hero.svg" alt="HTML Page Viewer for Obsidian" width="100%">
</p>

<p align="center">
  <a href="https://github.com/viggomeesters/obsidian-html-page-viewer/releases/latest"><img alt="Latest release" src="https://img.shields.io/github/v/release/viggomeesters/obsidian-html-page-viewer?style=flat-square"></a>
  <a href="LICENSE"><img alt="MIT license" src="https://img.shields.io/badge/license-MIT-green?style=flat-square"></a>
  <img alt="Obsidian 1.5.0+" src="https://img.shields.io/badge/Obsidian-1.5.0%2B-7c3aed?style=flat-square">
  <img alt="Read-only" src="https://img.shields.io/badge/mode-read--only-0f766e?style=flat-square">
</p>

# HTML Page Viewer

HTML Page Viewer is a read-only Obsidian plugin for opening `.html` and `.htm` files as rendered pages inside Obsidian. It is built for local reports, exported dashboards, documentation pages, prototypes, and generated visual artifacts that you want to inspect without leaving the vault.

![HTML Page Viewer preview](assets/screenshot.svg)

## Features

- Opens `.html` and `.htm` files in a dedicated Obsidian view.
- Shows a rendered preview by default.
- Provides a source view with lightweight HTML syntax highlighting and line numbers.
- Includes a toolbar for Rendered/Source, Refresh, and Scripts OFF/ON.
- Keeps scripts disabled by default.
- Remembers explicit script permission separately for each HTML file.
- Renders through a sandboxed iframe.
- Blocks forms, popups, top-level navigation, and same-origin access.
- Stays read-only by design: it never writes back to HTML files.

## Security model

HTML files can execute powerful browser behavior if a viewer permits it. HTML Page Viewer uses a conservative default:

- Scripts are **OFF** by default.
- Scripts **ON** adds only `allow-scripts` to the iframe sandbox.
- The iframe is never granted `allow-same-origin`, `allow-forms`, `allow-popups`, or `allow-top-navigation`.
- The plugin code does not make network requests.
- The plugin code does not read or write the system clipboard.
- The plugin code does not edit vault files.

Rendered HTML may still request external resources, such as images, stylesheets, fonts, or scripts, when the HTML document itself references them. This is normal browser behavior for rendered HTML pages and is separate from plugin code making network requests.

## Why read-only?

HTML reports and exported pages are often generated artifacts. HTML Page Viewer intentionally does not write to disk, so it cannot reformat, truncate, or corrupt your files.

## Installation

### Community plugin directory

Install from the [Obsidian Community directory](https://community.obsidian.md/plugins/html-page-viewer) or search for HTML Page Viewer in Settings → Community plugins → Browse.

### Manual installation

1. Download `main.js`, `manifest.json`, and `styles.css` from the [latest release](https://github.com/viggomeesters/obsidian-html-page-viewer/releases/latest).
2. Create this folder in your vault: `.obsidian/plugins/html-page-viewer/`.
3. Put the downloaded files in that folder.
4. Reload Obsidian.
5. Enable **HTML Page Viewer** in **Settings -> Community plugins**.

### BRAT installation

For beta testing, install the plugin with [BRAT](https://github.com/TfTHacker/obsidian42-brat) using this repository URL:

```text
https://github.com/viggomeesters/obsidian-html-page-viewer
```

## Usage

Open any `.html` or `.htm` file in your vault. Obsidian will open it with HTML Page Viewer.

Use the toolbar to:

- switch between the rendered preview and source view
- refresh the rendered preview after file changes
- turn scripts on or off for the current HTML file

The Scripts toggle remembers your choice when you switch files or restart Obsidian. Enable it only for files you trust, including future edits at the same path. Turning scripts off removes the saved permission. Renaming, moving, or deleting a file in Obsidian clears permission for its old path.

## Development

```bash
npm install
npm run build
npx tsc --noEmit
npm test
```

For local development, copy or symlink this repository into `.obsidian/plugins/html-page-viewer/` inside an Obsidian vault.

## Release process

Obsidian installs community plugin files from GitHub releases. For each release:

1. Update `manifest.json`, `package.json`, and `versions.json`.
2. Run `npm install`, `npm run build`, `npx tsc --noEmit`, and `npm test`.
3. Create a GitHub release whose tag exactly matches `manifest.json.version`.
4. Attach `main.js`, `manifest.json`, and `styles.css` as release assets.

The repository includes a GitHub Actions release workflow with artifact attestation support. If GitHub Actions is disabled for the owner account, manual releases are still usable for Obsidian, but the Community automated review may show a recommendation about missing artifact attestations.

## Community directory

HTML Page Viewer is listed in the [Obsidian Community directory](https://community.obsidian.md/plugins/html-page-viewer).

## Acknowledgements

HTML Page Viewer was built independently, but it was informed by the existing Obsidian HTML viewer ecosystem, including the MIT-licensed [JiaLinZhang24/obsidian-html-viewer](https://github.com/JiaLinZhang24/obsidian-html-viewer). No source code from that project is included in this repository.

## License

[MIT](LICENSE)
