const assert = require("node:assert/strict");
const path = require("node:path");
const os = require("node:os");
const fs = require("node:fs/promises");
const test = require("node:test");
const { pathToFileURL } = require("node:url");
const { chromium } = require("playwright");

// Caller-provided legacy stylesheets reuse the canonical palettes without distribution files.
const legacyThemeCSS = (theme) => {
  const css = require("node:fs").readFileSync(path.join(__dirname, "../md.css"), "utf8");
  const section = css.split(`/* --- ${theme.toUpperCase()} --- */`)[1];
  return `.byMDdocument {${section.match(/\{([\s\S]*?)\}/)[1]}}`;
};

let bootstrapCSS;
const getBootstrapCSS = () =>
  (bootstrapCSS ??= (async () => {
    if (process.env.BOOTSTRAP_CSS_PATH) return require("node:fs/promises").readFile(process.env.BOOTSTRAP_CSS_PATH, "utf8");
    const response = await fetch("https://cdn.jsdelivr.net/gh/byuwur/spa.js@v20.6/css/bootstrap.min.css");
    assert.ok(response.ok, "Unable to load pinned Bootstrap CSS");
    return response.text();
  })());

test("Markdown rendering", async (t) => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_EXECUTABLE_PATH || undefined
  });
  try {
    const page = await browser.newPage();
    await page.addScriptTag({ path: path.join(__dirname, "../md.js") });
    const version = await page.evaluate(() => byMDviewer.VERSION);
    assert.match(version, /^\d+(?:\.\d+)*$/);
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
          opacity: style.opacity,
          relativeSize: parseFloat(style.fontSize) / parseFloat(getComputedStyle(label.parentElement).fontSize),
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
        opacity: "0.25",
        relativeSize: 0.75,
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
          if (/^md\.(light|dark)\.css$/.test(file)) return route.fulfill({ body: legacyThemeCSS(file.includes(".dark.css") ? "dark" : "light"), contentType: "text/css" });
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
        assert.deepEqual(await palette(), { matched: true, opaque: true, color: "rgb(138, 136, 117)", opacity: "0.25" });
        const background = await themed.locator("#first").evaluate((root) => getComputedStyle(root).backgroundColor);
        await themed.locator("#first .byVIEWthemeToggle").click();
        await themed.waitForFunction((before) => getComputedStyle(document.getElementById("first")).backgroundColor !== before, background);
        assert.deepEqual(await palette(), { matched: true, opaque: true, color: "rgb(117, 113, 94)", opacity: "0.25" });
        assert.equal(await themed.locator("#viewer-theme").getAttribute("href"), "https://themes.test/md.light.css/archive/md.dark.css?keep=md.light.css#md.light.css");
        assert.equal(await themed.locator("#byVIEWtheme").getAttribute("href"), "https://themes.test/other.dark.css");
        assert.deepEqual(await themed.locator("#first .byVIEWthemeToggle, #second .byVIEWthemeToggle").evaluateAll((buttons) => buttons.map((button) => [button.textContent, button.title, button.getAttribute("aria-label")])), [
          ["\u263E\uFE0E \u2600\uFE0E", "Switch to light theme", "Switch to light theme"],
          ["\u263E\uFE0E \u2600\uFE0E", "Switch to light theme", "Switch to light theme"]
        ]);
        assert.equal(await themed.locator("#host-control").evaluate((button) => getComputedStyle(button, "::after").content), "none");
        await themed.locator("#viewer-theme").evaluate((link) => link.remove());
        await themed.evaluate(() => byMDviewer(document.getElementById("first"), "# Content", { fontSizeControls: false, copyButton: false }));
        assert.equal(await themed.locator("#first .byVIEWthemeToggle").count(), 1);
      } finally {
        await themed.close();
      }
    });
    await t.test("control sizes and toolbar positions stay responsive across fonts and rerenders", async () => {
      const preview = await browser.newPage();
      try {
        await preview.addStyleTag({ path: path.join(__dirname, "../md.css") });
        await preview.addScriptTag({ path: path.join(__dirname, "../md.js") });
        const results = await preview.evaluate(async () => {
          const root = document.createElement("div");
          document.body.appendChild(root);
          const sizes = {};
          const failures = [];
          for (const [width, fontFamily] of [
            [200, ""],
            [320, ""],
            [360, ""],
            [360, "monospace"],
            [640, "monospace"],
            [640, ""]
          ]) {
            root.style.width = `${width}px`;
            for (const controlsSize of ["small", "regular", "large"]) {
              for (const controlsCompact of [false, true]) {
                for (const controlsPosition of ["top", "bottom"]) {
                  byMDviewer(root, "# Sample\n\nA paragraph that stays clear of the toolbar.", { controlsSize, controlsCompact, controlsPosition });
                  const toolbar = root.querySelector(".byVIEWtoolbar");
                  toolbar.style.fontFamily = fontFamily;
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
                  const sameRow = info.top < controls.bottom && info.bottom > controls.top;
                  const ordered = controlsPosition === "bottom" ? controls.bottom <= info.top : info.bottom <= controls.top;
                  const aligned = controlsCompact && sameRow ? info.right <= controls.left + 1 : ordered;
                  const compactWhenWide = !controlsCompact || width < 640 || sameRow;
                  if (!fits || !separated || !aligned || !compactWhenWide || !equalHeight || !themeFits)
                    failures.push({ width, fontFamily, controlsSize, controlsCompact, controlsPosition, fits, separated, aligned, compactWhenWide, equalHeight, themeFits });
                  sizes[controlsSize] = buttons[1].getBoundingClientRect().width;
                }
              }
            }
          }
          root.style.fontSize = "48px";
          const fixedButtonSize = root.querySelector(".byVIEWfontSize").getBoundingClientRect().width === sizes.large;
          byMDviewer(root, "# Sample\n\nA paragraph that stays clear of the toolbar.", {
            controlsSize: "small",
            controlsCompact: true,
            controlsPosition: "bottom",
            themeToggle: false,
            fontSizeControls: false,
            copyButton: false
          });
          const hidden = !root.querySelector(".byVIEWcontrols") && root.lastElementChild.classList.contains("byVIEWtoolbar") && root.querySelectorAll(".byVIEWinfo").length === 1;
          byMDviewer(root, "# Sample\n\nA paragraph that stays clear of the toolbar.", { controlsSize: "invalid", controlsPosition: "invalid" });
          const fallback = root.firstElementChild.dataset.size === "regular" && !root.classList.contains("byVIEWbottom");
          byMDviewer(root, "# Sample\n\nA paragraph that stays clear of the toolbar.");
          const reset = root.classList.contains("byVIEWcompact") && !root.classList.contains("byVIEWbottom") && root.querySelectorAll(".byVIEWtoolbar").length === 1;
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
                  byMDviewer(root, Array.from({ length: 70 }, (_, index) => `## Section ${index}\n\nA paragraph that makes this viewer scroll.`).join("\n\n"), {
                    controlsPosition,
                    controlsCompact,
                    chunkLatency: 0
                  });
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
        if (route.request().url() === "https://cdn.jsdelivr.net/gh/byuwur/spa.js@v20.6/css/bootstrap.min.css") return route.fulfill({ body: await getBootstrapCSS(), contentType: "text/css" });
        const url = new URL(route.request().url());
        if (url.origin !== "https://viewer.test") return route.abort();
        const file = path.basename(url.pathname);
        if (/^md\.(light|dark)\.css$/.test(file)) return route.fulfill({ body: legacyThemeCSS(file.includes(".dark.css") ? "dark" : "light"), contentType: "text/css" });
        const body = await fs.readFile(path.join(__dirname, "..", file));
        await route.fulfill({ body, contentType: file.endsWith(".html") ? "text/html" : file.endsWith(".js") ? "text/javascript" : "text/css" });
      });
      await playground.goto("https://viewer.test/index.html");
      assert.ok((await playground.locator("#integration-code").inputValue()).includes('href="https://cdn.jsdelivr.net/gh/byuwur/easy-md-viewer@main/md.css"'));
      assert.equal(await playground.locator("#integration-cdn").isChecked(), true);
      await playground.locator('label[for="integration-cdn"]').click();
      const cdnCode = await playground.locator("#integration-code").inputValue();
      assert.ok(cdnCode.includes("easy-md-viewer@main/"));
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
      assert.equal(await playground.locator("#controlsCompact").isChecked(), true);
      assert.equal(await playground.locator("#controlsPosition-top").isChecked(), true);
      assert.equal(await playground.locator("#integration-code").inputValue(), cdnCode);
      const markdown = "# Downloaded document\n\n**Unicode: á 👋**\n\n</script><script>window.injected=true</script>\n\n`backticks` and ${literal}";
      await playground.locator("#markdown-source").fill(markdown);
      await playground.locator("#withLinks").uncheck();
      await playground.locator('label[for="preview-dark"]').click();
      assert.equal(await renderer.locator(".byVIEWthemeToggle").textContent(), "\u263E\uFE0E \u2600\uFE0E");
      assert.equal(await playground.locator("#integration-code").inputValue(), cdnCode);
      await playground.locator('label[for="integration-local"]').click();
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
      await Promise.all(["md.js", "md.css"].map((file) => fs.copyFile(path.join(__dirname, "..", file), path.join(directory, file))));
      const exported = await browser.newPage();
      exported.on("pageerror", (error) => errors.push(error.message));
      await exported.route("https://cdn.jsdelivr.net/**", async (route) => {
        const file = path.basename(new URL(route.request().url()).pathname);
        const body = await fs.readFile(path.join(__dirname, "..", file));
        if (file.endsWith(".js")) await new Promise((resolve) => setTimeout(resolve, 75));
        await route.fulfill({ body, contentType: file.endsWith(".js") ? "text/javascript" : "text/css" });
      });
      try {
        for (const mode of ["cdn", "local"]) {
          await playground.locator("#markdown-source").fill("# Edited document\n\nThis should not change the starter.");
          await playground.locator(`label[for="integration-${mode}"]`).click();
          const displayed = await playground.locator("#integration-code").inputValue();
          assert.equal(displayed, mode === "cdn" ? cdnCode : code);
          await playground.locator("#copy-integration").click();
          assert.equal(await playground.evaluate(() => window.copiedHTML), displayed);
          const [download] = await Promise.all([playground.waitForEvent("download"), playground.locator("#download-html").click()]);
          assert.equal(download.suggestedFilename(), "easy-md-viewer.html");
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
          assert.equal(await exported.locator("#document").getAttribute("data-theme"), "light");
          assert.equal(await exported.locator("#byVIEWtheme").count(), 0);
          assert.equal(await exported.locator('head link[rel="stylesheet"]').count(), 1);
          assert.doesNotMatch(html, /\.(light|dark)\.css|\.min\.(css|js)/);
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
  } finally {
    await browser.close();
  }
});

test("family customization, navigation and monospace controls", async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE_PATH || undefined, channel: process.env.BROWSER_CHANNEL || undefined });
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.addInitScript(() =>
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: {
          writeText: async (text) => {
            window.lastCopy = text;
          }
        }
      })
    );
    await page.route("**/*", async (route) => {
      if (route.request().url() === "https://cdn.jsdelivr.net/gh/byuwur/spa.js@v20.6/css/bootstrap.min.css") return route.fulfill({ body: await getBootstrapCSS(), contentType: "text/css" });
      const url = new URL(route.request().url());
      if (url.origin !== "https://viewer.test") return route.abort();
      const file = path.basename(url.pathname);
      if (/^md\.(light|dark)\.css$/.test(file)) return route.fulfill({ body: legacyThemeCSS(file.includes(".dark.css") ? "dark" : "light"), contentType: "text/css" });
      return route.fulfill({ path: path.join(__dirname, "..", file), contentType: file.endsWith(".html") ? "text/html" : file.endsWith(".js") ? "text/javascript" : "text/css" });
    });
    await page.goto("https://viewer.test/index.html");
    const frame = page.frames().find((candidate) => candidate.parentFrame());
    await frame.waitForSelector(".byVIEWtoolbar");
    assert.equal(await page.locator("#controlsCompact").isChecked(), true);
    assert.equal(JSON.parse(await page.locator("#options-json").inputValue()).controlsCompact, true);
    assert.equal(await frame.locator(".byMDdocument").evaluate((root) => root.classList.contains("byVIEWcompact")), true);
    assert.deepEqual(
      await frame.evaluate(async (source) => {
        const host = document.createElement("div");
        document.body.append(host);
        const states = [];
        let controller;
        try {
          for (const options of [undefined, { controlsCompact: false }, { controlsCompact: true }, undefined]) {
            controller = byMDviewer(host, source, options);
            await controller?.ready;
            states.push(host.classList.contains("byVIEWcompact"));
          }
          controller = byMDviewer(host, source, { themeToggle: false, fontSizeControls: false, copyButton: false });
          await controller?.ready;
          states.push(host.querySelectorAll(".byVIEWinfo").length === 1 && !host.querySelector(".byVIEWcontrols"));
          return states;
        } finally {
          controller?.destroy?.();
          host.remove();
        }
      }, "# Sample"),
      [true, false, true, true, true],
      "Compact defaults, opt-out, rerenders, and disabled controls agree"
    );
    assert.deepEqual(
      await page
        .locator(".form-switch .form-check-input")
        .first()
        .evaluate((element) => {
          const style = getComputedStyle(element);
          return { width: style.width, height: style.height };
        }),
      { width: "44px", height: "24px" }
    );
    assert.equal(
      await page.locator(".form-switch .form-check-input").evaluateAll((inputs) =>
        inputs.every((input) => {
          const toggle = input.getBoundingClientRect();
          const row = input.closest(".form-switch").getBoundingClientRect();
          return Math.abs(toggle.right - row.right) < 1 && Math.abs(toggle.top + toggle.height / 2 - row.top - row.height / 2) < 1;
        })
      ),
      true,
      "Every switch lines up at the right edge and center of its row"
    );
    for (const width of [768, 1280]) {
      await page.setViewportSize({ width, height: 720 });
      assert.equal(
        await page.locator("#controlsSize").evaluate((size) => {
          const a = size.querySelector(".btn-group").getBoundingClientRect();
          const b = document.querySelector("#controlsPosition .btn-group").getBoundingClientRect();
          return Math.abs(a.top - b.top) < 1 && Math.abs(a.width - b.width) < 1 && a.right < b.left;
        }),
        true,
        "Size and position controls share one evenly divided row"
      );
    }
    assert.deepEqual(
      await page
        .locator(".accordion-button")
        .allTextContents()
        .then((labels) => labels.map((label) => label.trim()).slice(0, 3)),
      ["Preview appearance", "Viewer controls", "Rendering"]
    );
    assert.deepEqual(await page.locator("#options-json").evaluate((editor) => Object.keys(JSON.parse(editor.value)).slice(0, 15)), [
      "theme",
      "palette",
      "fontFamily",
      "fontSize",
      "lineHeight",
      "controlsFont",
      "backgroundColor",
      "textColor",
      "customThemeCSS",
      "themeToggle",
      "fontSizeControls",
      "copyButton",
      "controlsCompact",
      "controlsSize",
      "controlsPosition"
    ]);
    assert.equal(await page.locator(".intro h1 + p").textContent(), "Plain JavaScript. No dependencies. Open source. Free. Forever.");
    assert.ok((await page.locator("header .brand-mark").textContent()).trim());

    assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--bs-body-bg").trim()), "#141618");
    assert.equal(await page.evaluate(() => getComputedStyle(document.body).backgroundColor), "rgb(20, 22, 24)");
    assert.equal(
      await page
        .locator(".source-editor")
        .first()
        .evaluate((element) => getComputedStyle(element).backgroundColor),
      "rgb(20, 22, 24)"
    );
    assert.equal(await page.locator('meta[name="theme-color"]').getAttribute("content"), "#141618");
    await page.locator("#site-theme").evaluate((button) => button.click());
    assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--bs-body-bg").trim()), "#fff");
    assert.equal(await page.evaluate(() => getComputedStyle(document.body).backgroundColor), "rgb(255, 255, 255)");
    assert.equal(await page.locator('meta[name="theme-color"]').getAttribute("content"), "#fff");
    const root = frame.locator(".byMDdocument");
    const initial = await root.evaluate((element) => ({ font: element.style.fontFamily, size: element.style.fontSize, bg: element.style.getPropertyValue("--by-md-bg") }));
    assert.match(await frame.locator(".byVIEWtoolbar").evaluate((element) => getComputedStyle(element).fontFamily), /monospace/);
    assert.equal(await page.locator('[aria-label="Viewer suite"] a').count(), 8);
    assert.equal(await page.locator('[aria-label="Viewer suite"]').getByRole("link", { name: "MD", exact: true }).getAttribute("aria-current"), "page");
    assert.equal(await page.locator(".site-footer .fa-heart").count(), 1);
    assert.equal(await page.locator("header .fa-github").count(), 1);
    assert.equal(await page.evaluate(() => Boolean(document.querySelector('[aria-label="Viewer suite"]').compareDocumentPosition(document.querySelector("footer")) & Node.DOCUMENT_POSITION_FOLLOWING)), true);
    await page.locator(".preview-appearance").evaluate((element) => {
      element.open = true;
    });
    await page.evaluate(() => {
      for (const [id, value] of [
        ["preview-font", "Georgia, serif"],
        ["preview-size", "1.5"],
        ["preview-leading", "1.8"],
        ["preview-controls-font", "system-ui, sans-serif"],
        ["preview-bg", "#123456"],
        ["preview-ink", "#fedcba"]
      ]) {
        const input = document.getElementById(id);
        input.value = value;
        input.dispatchEvent(new Event("change", { bubbles: true }));
      }
    });
    assert.deepEqual(
      await root.evaluate((element) => {
        const style = getComputedStyle(element);
        return { font: style.fontFamily, size: style.fontSize, line: style.lineHeight, bg: style.backgroundColor, text: style.color };
      }),
      { font: "Georgia, serif", size: "24px", line: "43.2px", bg: "rgb(18, 52, 86)", text: "rgb(254, 220, 186)" }
    );
    assert.match(await frame.locator(".byVIEWtoolbar").evaluate((element) => getComputedStyle(element).fontFamily), /system-ui/);
    await page.locator("#copy-appearance").evaluate((button) => button.click());
    await page.waitForFunction(() => window.lastCopy?.includes("--by-view-controls-font"));
    assert.match(await page.evaluate(() => lastCopy), /\.byMDdocument/);
    assert.ok((await page.evaluate(() => lastCopy)).includes("--by-md-bg: #123456"));
    await page.locator('[data-options-view="json"]').evaluate((button) => button.click());
    const configuration = JSON.parse(await page.locator("#options-json").inputValue());
    for (const [name, value] of Object.entries({
      theme: "light",
      fontFamily: "Georgia, serif",
      fontSize: 1.5,
      lineHeight: 1.8,
      controlsFont: "system-ui, sans-serif",
      backgroundColor: "#123456",
      textColor: "#fedcba"
    })) {
      assert.deepEqual(configuration[name], value, name);
    }
    assert.ok(!["options", "appearance", "callbacks"].some((key) => key in configuration));
    const readme = require("node:fs").readFileSync(path.join(__dirname, "../README.md"), "utf8");
    for (const match of readme.matchAll(/^\|\s*`([a-zA-Z]+)`\s*\|/gm)) {
      assert.ok(match[1] in configuration, `Missing parameter: ${match[1]}`);
    }
    await page.locator("#copy-options").evaluate((button) => button.click());
    await page.waitForFunction(() => window.lastCopy?.startsWith("{"));
    assert.deepEqual(JSON.parse(await page.evaluate(() => lastCopy)), configuration);
    assert.ok(!Object.keys(configuration).some((key) => key.startsWith("preview")));
    await page.locator('[data-options-view="form"]').evaluate((button) => button.click());
    await page.locator("#reset-options").evaluate((button) => button.click());
    assert.deepEqual(await root.evaluate((element) => ({ font: element.style.fontFamily, size: element.style.fontSize, bg: element.style.getPropertyValue("--by-md-bg") })), initial);
    assert.match(await frame.locator(".byVIEWtoolbar").evaluate((element) => getComputedStyle(element).fontFamily), /monospace/);
    const sourceEditor = page.locator("#markdown-source");
    const fileSource = await sourceEditor.inputValue();
    await page.evaluate(() => {
      window.originalFileText = File.prototype.text;
      File.prototype.text = function () {
        return new Promise((resolve) => {
          window.finishFileRead = resolve;
        });
      };
    });
    try {
      for (const action of ["edit", "restore", "sample"]) {
        await sourceEditor.fill(`${fileSource}\n`);
        await page.locator("#local-file").setInputFiles({ name: "pending.md", mimeType: "text/plain", buffer: Buffer.from(fileSource) });
        if (action === "edit") await sourceEditor.fill(`${fileSource}\n\n`);
        else if (action === "restore") await page.locator("#restore-source").click();
        else await page.locator("#document-source").selectOption("features");
        const expected = await sourceEditor.inputValue();
        await page.evaluate((text) => window.finishFileRead(text), "An obsolete file read");
        await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
        assert.equal(await sourceEditor.inputValue(), expected, "Late file reads preserve the newer source");
      }
    } finally {
      await page.evaluate(() => {
        File.prototype.text = window.originalFileText;
        delete window.finishFileRead;
        delete window.originalFileText;
      });
    }
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});

test("container themes are scoped, independent, and compatible with legacy links", async () => {
  const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || undefined, executablePath: process.env.CHROMIUM_EXECUTABLE_PATH || undefined });
  try {
    const page = await browser.newPage();
    const requests = [];
    page.on("request", (request) => requests.push(request.url()));
    await page.setContent('<div id="outside" class="dark">Host</div><div id="first" data-theme="dark"></div><div id="second" class="light"></div><div id="third"></div>');
    await page.addStyleTag({ path: path.join(__dirname, "../md.css") });
    await page.addScriptTag({ path: path.join(__dirname, "../md.js") });
    await page.evaluate(
      async (args) => {
        window.renderTheme = async (element) => {
          const controller = window.byMDviewer(element, ...args);
          if (controller?.ready) await controller.ready;
        };
        for (const id of ["first", "second", "third"]) await renderTheme(document.getElementById(id));
      },
      ["# Local theme"]
    );
    const color = (id) => page.locator("#" + id).evaluate((element) => getComputedStyle(element).backgroundColor);
    assert.equal(await color("first"), "rgb(39, 40, 34)");
    assert.equal(await color("second"), "rgb(250, 250, 245)");
    assert.equal(await page.locator("#outside").evaluate((element) => getComputedStyle(element).getPropertyValue("--by-view-muted")), "");
    assert.equal(await page.locator("#first .byVIEWtoolbar").evaluate((element) => getComputedStyle(element).getPropertyValue("--by-view-muted").trim()), "#75715e");
    await page.locator("#first .byVIEWthemeToggle").click();
    assert.equal(await page.locator("#first").getAttribute("data-theme"), "light");
    assert.equal(await color("second"), "rgb(250, 250, 245)");
    await page.locator("#second .byVIEWthemeToggle").click();
    assert.equal(
      await page
        .locator("#second")
        .getAttribute("class")
        .then((classes) => classes.split(/\s+/).includes("dark")),
      true
    );
    assert.equal(await page.locator("#second").getAttribute("data-theme"), null);
    assert.equal(await color("second"), "rgb(39, 40, 34)");
    await page.evaluate(async () => {
      const second = document.getElementById("second");
      second.dataset.theme = "light";
      await renderTheme(second);
    });
    assert.equal(await color("second"), "rgb(250, 250, 245)");
    await page.evaluate(() => {
      const first = document.getElementById("first");
      first.style.setProperty("--by-md-bg", "#123456");
    });
    assert.equal(await color("first"), "rgb(18, 52, 86)");
    assert.equal(await color("second"), "rgb(250, 250, 245)");
    await page.evaluate(() => document.getElementById("first").style.removeProperty("--by-md-bg"));
    assert.equal(requests.length, 0, "Container theme changes must not fetch stylesheets");

    await page.route("https://legacy.test/**", (route) => route.fulfill({ body: legacyThemeCSS(route.request().url().includes(".dark.css") ? "dark" : "light"), contentType: "text/css" }));
    await page.evaluate(async () => {
      const second = document.getElementById("second");
      second.removeAttribute("data-theme");
      second.classList.remove("light", "dark");
      await new Promise((resolve, reject) => {
        const link = document.createElement("link");
        link.id = "byVIEWtheme";
        link.rel = "stylesheet";
        link.href = "https://legacy.test/md.light.css?cache=1#theme";
        link.onload = resolve;
        link.onerror = reject;
        document.head.appendChild(link);
      });
      await renderTheme(second);
      await renderTheme(document.getElementById("third"));
    });
    await page.locator("#second .byVIEWthemeToggle").click();
    await page.waitForFunction(() => getComputedStyle(document.getElementById("second")).backgroundColor === "rgb(39, 40, 34)");
    assert.equal(await color("third"), "rgb(39, 40, 34)");
    assert.equal(await color("first"), "rgb(250, 250, 245)");
    assert.equal(await page.locator("#first .byVIEWthemeToggle").getAttribute("aria-label"), "Switch to dark theme");
    assert.equal(await page.locator("#byVIEWtheme").getAttribute("href"), "https://legacy.test/md.dark.css?cache=1#theme");
    await page.evaluate(async () => {
      document.getElementById("byVIEWtheme").remove();
      await renderTheme(document.getElementById("second"));
    });
    await page.locator("#second .byVIEWthemeToggle").click();
    assert.equal(await page.locator("#second").getAttribute("data-theme"), "dark");
    assert.equal(await color("third"), "rgb(250, 250, 245)");
  } finally {
    await browser.close();
  }
});

test("named palettes retain mode, isolate custom CSS, and meet High Contrast targets", async () => {
  const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || undefined, executablePath: process.env.CHROMIUM_EXECUTABLE_PATH || undefined });
  try {
    const page = await browser.newPage();
    await page.setContent('<div id="outside">Host</div><div id="viewer"></div><div id="other" data-theme="dark"></div>');
    await page.addStyleTag({ path: path.join(__dirname, "../md.css") });
    await page.addScriptTag({ path: path.join(__dirname, "../md.js") });
    await page.evaluate(
      async (args) => {
        window.renderPalette = async (id) => {
          const controller = window.byMDviewer(document.getElementById(id), ...args);
          if (controller?.ready) await controller.ready;
        };
        await renderPalette("viewer");
        await renderPalette("other");
      },
      ["# Theme\n\n[Link](https://example.com)\n\n`code`"]
    );
    const root = page.locator("#viewer");
    const background = () => root.evaluate((element) => getComputedStyle(element).backgroundColor);
    assert.equal(await background(), "rgb(250, 250, 245)", "Default remains Monokai Light");
    for (const [palette, colors] of Object.entries({
      monokai: ["rgb(250, 250, 245)", "rgb(39, 40, 34)"],
      github: ["rgb(255, 255, 255)", "rgb(13, 17, 23)"],
      solarized: ["rgb(253, 246, 227)", "rgb(0, 43, 54)"],
      "high-contrast": ["rgb(255, 255, 255)", "rgb(0, 0, 0)"]
    })) {
      await root.evaluate((element, palette) => {
        element.dataset.theme = palette;
        element.classList.remove("light", "dark");
      }, palette);
      assert.equal(await background(), colors[0], palette);
      await root.locator(".byVIEWthemeToggle").click();
      assert.equal(await root.getAttribute("data-theme"), palette);
      assert.equal(await background(), colors[1], palette);
      await page.evaluate(() => renderPalette("viewer"));
      assert.equal(await background(), colors[1], "Rendering preserves the palette and mode");
      await root.locator(".byVIEWthemeToggle").click();
      assert.equal(await background(), colors[0]);
    }
    for (const mode of ["light", "dark"]) {
      await root.evaluate((element, mode) => {
        element.classList.toggle("dark", mode === "dark");
        element.classList.toggle("light", mode === "light");
      }, mode);
      await root.locator(".byVIEWcopy").focus();
      const measurements = await root.evaluate((element) => {
        const style = getComputedStyle(element);
        const luminance = (color) => {
          const channels = color.startsWith("#")
            ? color
                .slice(1)
                .match(/../g)
                .map((part) => parseInt(part, 16))
            : color
                .match(/[\d.]+/g)
                .slice(0, 3)
                .map(Number);
          const values = channels.map((channel) => channel / 255).map((value) => (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4));
          return values[0] * 0.2126 + values[1] * 0.7152 + values[2] * 0.0722;
        };
        const contrast = (a, b) => (Math.max(luminance(a), luminance(b)) + 0.05) / (Math.min(luminance(a), luminance(b)) + 0.05);
        const variables = [...style].filter((property) => property.startsWith("--by-")).map((property) => [property, style.getPropertyValue(property).trim()]);
        const backgrounds = [style.backgroundColor, ...variables.filter(([property]) => /-(?:alt|code-bg|add|remove)$/.test(property)).map(([, value]) => value)];
        const text = variables.filter(([property, value]) => /^#[0-9a-f]{6}$/i.test(value) && !/-(?:bg|border|alt|add|remove)$/.test(property));
        const button = getComputedStyle(element.querySelector(".byVIEWcopy"));
        return {
          text: text.flatMap(([property, value]) => backgrounds.map((bg) => ({ property, ratio: contrast(value, bg) }))),
          border: contrast(button.borderTopColor, style.backgroundColor),
          focus: contrast(button.outlineColor, style.backgroundColor),
          outline: parseFloat(button.outlineWidth)
        };
      });
      assert.ok(measurements.text.length >= 5);
      for (const { property, ratio } of measurements.text) assert.ok(ratio >= 7, mode + " " + property + ": " + ratio.toFixed(2));
      assert.ok(measurements.border >= 3);
      assert.ok(measurements.focus >= 3 && measurements.outline >= 2);
    }
    await root.evaluate((element) => {
      element.classList.add("light", "dark");
      element.dataset.theme = "github";
    });
    assert.equal(await background(), "rgb(13, 17, 23)", "Dark wins when both classes exist");
    await root.evaluate((element) => {
      element.dataset.theme = "light";
    });
    assert.equal(await background(), "rgb(250, 250, 245)", "Legacy mode aliases override classes");
    await page.addStyleTag({ content: '.byMDdocument.light[data-theme="ocean"] { --by-md-bg: #f3f8fc; } .byMDdocument.dark[data-theme="ocean"] { --by-md-bg: #102a43; }' });
    await root.evaluate((element) => {
      element.dataset.theme = "ocean";
      element.classList.remove("light", "dark");
    });
    await page.route("https://legacy.test/**", (route) => route.fulfill({ body: "", contentType: "text/css" }));
    await page.evaluate(
      () =>
        new Promise((resolve) => {
          const link = document.createElement("link");
          link.id = "byVIEWtheme";
          link.rel = "stylesheet";
          link.href = "https://legacy.test/md.dark.css?cache=1#theme";
          link.onload = resolve;
          document.head.appendChild(link);
        })
    );
    await page.evaluate(() => renderPalette("viewer"));
    assert.equal(await background(), "rgb(250, 250, 245)", "An unclassified custom palette starts in Light");
    await root.locator(".byVIEWthemeToggle").click();
    assert.equal(await background(), "rgb(16, 42, 67)");
    assert.equal(await root.getAttribute("data-theme"), "ocean");
    assert.equal(await page.locator("#byVIEWtheme").getAttribute("href"), "https://legacy.test/md.dark.css?cache=1#theme");
    assert.equal(await page.locator("#other").evaluate((element) => getComputedStyle(element).backgroundColor), "rgb(39, 40, 34)");
    assert.equal(await page.locator("#outside").evaluate((element) => getComputedStyle(element).getPropertyValue("--by-view-muted")), "");
  } finally {
    await browser.close();
  }
});

test("playground palettes and editable two-mode custom themes stay synchronized", async () => {
  const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || undefined, executablePath: process.env.CHROMIUM_EXECUTABLE_PATH || undefined });
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.addInitScript(() =>
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: {
          writeText: async (text) => {
            window.lastCopy = text;
          }
        }
      })
    );
    await page.route("**/*", async (route) => {
      const url = new URL(route.request().url());
      if (url.href === "https://cdn.jsdelivr.net/gh/byuwur/spa.js@v20.6/css/bootstrap.min.css") return route.fulfill({ body: await getBootstrapCSS(), contentType: "text/css" });
      if (url.origin !== "https://viewer.test") return route.abort();
      const file = path.basename(url.pathname);
      return route.fulfill({ path: path.join(__dirname, "..", file), contentType: file.endsWith(".html") ? "text/html" : file.endsWith(".js") ? "text/javascript" : "text/css" });
    });
    await page.goto("https://viewer.test/index.html");
    const frame = page.frames().find((candidate) => candidate.parentFrame());
    await frame.waitForSelector(".byVIEWtoolbar");
    const root = frame.locator(".byMDdocument");
    const editor = page.locator("#custom-theme-css");
    const palette = page.locator("#preview-palette");
    const background = () => root.evaluate((element) => getComputedStyle(element).backgroundColor);
    const initialBackground = await background();
    const hostBackground = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    assert.equal(await palette.inputValue(), "monokai");
    await page.waitForFunction(() => document.getElementById("custom-theme-css").value.includes('.dark[data-theme="custom"]'));
    const defaults = await editor.inputValue();
    assert.ok(defaults.includes('.byMDdocument.light[data-theme="custom"]'));
    await palette.selectOption("github");
    const setMode = (mode) =>
      page.evaluate((mode) => {
        const input = document.querySelector('#preview-theme, input[name="viewerTheme"][value="' + mode + '"], input[name="previewTheme"][value="' + mode + '"]');
        if (input.tagName === "SELECT") input.value = mode;
        else input.checked = true;
        input.dispatchEvent(new Event("change", { bubbles: true }));
      }, mode);
    await setMode("dark");
    assert.equal(await background(), "rgb(13, 17, 23)");
    await root.locator(".byVIEWthemeToggle").click();
    await page.waitForFunction(() => JSON.parse(document.getElementById("options-json").value).theme === "light");
    assert.equal(await palette.inputValue(), "github");
    assert.equal(await background(), "rgb(255, 255, 255)");
    for (const name of ["solarized", "high-contrast"]) {
      await palette.selectOption(name);
      assert.equal(await root.getAttribute("data-theme"), name);
      assert.ok((await editor.inputValue()).includes("--by-md-bg"));
      await setMode("dark");
      assert.equal(await background(), name === "solarized" ? "rgb(0, 43, 54)" : "rgb(0, 0, 0)");
    }
    await page.locator(".preview-appearance").evaluate((element) => {
      element.open = true;
    });
    const custom = '.byMDdocument.light[data-theme="custom"] { --by-md-bg: #f3f8fc; }\n.byMDdocument.dark[data-theme="custom"] { --by-md-bg: #102a43; }';
    await editor.fill(custom);
    await page.waitForFunction(() => document.getElementById("preview-palette").value === "custom");
    assert.equal(await background(), "rgb(16, 42, 67)");
    await setMode("light");
    assert.equal(await background(), "rgb(243, 248, 252)");
    await root.locator(".byVIEWthemeToggle").click();
    assert.equal(await root.getAttribute("data-theme"), "custom");
    assert.equal(await background(), "rgb(16, 42, 67)");
    await page.locator("#copy-theme").evaluate((button) => button.click());
    await page.waitForFunction(() => window.lastCopy?.includes('[data-theme="custom"]'));
    assert.equal(await page.evaluate(() => lastCopy), custom);
    const config = JSON.parse(await page.locator("#options-json").inputValue());
    assert.equal(config.theme, "dark");
    assert.equal(config.palette, "custom");
    assert.equal(config.customThemeCSS, custom);
    assert.ok(!("appearance" in config) && !("options" in config));
    await palette.selectOption("github");
    assert.equal(await background(), "rgb(13, 17, 23)");
    await palette.selectOption("custom");
    assert.equal(await editor.inputValue(), custom, "Preset changes retain the draft");
    assert.equal(await background(), "rgb(16, 42, 67)");
    await page.locator("#reset-settings, #reset-options").evaluate((button) => button.click());
    await page.waitForFunction(() => document.getElementById("preview-palette").value === "monokai");
    assert.equal(await editor.inputValue(), defaults);
    assert.equal(await background(), initialBackground);
    assert.equal(await page.evaluate(() => getComputedStyle(document.body).backgroundColor), hostBackground);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});
