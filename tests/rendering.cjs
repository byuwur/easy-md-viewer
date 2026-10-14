const assert = require("node:assert/strict");
const path = require("node:path");
const os = require("node:os");
const fs = require("node:fs/promises");
const test = require("node:test");
const { pathToFileURL } = require("node:url");
const { chromium } = require("playwright");

test("Markdown rendering", async (t) => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_EXECUTABLE_PATH || undefined
  });
  try {
    const page = await browser.newPage();
    await page.addScriptTag({ path: path.join(__dirname, "../md.js") });
    const results = await page.evaluate(() => {
      const cases = [
        ["single backticks ignore longer runs", "`a``b`", (root) => root.querySelector("code")?.textContent === "a``b"],
        ["double backticks ignore longer runs", "``a```b``", (root) => root.querySelector("code")?.textContent === "a```b"],
        ["unmatched code runs stay literal", "``unclosed`", (root) => !root.querySelector("code") && root.textContent === "``unclosed`"],
        ["tilde fence info accepts backticks", "~~~js`meta\n<!-- literal -->\n~~~", (root) => root.querySelector("pre code")?.textContent === "<!-- literal -->"],
        ["quoted document markers are hidden", '[//]: # "OPTIONAL:SECTION"\n# Visible', (root) => root.children.length === 1 && root.querySelector("h1")?.textContent === "Visible"],
        [
          "comments inside ordinary code survive",
          "`<!-- literal -->`\n\n```html\n<!-- literal -->\n```",
          (root) => root.querySelectorAll("code").length === 2 && Array.from(root.querySelectorAll("code")).every((code) => code.textContent === "<!-- literal -->")
        ],
        ["comments outside code are hidden", "Before <!-- hidden --> after", (root) => root.textContent === "Before  after"],
        ["blockquote fences preserve HTML comments", "> ~~~html\n> <!-- literal -->\n> ~~~", (root) => root.querySelector("blockquote pre code")?.textContent === "<!-- literal -->"],
        ["deep list fences preserve HTML comments", "- Parent\n  - Child\n\n    ~~~html\n    <!-- literal -->\n    ~~~", (root) => root.querySelector("ul ul pre code")?.textContent === "<!-- literal -->"],
        ["nested blockquotes preserve multiline comments in code", "> > ```html\n> > <!--\n> > literal\n> > -->\n> > ```", (root) => root.querySelector("blockquote blockquote pre code")?.textContent === "<!--\nliteral\n-->"],
        ["list blockquotes preserve fenced comments", "- Item\n\n  > ~~~html\n  > <!-- literal -->\n  > ~~~", (root) => root.querySelector("li blockquote pre code")?.textContent === "<!-- literal -->"],
        ["blockquote lists preserve fenced comments", "> - Parent\n>   - Child\n>\n>     ~~~html\n>     <!-- literal -->\n>     ~~~", (root) => root.querySelector("blockquote ul ul pre code")?.textContent === "<!-- literal -->"],
        ["ordered task lists preserve fenced comments", "1. [x] Item\n\n   ```html\n   <!-- literal -->\n   ```", (root) => root.querySelector("ol .byMDtask pre code")?.textContent === "<!-- literal -->"],
        ["nested fences preserve hidden markers", '> ~~~md\n> [//]: # "literal"\n> ~~~', (root) => root.querySelector("pre code")?.textContent === '[//]: # "literal"'],
        ["nested comments outside code stay hidden", '> Before <!-- hidden --> after\n>\n> [//]: # "hidden"\n>\n> Visible', (root) => root.textContent === "Before  afterVisible"],
        [
          "unterminated nested fences do not expose outside comments",
          "> ~~~html\n> <!-- literal -->\n\n<!-- hidden -->\n# Visible",
          (root) => root.querySelector("pre code")?.textContent === "<!-- literal -->" && root.querySelector("h1")?.textContent === "Visible" && !root.textContent.includes("hidden")
        ],
        ["multiline hidden comments suppress Markdown blocks", "<!--\n> ~~~html\n> hidden\n> ~~~\n- hidden\n-->\n# Visible", (root) => root.children.length === 1 && root.querySelector("h1")?.textContent === "Visible"],
        ["table code preserves pipes", "| Value |\n| --- |\n| `a|b` |", (root) => root.querySelector("td code")?.textContent === "a|b"],
        ["longer runs preserve comments inside code", "`a``<!-- literal -->`", (root) => root.querySelector("code")?.textContent === "a``<!-- literal -->"],
        ["link labels skip brackets inside code", "[`a``]b`](https://example.com)", (root) => root.querySelector("a code")?.textContent === "a``]b"],
        ["table code skips longer runs before pipes", "| Value |\n| --- |\n| `a``|b` |", (root) => root.querySelector("td code")?.textContent === "a``|b" && root.querySelectorAll("td").length === 1],
        ["emphasis skips delimiters inside code", "*`a``*b`*", (root) => root.querySelector("em code")?.textContent === "a``*b"],
        ["nested lists still render", "- Parent\n  - Child", (root) => root.querySelector("ul li ul li")?.textContent === "Child"],
        ["heading anchors stay unique", "# Same\n# Same", (root) => root.querySelectorAll("h1")[0]?.id === "same" && root.querySelectorAll("h1")[1]?.id === "same-1"],
        ["unsafe links stay inert", "[bad](javascript:alert(1))", (root) => !root.querySelector("a")],
        ["disabled options stay disabled", "~~text~~ [link](https://example.com)", (root) => !root.querySelector("del, a"), { withLinks: false, withStrikethrough: false }]
      ];
      return cases.map(([name, markdown, verify, options = {}]) => {
        const root = document.createElement("div");
        byMDviewer(root, markdown, { themeToggle: false, fontSizeControls: false, ...options });
        return { name, passed: verify(root) };
      });
    });
    for (const { name, passed } of results) {
      await t.test(name, () => assert.ok(passed));
    }
    const markdown = await fs.readFile(path.join(__dirname, "../test.md"), "utf8");
    await t.test("benchmark document renders", async () => {
      const heading = await page.evaluate((markdown) => {
        const root = document.createElement("div");
        byMDviewer(root, markdown, { themeToggle: false, fontSizeControls: false });
        return root.querySelector("h1")?.textContent;
      }, markdown);
      assert.equal(heading, "easy MD Viewer BenchMarkDown");
    });
    await t.test("compact downloads use default samples and deferred head assets", async () => {
      const playground = await browser.newPage();
      const errors = [];
      playground.on("pageerror", error => errors.push(error.message));
      await playground.route("**/*", async route => {
        const url = new URL(route.request().url());
        if (url.origin !== "https://viewer.test") return route.abort();
        const file = path.basename(url.pathname);
        const body = await fs.readFile(path.join(__dirname, "..", file));
        await route.fulfill({ body, contentType: file.endsWith(".html") ? "text/html" : file.endsWith(".js") ? "text/javascript" : "text/css" });
      });
      await playground.goto("https://viewer.test/index.html");
      const markdown = '# Downloaded document\n\n**Unicode: á 👋**\n\n</script><script>window.injected=true</script>\n\n`backticks` and ${literal}';
      await playground.locator("#markdown-source").fill(markdown);
      await playground.locator("#withLinks").uncheck();
      await playground.locator("#preview-dark").check();
      await playground.locator("#integration-local").check();
      const code = await playground.locator("#integration-code").inputValue();
      assert.ok(code.includes('document.addEventListener("DOMContentLoaded"'));
      assert.ok(code.includes('"withLinks": false'));
      assert.ok(code.includes('src="md.js" defer'));
      for (const name of ["themeToggle", "fontSizeControls"]) {
        await playground.locator(`#${name}`).evaluate(element => {
          element.checked = false;
          element.dispatchEvent(new Event("change", { bubbles: true }));
        });
      }
      const directory = await fs.mkdtemp(path.join(os.tmpdir(), "viewer-starter-"));
      const exported = await browser.newPage();
      exported.on("pageerror", error => errors.push(error.message));
      await exported.route("https://cdn.jsdelivr.net/**", async route => {
        const file = path.basename(new URL(route.request().url()).pathname).replace(".min.", ".");
        const body = await fs.readFile(path.join(__dirname, "..", file));
        if (file.endsWith(".js")) await new Promise(resolve => setTimeout(resolve, 75));
        await route.fulfill({ body, contentType: file.endsWith(".js") ? "text/javascript" : "text/css" });
      });
      try {
        for (const editedPreset of [false]) {
          if (editedPreset) {
            await playground.locator("#source-preset").selectOption("bigNumbers");
            await playground.locator("#json-source").fill('{"balance":"-900719925474099312349","unit":"edited","extra":42}');
          }
          const [download] = await Promise.all([playground.waitForEvent("download"), playground.locator("#download-html").click()]);
          assert.equal(download.suggestedFilename(), "my-markdown-document.html");
          const file = path.join(directory, download.suggestedFilename());
          await download.saveAs(file);
          const html = await fs.readFile(file, "utf8");
          assert.ok(Buffer.byteLength(html) < 2048, "Starter should stay small");
          await exported.goto(pathToFileURL(file).href);
          await exported.waitForFunction(() => document.getElementById("document").children.length > 0);
          assert.equal(await exported.evaluate(() => window.injected), undefined);
          assert.equal(await exported.evaluate(() => markdown), "# A little Markdown. A real document.\nWrite something useful. Let **easy-md-viewer** handle the rendering.");
          assert.equal(await exported.locator("head script[src][defer]").count(), 1);
          assert.equal(await exported.locator("body script[src], body link[rel='stylesheet']").count(), 0);
          assert.equal(await exported.locator("#byVIEWtheme").getAttribute("href").then(href => href.endsWith("md.light.css")), true);
          const background = await exported.locator("#document").evaluate(element => getComputedStyle(element).backgroundColor);
          await exported.locator(".byVIEWthemeToggle").click();
          await exported.waitForFunction(before => getComputedStyle(document.getElementById("document")).backgroundColor !== before, background);
          const fontSize = await exported.locator("#document").evaluate(element => parseFloat(getComputedStyle(element).fontSize));
          await exported.locator(".byVIEWfontSize").nth(2).click();
          assert.ok(await exported.locator("#document").evaluate((element, before) => parseFloat(getComputedStyle(element).fontSize) > before, fontSize));
        }
      } finally {
        await exported.close();
        await fs.rm(directory, { recursive: true, force: true });
      }
      await playground.route("**/test.md", route => route.fulfill({ status: 503, body: "Unavailable" }));
      await playground.locator("#document-source").selectOption("benchmark");
      await playground.waitForFunction(() => document.getElementById("render-status").textContent === "Source unavailable");
      assert.equal(await playground.locator("#copy-integration").isDisabled(), true);
      assert.equal(await playground.locator("#download-html").isDisabled(), false);
      assert.deepEqual(errors, []);
      await playground.close();
    });
    await t.test("legacy demo loads styles and deferred scripts from the head", async () => {
      const html = await fs.readFile(path.join(__dirname, "..", "index.old.html"), "utf8");
      const structure = await page.evaluate(html => {
        const doc = new DOMParser().parseFromString(html, "text/html");
        return { themes: doc.querySelectorAll("head #byVIEWtheme").length, libraries: doc.querySelectorAll("head script[src][defer]").length, bodyAssets: doc.querySelectorAll("body script[src], body link[rel='stylesheet']").length };
      }, html);
      assert.deepEqual(structure, { themes: 1, libraries: 1, bodyAssets: 0 });
    });
  } finally {
    await browser.close();
  }
});
