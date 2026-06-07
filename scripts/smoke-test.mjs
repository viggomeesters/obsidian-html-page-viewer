import fs from "node:fs";

const manifest = JSON.parse(fs.readFileSync("manifest.json", "utf8"));
const main = fs.readFileSync("src/main.ts", "utf8");
const styles = fs.readFileSync("styles.css", "utf8");
const staticFixture = fs.readFileSync("test-fixtures/static.html", "utf8");
const interactiveFixture = fs.readFileSync("test-fixtures/interactive.html", "utf8");

const assertions = [
  [manifest.id === "html-page-viewer", "manifest id is html-page-viewer"],
  [manifest.version === "0.1.0", "manifest version is 0.1.0"],
  [main.includes("private scriptsEnabled = false"), "scripts default to off"],
  [main.includes("sandboxValue(this.scriptsEnabled)"), "iframe sandbox is derived from script toggle"],
  [main.includes("allow-scripts"), "script toggle grants only allow-scripts"],
  [main.includes("renderSource(container, this.data)"), "source view code path exists"],
  [main.includes("this.app.vault.getResourcePath(file)"), "rendered view uses vault resource path"],
  [!main.includes("navigator.clipboard"), "plugin code has no clipboard access"],
  [!styles.includes("!important"), "styles do not use important overrides"],
  [staticFixture.includes("<!-- Static fixture"), "static fixture contains an HTML comment for source highlighting"],
  [interactiveFixture.includes("<script>"), "interactive fixture contains script for toggle testing"],
];

const failures = assertions.filter(([passes]) => !passes).map(([, label]) => label);

if (failures.length > 0) {
  for (const failure of failures) {
    console.error(`FAIL: ${failure}`);
  }
  process.exit(1);
}

console.log("HTML Page Viewer smoke checks passed.");
