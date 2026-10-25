# Contributing

Thanks for helping improve HTML Page Viewer.

## Local setup

```bash
npm install
npm run build
npx tsc --noEmit
npm test
```

`npm test` bundles the tests in `test/` with esbuild and runs them with Node's test runner, in a jsdom window with a stand-in for Obsidian's API (`test/support/`).

For manual testing, copy the repository into `.obsidian/plugins/html-page-viewer/` in a test vault, reload Obsidian, and open `.html` and `.htm` files.

## Pull requests

- Keep the plugin read-only.
- Keep scripts disabled by default.
- Do not add network APIs in plugin code unless the security model and README are updated.
- Do not add clipboard access without an explicit user action and documentation.
- Run build, typecheck, and tests before opening a PR. A test marked `todo` reproduces a known defect; remove the marker with the fix.

## Release assets

Community releases must include:

- `main.js`
- `manifest.json`
- `styles.css`
