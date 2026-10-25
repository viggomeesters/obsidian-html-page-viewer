import esbuild from "esbuild";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

// The tests are TypeScript that imports the plugin's source. The `obsidian`
// package only declares types, so each test file is bundled with esbuild, with
// `obsidian` replaced by the stand-in in test/support/obsidian.ts, and the
// bundles are run with Node.js's test runner.

const outdir = path.join("dist", "test");
const tests = fs
  .readdirSync("test", { recursive: true })
  .filter((file) => file.endsWith(".test.ts"))
  .map((file) => path.join("test", file))
  .sort();

fs.rmSync(outdir, { recursive: true, force: true });
await esbuild.build({
  bundle: true,
  entryPoints: tests,
  format: "esm",
  logLevel: "warning",
  outbase: "test",
  outdir,
  outExtension: { ".js": ".mjs" },
  packages: "external",
  platform: "node",
  plugins: [
    {
      name: "obsidian-stand-in",
      setup(build) {
        build.onResolve({ filter: /^obsidian$/ }, () => ({
          path: path.resolve("test", "support", "obsidian.ts"),
        }));
      },
    },
  ],
  sourcemap: "inline",
  target: "node22",
});

const bundles = tests.map((file) =>
  path.join(outdir, path.relative("test", file).replace(/\.ts$/, ".mjs")),
);
const result = spawnSync(process.execPath, ["--enable-source-maps", "--test", ...bundles], {
  stdio: "inherit",
});
process.exit(result.status ?? 1);
