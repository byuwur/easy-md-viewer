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
    await t.test("duplicate imports preserve the installed renderer", async () => {
      await page.evaluate(() => {
        window.installedRenderer = byMDviewer;
      });
      await page.addScriptTag({ path: path.join(__dirname, "../md.js") });
      assert.equal(await page.evaluate(() => byMDviewer === installedRenderer), true);
    });
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
        byMDviewer(root, markdown, { themeToggle: false, fontSizeControls: false, copyButton: false, ...options });
        root.querySelector(".byVIEWinfo").remove();
        return { name, passed: verify(root) };
      });
    });
    for (const { name, passed } of results) {
      await t.test(name, () => assert.ok(passed));
    }
    await t.test("versioned attribution survives rerender with optional controls disabled", async () => {
      await page.addStyleTag({ path: path.join(__dirname, "../md.css") });
      const info = await page.evaluate(() => {
        const root = document.createElement("div");
        document.body.appendChild(root);
        const options = { themeToggle: false, fontSizeControls: false, copyButton: false, withLinks: false };
        byMDviewer(root, "# Before", options);
        byMDviewer(root, "# After", options);
        const label = root.querySelector(".byVIEWinfo");
        const opacity = Number(getComputedStyle(label).opacity);
        const info = {
          version: byMDviewer.VERSION,
          text: label.textContent.replace(/\s+/g, " ").trim(),
          semiTransparent: opacity > 0 && opacity < 1,
          count: root.querySelectorAll(".byVIEWinfo").length,
          independent: label.parentElement === root,
          controls: root.querySelectorAll(".byVIEWcontrols").length,
          buttons: root.querySelectorAll("button").length,
          links: [...label.querySelectorAll("a")].map((link) => [link.href, link.target, link.rel])
        };
        root.remove();
        return info;
      });
      assert.deepEqual(info, {
        version: "1.6",
        text: "easy-md-viewer · v1.6 · @byUwUr",
        semiTransparent: true,
        count: 1,
        independent: true,
        controls: 0,
        buttons: 0,
        links: [
          ["https://github.com/byuwur/easy-md-viewer", "_blank", "noopener noreferrer"],
          ["https://byuwur.co/", "_blank", "noopener noreferrer"]
        ]
      });
    });
    const markdown = await fs.readFile(path.join(__dirname, "../test.md"), "utf8");
    await t.test("benchmark document renders", async () => {
      const heading = await page.evaluate((markdown) => {
        const root = document.createElement("div");
        byMDviewer(root, markdown, { themeToggle: false, fontSizeControls: false });
        return root.querySelector("h1")?.textContent;
      }, markdown);
      assert.equal(heading, "easy MD Viewer BenchMarkDown");
    });
    await t.test("copy supports plain text and original Markdown, including clipboard access failures", async () => {
      const result = await page.evaluate(async () => {
        const root = document.createElement("div");
        document.body.appendChild(root);
        const copies = [];
        let native = true;
        Object.defineProperty(navigator, "clipboard", {
          configurable: true,
          value: {
            writeText: async (text) => {
              if (!native) throw new Error("Denied");
              copies.push(text);
            }
          }
        });
        const clipboard = navigator.clipboard;
        const copy = async (shiftKey = false) => {
          const button = root.querySelector(".byVIEWcopy");
          button.dispatchEvent(new MouseEvent("click", { bubbles: true, shiftKey }));
          await new Promise((resolve) => setTimeout(resolve, 0));
          return button.title;
        };
        try {
          const source = document.createElement("div");
          source.textContent = "# Title\n\nA **bold** [link](https://example.com) &amp; \u0060code\u0060.\n\n~~~text\n<literal>\n\nline\n~~~";
          byMDviewer(root, source);
          const last = [...root.querySelectorAll(".byVIEWcontrols button")].at(-1).classList.contains("byVIEWcopy");
          await copy();
          const plain = copies[0];
          const button = root.querySelector(".byVIEWcopy");
          const copied = button.textContent === "Copied!";
          button.dispatchEvent(new MouseEvent("mouseleave"));
          const reset = button.textContent === "Copy" && button.title === "Copy text (Shift+click for Markdown)";
          await copy(true);
          const original = copies[1] === source.textContent;
          const clones = document.querySelectorAll(".byMDdocument").length;
          root.textContent = "# Latest";
          byMDviewer(root, undefined, { themeToggle: false, fontSizeControls: false });
          await copy(true);
          const current = copies[2];
          const currentButton = root.querySelector(".byVIEWcopy");
          currentButton.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
          const blur = currentButton.textContent === "Copy" && currentButton.getAttribute("aria-label") === currentButton.title;
          native = false;
          const copyCount = copies.length;
          const failed = (await copy()).startsWith("Copy failed.") && root.querySelector(".byVIEWcopy").textContent === "Failed" && !root.querySelector(".byVIEWcopy").disabled && copies.length === copyCount;
          Object.defineProperty(navigator, "clipboard", { configurable: true, value: undefined });
          const unavailable = (await copy()).startsWith("Copy failed.") && !root.querySelector(".byVIEWcopy").disabled;
          Object.defineProperty(navigator, "clipboard", { configurable: true, value: clipboard });
          native = true;
          const retried = (await copy()).startsWith("Copied!");
          byMDviewer(root, "", { themeToggle: false, fontSizeControls: false, copyButton: false });
          const hidden = !root.querySelector(".byVIEWcontrols");
          return { plain, original, clones, last, current, copied, reset, blur, failed, unavailable, retried, hidden };
        } finally {
          root.remove();
        }
      });
      const { plain, ...state } = result;
      assert.equal(plain.replace(/\n+/g, "\n"), "Title\nA bold link & code.\n<literal>\nline");
      assert.ok(plain.includes("<literal>\n\nline"), "Code line breaks must survive copying");
      assert.deepEqual(state, { original: true, clones: 1, last: true, current: "# Latest", copied: true, reset: true, blur: true, failed: true, unavailable: true, retried: true, hidden: true });
    });
    await t.test("displayed, copied, and downloaded starters match with CDN or local assets", async () => {
      const playground = await browser.newPage();
      const errors = [];
      playground.on("pageerror", (error) => errors.push(error.message));
      await playground.addInitScript(() => {
        Object.defineProperty(navigator, "clipboard", {
          value: {
            writeText: async (text) => {
              window.copiedHTML = text;
            }
          }
        });
      });
      await playground.route("**/*", async (route) => {
        const url = new URL(route.request().url());
        if (url.origin !== "https://viewer.test") return route.abort();
        const file = path.basename(url.pathname);
        const body = await fs.readFile(path.join(__dirname, "..", file));
        await route.fulfill({ body, contentType: file.endsWith(".html") ? "text/html" : file.endsWith(".js") ? "text/javascript" : "text/css" });
      });
      await playground.goto("https://viewer.test/index.html");
      const cdnCode = await playground.locator("#integration-code").inputValue();
      const markdown = "# Downloaded document\n\n**Unicode: á 👋**\n\n</script><script>window.injected=true</script>\n\n`backticks` and ${literal}";
      await playground.locator("#markdown-source").fill(markdown);
      await playground.locator("#withLinks").uncheck();
      await playground.locator("#preview-dark").check();
      assert.equal(await playground.locator("#integration-code").inputValue(), cdnCode);
      await playground.locator("#integration-local").check();
      const code = await playground.locator("#integration-code").inputValue();
      assert.ok(code.includes('document.addEventListener("DOMContentLoaded"'));
      assert.ok(!code.includes('"withLinks": false'));
      assert.ok(code.includes('src="md.js" defer'));
      for (const name of ["themeToggle", "fontSizeControls", "copyButton"]) {
        await playground.locator(`#${name}`).evaluate((element) => {
          element.checked = false;
          element.dispatchEvent(new Event("change", { bubbles: true }));
        });
      }
      const directory = await fs.mkdtemp(path.join(os.tmpdir(), "viewer-starter-"));
      await Promise.all(["md.js", "md.css", "md.light.css", "md.dark.css"].map((file) => fs.copyFile(path.join(__dirname, "..", file), path.join(directory, file))));
      const exported = await browser.newPage();
      exported.on("pageerror", (error) => errors.push(error.message));
      await exported.route("https://cdn.jsdelivr.net/**", async (route) => {
        const file = path.basename(new URL(route.request().url()).pathname).replace(".min.", ".");
        const body = await fs.readFile(path.join(__dirname, "..", file));
        if (file.endsWith(".js")) await new Promise((resolve) => setTimeout(resolve, 75));
        await route.fulfill({ body, contentType: file.endsWith(".js") ? "text/javascript" : "text/css" });
      });
      try {
        for (const mode of ["cdn", "local"]) {
          await playground.locator("#markdown-source").fill("# Edited document\n\nThis should not change the starter.");
          await playground.locator(`#integration-${mode}`).check();
          const displayed = await playground.locator("#integration-code").inputValue();
          assert.equal(displayed, mode === "cdn" ? cdnCode : code);
          await playground.locator("#copy-integration").click();
          assert.equal(await playground.evaluate(() => window.copiedHTML), displayed);
          const [download] = await Promise.all([playground.waitForEvent("download"), playground.locator("#download-html").click()]);
          assert.equal(download.suggestedFilename(), "my-markdown-document.html");
          const file = path.join(directory, download.suggestedFilename());
          await download.saveAs(file);
          const html = await fs.readFile(file, "utf8");
          assert.equal(html, displayed);
          assert.ok(Buffer.byteLength(html) < 2048, "Starter should stay small");
          await exported.goto(pathToFileURL(file).href);
          await exported.waitForFunction(() => document.getElementById("document").children.length > 0);
          assert.equal(await exported.evaluate(() => window.injected), undefined);
          assert.equal(await exported.locator("#document h1").textContent(), "A little Markdown. A real document.");
          assert.equal(await exported.locator("#document p").textContent(), "Write something useful. Let easy-md-viewer handle the rendering.");
          assert.equal(await exported.locator("#document p strong").textContent(), "easy-md-viewer");
          assert.equal(await exported.locator("head script[src][defer]").count(), 1);
          assert.equal(await exported.locator("body script[src], body link[rel='stylesheet']").count(), 0);
          assert.equal(
            await exported
              .locator("#byVIEWtheme")
              .getAttribute("href")
              .then((href) => href.endsWith("md.light.css")),
            true
          );
          const background = await exported.locator("#document").evaluate((element) => getComputedStyle(element).backgroundColor);
          await exported.locator(".byVIEWthemeToggle").click();
          await exported.waitForFunction((before) => getComputedStyle(document.getElementById("document")).backgroundColor !== before, background);
          const fontSize = await exported.locator("#document").evaluate((element) => parseFloat(getComputedStyle(element).fontSize));
          await exported.locator(".byVIEWfontSize").nth(2).click();
          assert.ok(await exported.locator("#document").evaluate((element, before) => parseFloat(getComputedStyle(element).fontSize) > before, fontSize));
        }
      } finally {
        await exported.close();
        await fs.rm(directory, { recursive: true, force: true });
      }
      await playground.route("**/test.md", (route) => route.fulfill({ status: 503, body: "Unavailable" }));
      await playground.locator("#document-source").selectOption("benchmark");
      await playground.waitForFunction(() => document.getElementById("render-status").textContent === "Source unavailable");
      assert.equal(await playground.locator("#copy-integration").isDisabled(), false);
      assert.equal(await playground.locator("#download-html").isDisabled(), false);
      assert.equal(await playground.locator("#integration-code").inputValue(), code);
      await playground.locator("#copy-integration").click();
      assert.equal(await playground.evaluate(() => window.copiedHTML), code);
      assert.deepEqual(errors, []);
      await playground.close();
    });
    await t.test("legacy demo loads styles and deferred scripts from the head", async () => {
      const html = await fs.readFile(path.join(__dirname, "..", "index.old.html"), "utf8");
      const structure = await page.evaluate((html) => {
        const doc = new DOMParser().parseFromString(html, "text/html");
        return { themes: doc.querySelectorAll("head #byVIEWtheme").length, libraries: doc.querySelectorAll("head script[src][defer]").length, bodyAssets: doc.querySelectorAll("body script[src], body link[rel='stylesheet']").length };
      }, html);
      assert.deepEqual(structure, { themes: 1, libraries: 1, bodyAssets: 0 });
    });
  } finally {
    await browser.close();
  }
});
