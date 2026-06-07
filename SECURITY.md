# Security Policy

## Supported versions

Only the latest release is actively supported.

## Reporting a vulnerability

Please report security issues privately by emailing the maintainer or opening a minimal GitHub security advisory if available.

Do not include sensitive vault content in public issues. If a reproduction requires HTML content, reduce it to a minimal synthetic example first.

## Security posture

HTML Page Viewer is read-only. It reads HTML files through Obsidian's vault API and renders them in a sandboxed iframe.

Scripts are disabled by default. When the user explicitly turns scripts on for a viewer tab, the iframe receives `allow-scripts` only. It does not receive `allow-same-origin`, `allow-forms`, `allow-popups`, or `allow-top-navigation`.

HTML files can still request external resources such as images, stylesheets, fonts, or scripts when the rendered page itself references them. The plugin code does not make network requests, does not read or write the system clipboard, and does not write HTML files back to disk.
