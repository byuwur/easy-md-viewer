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
    const readme = await fs.readFile(path.join(__dirname, "../README.md"), "utf8");
    const version = readme.match(/easy-md-viewer@v([^/]+)\//)?.[1];
    assert.ok(version, "README must pin a viewer release");
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
        root.querySelector(".byVIEWtoolbar").remove();
        return { name, passed: verify(root.querySelector(".byMDcontent")) };
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
        const style = getComputedStyle(label);
        const info = {
          version: byMDviewer.VERSION,
          text: label.textContent.replace(/\s+/g, " ").trim(),
          opaque: style.opacity === "1",
          muted: style.color !== getComputedStyle(root).color,
          count: root.querySelectorAll(".byVIEWinfo").length,
          independent: !label.closest(".byVIEWcontrols"),
          controls: root.querySelectorAll(".byVIEWcontrols").length,
          buttons: root.querySelectorAll("button").length,
          links: [...label.querySelectorAll("a")].map((link) => [link.href, link.target, link.rel])
        };
        root.remove();
        return info;
      });
      assert.deepEqual(info, {
        version,
        text: `easy-md-viewer · v${version} · @byUwUr`,
        opaque: true,
        muted: true,
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
    await t.test("themes select their own stylesheet, preserve URLs, and keep other controls independent", async () => {
      const themed = await browser.newPage();
      try {
        await themed.route("https://themes.test/**", async (route) => {
          const file = path.basename(new URL(route.request().url()).pathname);
          const body = file === "other.dark.css" ? "" : await fs.readFile(path.join(__dirname, "..", file));
          await route.fulfill({ body, contentType: "text/css" });
        });
        await themed.setContent(`<!doctype html>
          <link rel="stylesheet" href="https://themes.test/md.css">
          <link id="byVIEWtheme" rel="stylesheet" href="https://themes.test/other.dark.css">
          <link id="viewer-theme" rel="stylesheet" href="https://themes.test/md.light.css/archive/md.light.css?keep=md.light.css#md.light.css">
          <button id="host-control" class="byVIEWthemeToggle">Host control</button>
          <div id="first"></div><div id="second"></div>`);
        await themed.addScriptTag({ path: path.join(__dirname, "../md.js") });
        await themed.evaluate(() => {
          for (const id of ["first", "second"]) byMDviewer(document.getElementById(id), "# Content", { fontSizeControls: false, copyButton: false });
        });
        const palette = () =>
          themed.locator("#first").evaluate((root) => {
            const background = getComputedStyle(root).backgroundColor;
            const toolbar = getComputedStyle(root.querySelector(".byVIEWtoolbar"));
            const credits = getComputedStyle(root.querySelector(".byVIEWinfo"));
            return { matched: toolbar.backgroundColor === background, opaque: !toolbar.backgroundColor.includes("rgba"), color: credits.color, opacity: credits.opacity };
          });
        assert.deepEqual(await palette(), { matched: true, opaque: true, color: "rgb(187, 187, 187)", opacity: "1" });
        const background = await themed.locator("#first").evaluate((root) => getComputedStyle(root).backgroundColor);
        await themed.locator("#first .byVIEWthemeToggle").click();
        await themed.waitForFunction((before) => getComputedStyle(document.getElementById("first")).backgroundColor !== before, background);
        assert.deepEqual(await palette(), { matched: true, opaque: true, color: "rgb(68, 68, 68)", opacity: "1" });
        assert.equal(await themed.locator("#viewer-theme").getAttribute("href"), "https://themes.test/md.light.css/archive/md.dark.css?keep=md.light.css#md.light.css");
        assert.equal(await themed.locator("#byVIEWtheme").getAttribute("href"), "https://themes.test/other.dark.css");
        assert.deepEqual(await themed.locator("#first .byVIEWthemeToggle, #second .byVIEWthemeToggle").evaluateAll((buttons) => buttons.map((button) => [button.textContent, button.title, button.getAttribute("aria-label")])), [
          ["\u263E\uFE0E \u2600\uFE0E", "Switch to light theme", "Switch to light theme"],
          ["\u263E\uFE0E \u2600\uFE0E", "Switch to light theme", "Switch to light theme"]
        ]);
        assert.equal(await themed.locator("#host-control").evaluate((button) => getComputedStyle(button, "::after").content), "none");
        await themed.locator("#viewer-theme").evaluate((link) => link.remove());
        await themed.evaluate(() => byMDviewer(document.getElementById("first"), "# Content", { fontSizeControls: false, copyButton: false }));
        assert.equal(await themed.locator("#first .byVIEWthemeToggle").count(), 0);
      } finally {
        await themed.close();
      }
    });
    await t.test("control sizes and toolbar positions stay responsive through rerenders", async () => {
      const preview = await browser.newPage();
      try {
        await preview.addStyleTag({ path: path.join(__dirname, "../md.css") });
        await preview.addStyleTag({ path: path.join(__dirname, "../md.light.css") });
        await preview.addScriptTag({ path: path.join(__dirname, "../md.js") });
        const results = await preview.evaluate(async () => {
          const theme = document.createElement("link");
          theme.rel = "stylesheet";
          theme.href = "md.light.css";
          document.head.appendChild(theme);
          const root = document.createElement("div");
          document.body.appendChild(root);
          const sizes = {};
          const failures = [];
          for (const width of [200, 320, 360, 640]) {
            root.style.width = `${width}px`;
            for (const controlsSize of ["small", "regular", "large"]) {
              for (const controlsCompact of [false, true]) {
                for (const controlsPosition of ["top", "bottom"]) {
                  byMDviewer(root, "# Sample\n\nA paragraph that stays clear of the toolbar.", { controlsSize, controlsCompact, controlsPosition });
                  const toolbar = root.querySelector(".byVIEWtoolbar");
                  const bounds = toolbar.getBoundingClientRect();
                  const info = root.querySelector(".byVIEWinfo").getBoundingClientRect();
                  const controls = root.querySelector(".byVIEWcontrols").getBoundingClientRect();
                  const first = root.querySelector(".byMDheading").getBoundingClientRect();
                  const last = root.querySelector(".byMDparagraph").getBoundingClientRect();
                  const buttons = [...root.querySelectorAll("button")];
                  const heights = buttons.map((button) => button.getBoundingClientRect().height);
                  const equalHeight = Math.max(...heights) - Math.min(...heights) < 0.1;
                  const toggle = root.querySelector(".byVIEWthemeToggle");
                  const track = toggle.getBoundingClientRect();
                  const themeFits =
                    [...toggle.children].every((icon) => {
                      const rect = icon.getBoundingClientRect();
                      return rect.height > track.height * 0.65 && rect.top >= track.top + 1 && rect.bottom <= track.bottom - 1;
                    }) && parseFloat(getComputedStyle(toggle, "::after").width) > track.height * 0.72;
                  const fits =
                    root.scrollWidth <= root.clientWidth + 1 &&
                    buttons.every((button) => {
                      const rect = button.getBoundingClientRect();
                      return rect.left >= bounds.left - 1 && rect.right <= bounds.right + 1;
                    });
                  const separated = controlsPosition === "top" ? bounds.bottom <= first.top + 1 : bounds.top >= last.bottom - 1;
                  const checkAlignment = width === 640 || (width === 360 && controlsSize === "small" && controlsCompact);
                  const aligned = !checkAlignment || (controlsCompact ? info.top < controls.bottom && info.bottom > controls.top : controlsPosition === "bottom" ? controls.bottom <= info.top : info.bottom <= controls.top);
                  if (!fits || !separated || !aligned || !equalHeight || !themeFits) failures.push({ width, controlsSize, controlsCompact, controlsPosition, fits, separated, aligned, equalHeight, themeFits });
                  sizes[controlsSize] = buttons[1].getBoundingClientRect().width;
                }
              }
            }
          }
          root.style.fontSize = "48px";
          const fixedButtonSize = root.querySelector(".byVIEWfontSize").getBoundingClientRect().width === sizes.large;
          byMDviewer(root, "# Sample\n\nA paragraph that stays clear of the toolbar.", { controlsSize: "small", controlsCompact: true, controlsPosition: "bottom", themeToggle: false, fontSizeControls: false, copyButton: false });
          const hidden = !root.querySelector(".byVIEWcontrols") && root.lastElementChild.classList.contains("byVIEWtoolbar") && root.querySelectorAll(".byVIEWinfo").length === 1;
          byMDviewer(root, "# Sample\n\nA paragraph that stays clear of the toolbar.", { controlsSize: "invalid", controlsPosition: "invalid" });
          const fallback = root.firstElementChild.dataset.size === "regular" && !root.classList.contains("byVIEWbottom");
          byMDviewer(root, "# Sample\n\nA paragraph that stays clear of the toolbar.");
          const reset = !root.classList.contains("byVIEWcompact") && !root.classList.contains("byVIEWbottom") && root.querySelectorAll(".byVIEWtoolbar").length === 1;
          root.style.fontSize = "";
          root.style.width = "640px";
          byMDviewer(root, "# Sample\n\nA paragraph that stays clear of the toolbar.", { controlsSize: "large", controlsCompact: true });
          const toolbar = root.querySelector(".byVIEWtoolbar");
          const wideHeight = toolbar.offsetHeight;
          root.style.width = "200px";
          await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
          const wrapped = toolbar.offsetHeight > wideHeight && toolbar.getBoundingClientRect().bottom <= root.querySelector(".byMDheading").getBoundingClientRect().top;
          root.style.width = "640px";
          await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
          const restored = toolbar.offsetHeight === wideHeight;
          return { failures, sizes, fixedButtonSize, hidden, fallback, reset, wrapped, restored };
        });
        assert.deepEqual(results.failures, []);
        assert.ok(results.sizes.small < results.sizes.regular && results.sizes.regular < results.sizes.large);
        assert.equal(results.fixedButtonSize, true);
        assert.equal(results.hidden, true);
        assert.equal(results.fallback, true);
        assert.equal(results.reset, true);
        assert.equal(results.wrapped, true);
        assert.equal(results.restored, true);
      } finally {
        await preview.close();
      }
    });
    await t.test("bottom controls fill spare container space after resizing and rerendering", async () => {
      const preview = await browser.newPage();
      try {
        await preview.addStyleTag({ path: path.join(__dirname, "../md.css") });
        await preview.addScriptTag({ path: path.join(__dirname, "../md.js") });
        const failures = await preview.evaluate(() => {
          const root = document.createElement("div");
          document.body.appendChild(root);
          const failures = [];
          for (const dimension of ["height", "min-height"]) {
            root.style.cssText = `${dimension}: 320px; overflow: auto;`;
            for (const controlsSize of ["small", "regular", "large"]) {
              for (const controlsCompact of [false, true]) {
                const options = { controlsPosition: "bottom", controlsSize, controlsCompact };
                byMDviewer(root, "A longer paragraph. ".repeat(100), options);
                byMDviewer(root, "# Short content\n\nA paragraph.", options);
                for (const width of [640, 240, 640]) {
                  root.style.width = `${width}px`;
                  const bounds = root.getBoundingClientRect();
                  const toolbar = root.querySelector(".byVIEWtoolbar").getBoundingClientRect();
                  const gap = bounds.bottom - toolbar.bottom;
                  if (Math.abs(gap) > 1 || root.scrollHeight > root.clientHeight + 1) failures.push({ dimension, controlsSize, controlsCompact, width, gap });
                }
              }
            }
          }
          return failures;
        });
        assert.deepEqual(failures, []);
      } finally {
        await preview.close();
      }
    });
    await t.test("controls stay visible while scrolling and bottom credits follow the buttons", async () => {
      const preview = await browser.newPage({ viewport: { width: 640, height: 400 } });
      try {
        await preview.addStyleTag({ path: path.join(__dirname, "../md.css") });
        await preview.addStyleTag({ path: path.join(__dirname, "../md.light.css") });
        await preview.addScriptTag({ path: path.join(__dirname, "../md.js") });
        for (const owner of ["page", "parent", "viewer"]) {
          for (const controlsPosition of ["top", "bottom"]) {
            for (const controlsCompact of [false, true]) {
              await preview.evaluate(
                ({ owner, controlsPosition, controlsCompact }) => {
                  document.body.textContent = "";
                  document.body.style.margin = "0";
                  const host = document.createElement("div");
                  host.id = "scroll-host";
                  host.style.width = "240px";
                  if (owner === "parent") host.style.cssText += "; height: 320px; overflow: auto;";
                  const root = document.createElement("div");
                  root.id = "viewer";
                  if (owner === "viewer") root.style.cssText = "height: 320px; overflow: auto;";
                  host.appendChild(root);
                  document.body.appendChild(host);
                  byMDviewer(root, Array.from({ length: 70 }, (_, index) => `## Section ${index}\n\nA paragraph that makes this viewer scroll.`).join("\n\n"), { controlsPosition, controlsCompact, chunkLatency: 0 });
                  window.scrollOwner = owner === "page" ? document.scrollingElement : owner === "parent" ? host : root;
                },
                { owner, controlsPosition, controlsCompact }
              );
              await preview.waitForFunction(() => document.querySelectorAll("h2").length >= 70);
              for (const fraction of [0, 0.5, 1]) {
                await preview.evaluate((fraction) => {
                  scrollOwner.scrollTop = (scrollOwner.scrollHeight - scrollOwner.clientHeight) * fraction;
                }, fraction);
                const result = await preview.evaluate(
                  async ({ owner, controlsPosition }) => {
                    await new Promise((resolve) => requestAnimationFrame(resolve));
                    const root = document.getElementById("viewer");
                    const toolbar = root.querySelector(".byVIEWtoolbar").getBoundingClientRect();
                    const controls = root.querySelector(".byVIEWcontrols").getBoundingClientRect();
                    const info = root.querySelector(".byVIEWinfo").getBoundingClientRect();
                    const port =
                      owner === "page"
                        ? { top: 0, bottom: innerHeight }
                        : {
                            top: scrollOwner.getBoundingClientRect().top + scrollOwner.clientTop,
                            bottom: scrollOwner.getBoundingClientRect().top + scrollOwner.clientTop + scrollOwner.clientHeight
                          };
                    const sameRow = info.top < controls.bottom && info.bottom > controls.top;
                    const creditsOrdered = controlsPosition !== "bottom" || sameRow || info.top >= controls.bottom - 1;
                    const clickable = [...root.querySelectorAll("button")].every((button) => {
                      const rect = button.getBoundingClientRect();
                      return button.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2));
                    });
                    return { scrollable: scrollOwner.scrollHeight > scrollOwner.clientHeight, visible: toolbar.top >= port.top - 1 && toolbar.bottom <= port.bottom + 1, creditsOrdered, clickable };
                  },
                  { owner, controlsPosition }
                );
                assert.deepEqual(result, { scrollable: true, visible: true, creditsOrdered: true, clickable: true }, `${owner}, ${controlsPosition}, compact=${controlsCompact}, scroll=${fraction}`);
              }
            }
          }
        }
      } finally {
        await preview.close();
      }
    });
    await t.test("narrow viewers keep controls above content within host widths", async () => {
      const layout = await page.evaluate(() => {
        const root = document.createElement("div");
        root.style.width = "240px";
        document.body.appendChild(root);
        try {
          byMDviewer(root, "# A longer heading that wraps without covering the controls");
          const bounds = root.getBoundingClientRect();
          const toolbar = root.querySelector(".byVIEWcontrols").getBoundingClientRect();
          const content = root.querySelector("h1");
          return {
            width: bounds.width,
            overflow: root.scrollWidth > root.clientWidth + 1,
            contained: toolbar.left >= bounds.left && toolbar.right <= bounds.right,
            aboveContent: toolbar.bottom <= content.getBoundingClientRect().top
          };
        } finally {
          root.remove();
        }
      });
      assert.deepEqual(layout, { width: 240, overflow: false, contained: true, aboveContent: true });
    });
    await t.test("text controls follow root size changes, preserve host defaults, and enforce limits", async () => {
      const sizes = await page.evaluate(() => {
        const original = document.documentElement.style.fontSize;
        const root = document.createElement("div");
        document.body.appendChild(root);
        try {
          document.documentElement.style.fontSize = "16px";
          root.style.fontSize = "24px";
          const options = { themeToggle: false, copyButton: false };
          byMDviewer(root, "# Content", options);
          let [decrease, reset, increase] = root.querySelectorAll(".byVIEWfontSize");
          const size = () => parseFloat(getComputedStyle(root).fontSize);
          increase.click();
          const initial = size();
          document.documentElement.style.fontSize = "32px";
          increase.click();
          const resized = size();
          reset.click();
          const restored = size();
          increase.click();
          const next = size();
          byMDviewer(root, "# Content", options);
          [decrease, reset, increase] = root.querySelectorAll(".byVIEWfontSize");
          const rerendered = size();
          for (let index = 0; index < 30; index++) increase.click();
          const maximum = [size(), increase.disabled];
          for (let index = 0; index < 40; index++) decrease.click();
          const minimum = [size(), decrease.disabled];
          reset.click();
          return { initial, resized, restored, next, rerendered, maximum, minimum, reset: size() };
        } finally {
          root.remove();
          document.documentElement.style.fontSize = original;
        }
      });
      assert.deepEqual(sizes, { initial: 26, resized: 56, restored: 24, next: 28, rerendered: 28, maximum: [96, true], minimum: [16, true], reset: 24 });
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
      assert.ok(cdnCode.includes(`easy-md-viewer@v${version}/`));
      const renderer = playground.frameLocator("#preview-frame").locator("#document");
      await renderer.locator(".byVIEWtoolbar").waitFor();
      await playground.locator("#markdown-source").fill(Array.from({ length: 70 }, (_, index) => `## Section ${index}\n\nScrollable preview.`).join("\n\n"));
      await renderer.locator("h2").nth(69).waitFor();
      await playground.locator("#controlsSize-small").evaluate((input) => input.click());
      await playground.locator("#controlsCompact").check();
      await playground.locator("#controlsPosition-bottom").evaluate((input) => input.click());
      assert.deepEqual(await renderer.evaluate((root) => [root.lastElementChild.dataset.size, root.classList.contains("byVIEWcompact"), root.classList.contains("byVIEWbottom")]), ["small", true, true]);
      const selected = JSON.parse(await playground.locator("#options-json").inputValue());
      assert.deepEqual([selected.controlsSize, selected.controlsCompact, selected.controlsPosition], ["small", true, "bottom"]);
      await playground.locator("#controlsCompact").uncheck();
      await playground.locator("#controlsSize-regular").evaluate((input) => input.click());
      for (const compact of [false, true]) {
        await playground.locator("#controlsCompact").evaluate((input, compact) => {
          if (input.checked !== compact) input.click();
        }, compact);
        for (const position of ["bottom", "top"]) {
          await playground.locator(`#controlsPosition-${position}`).evaluate((input) => input.click());
          await renderer.locator("h2").nth(69).waitFor();
          for (const fraction of [0, 0.5, 1]) {
            const visible = await renderer.evaluate(
              async (root, { fraction, position }) => {
                const view = root.ownerDocument.defaultView;
                const scroller = root.ownerDocument.scrollingElement;
                scroller.scrollTop = (scroller.scrollHeight - scroller.clientHeight) * fraction;
                await new Promise((resolve) => view.requestAnimationFrame(resolve));
                const toolbar = root.querySelector(".byVIEWtoolbar");
                const bounds = toolbar.getBoundingClientRect();
                const controls = root.querySelector(".byVIEWcontrols").getBoundingClientRect();
                const credits = root.querySelector(".byVIEWinfo").getBoundingClientRect();
                const button = root.querySelector(".byVIEWcopy");
                const rect = button.getBoundingClientRect();
                return {
                  scrollable: scroller.scrollHeight > scroller.clientHeight,
                  visible: bounds.top >= 0 && bounds.bottom <= view.innerHeight,
                  pinned: Math.abs(position === "top" ? bounds.top : view.innerHeight - bounds.bottom) < 1,
                  creditsOrdered: position !== "bottom" || credits.top >= controls.bottom || (credits.top < controls.bottom && credits.bottom > controls.top),
                  opaque: getComputedStyle(toolbar).backgroundColor === getComputedStyle(root).backgroundColor,
                  clickable: button.contains(root.ownerDocument.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2))
                };
              },
              { fraction, position }
            );
            assert.deepEqual(visible, { scrollable: true, visible: true, pinned: true, creditsOrdered: true, opaque: true, clickable: true }, `Playground iframe: ${position}, compact=${compact}, scroll=${fraction}`);
          }
        }
      }
      await renderer.evaluate((root) => {
        root.ownerDocument.scrollingElement.scrollTop = 0;
      });
      await playground.locator("#reset-options").click();
      assert.equal(await playground.locator("#controlsSize-regular").isChecked(), true);
      assert.equal(await playground.locator("#controlsCompact").isChecked(), false);
      assert.equal(await playground.locator("#controlsPosition-top").isChecked(), true);
      assert.equal(await playground.locator("#integration-code").inputValue(), cdnCode);
      const markdown = "# Downloaded document\n\n**Unicode: á 👋**\n\n</script><script>window.injected=true</script>\n\n`backticks` and ${literal}";
      await playground.locator("#markdown-source").fill(markdown);
      await playground.locator("#withLinks").uncheck();
      await playground.locator("#preview-dark").check();
      assert.equal(await renderer.locator(".byVIEWthemeToggle").textContent(), "\u263E\uFE0E \u2600\uFE0E");
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
