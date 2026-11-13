/*
 * File: __tests__/playground.cjs
 * Desc: MD playground configuration, previews, and exports; library checks live in rendering.cjs.
 */

// --- DEPENDENCIES ---
const assert = require("node:assert/strict");
const path = require("node:path");
const os = require("node:os");
const fs = require("node:fs/promises");
const test = require("node:test");
const { pathToFileURL } = require("node:url");
const { chromium, firefox, webkit } = require("playwright");
const browserEngine = process.env.BROWSER_ENGINE || "chromium";
assert.ok(["chromium", "firefox", "webkit"].includes(browserEngine), "Unsupported BROWSER_ENGINE");
const browserType = { chromium, firefox, webkit }[browserEngine];
// Browser channels and executable overrides apply only to Chromium.
const launchBrowser = () =>
  browserType.launch(
    browserEngine === "chromium"
      ? {
          channel: process.env.BROWSER_CHANNEL || undefined,
          executablePath: process.env.CHROMIUM_EXECUTABLE_PATH || undefined
        }
      : {}
  );
// Match the published companion pin, independently of newer sibling source.
const codeCDNBase = require("node:fs")
  .readFileSync(path.join(__dirname, "../index.html"), "utf8")
  .match(/https:\/\/cdn\.jsdelivr\.net\/gh\/byuwur\/easy-code-viewer@v[\d.]+\//)[0];

// Read the displayed source without line numbers or status text.
const readStarter = async (page) => {
  await page.locator('#integration-code[aria-busy="false"]').waitFor();
  return (await page.locator("#integration-code .byCODEtext").allTextContents()).join("\n");
};

// --- THEME FIXTURES ---
// Caller-provided legacy stylesheets reuse the canonical palettes without distribution files.
const legacyThemeCSS = (theme) => {
  const css = require("node:fs").readFileSync(path.join(__dirname, "../md.css"), "utf8");
  const section = css.split(`/* --- ${theme.toUpperCase()} --- */`)[1];
  return `.byMDdocument {${section.match(/\{([\s\S]*?)\}/)[1]}}`;
};

// --- PLAYGROUND ASSETS ---
let bootstrapCSS;
// Use the playground's pinned stylesheet so responsive checks exercise its real layout.
const getBootstrapCSS = () =>
  (bootstrapCSS ??= (async () => {
    if (process.env.BOOTSTRAP_CSS_PATH) return require("node:fs/promises").readFile(process.env.BOOTSTRAP_CSS_PATH, "utf8");
    const response = await fetch("https://cdn.jsdelivr.net/gh/byuwur/spa.js@v20.7/css/bootstrap.min.css");
    assert.ok(response.ok, "Unable to load pinned Bootstrap CSS");
    return response.text();
  })());

const codeAssets = new Map();
const getCodeAsset = (url) => {
  if (!codeAssets.has(url))
    codeAssets.set(
      url,
      (async () => {
        const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
        assert.ok(response.ok, "Unable to load pinned CODE asset");
        return { body: await response.text(), contentType: url.endsWith(".js") ? "text/javascript" : "text/css" };
      })()
    );
  return codeAssets.get(url);
};

// --- PLAYGROUND AND STARTER EXPORTS ---
test("displayed, copied, and downloaded starters match with CDN or local assets", async () => {
  const browser = await launchBrowser();
  try {
    const playground = await browser.newPage();
    const errors = [];
    playground.on("pageerror", (error) => errors.push(error.message));
    // Capture clipboard writes without depending on OS clipboard permissions.
    await playground.addInitScript(() => {
      Object.defineProperty(navigator, "clipboard", {
        value: {
          writeText: async (text) => {
            window.copiedHTML = text;
          }
        }
      });
    });
    // Keep the pinned CODE companion real while serving this viewer from local authored assets.
    await playground.route("**/*", async (route) => {
      if (route.request().url() === "https://cdn.jsdelivr.net/gh/byuwur/spa.js@v20.7/css/bootstrap.min.css") return route.fulfill({ body: await getBootstrapCSS(), contentType: "text/css" });
      const url = new URL(route.request().url());
      if ([`${codeCDNBase}code.min.css`, `${codeCDNBase}code.min.js`].includes(url.href)) {
        return route.fulfill(await getCodeAsset(url.href));
      }
      if (url.origin !== "https://viewer.test") return route.abort();
      const file = path.basename(url.pathname).replace(/\.min(?=\.(?:css|js)$)/, "");
      if (/^md\.(light|dark)\.css$/.test(file)) return route.fulfill({ body: legacyThemeCSS(file.includes(".dark.css") ? "dark" : "light"), contentType: "text/css" });
      const body = await fs.readFile(path.join(__dirname, "..", file));
      await route.fulfill({ body, contentType: file.endsWith(".html") ? "text/html" : file.endsWith(".js") ? "text/javascript" : "text/css" });
    });
    await playground.goto("https://viewer.test/index.html");
    assert.equal(await playground.locator(".playground-toolbar #open-file").count(), 1);
    assert.equal(await playground.locator("#source-panel #render-source").count(), 1);
    assert.equal(await playground.locator("#rerun-benchmark, #playground > .discovery").count(), 0);
    const release = await playground
      .frameLocator("#preview-frame")
      .locator(".byVIEWtoolbar")
      .evaluate(() => byMDviewer.VERSION);
    assert.ok((await playground.frameLocator("#preview-frame").locator(".byVIEWinfo").textContent()).includes(` v${release} `), "Credits must match the runtime release");
    const cdnBase = "https://cdn.jsdelivr.net/gh/byuwur/easy-md-viewer@latest/";
    const starterViewer = playground.locator("#integration-code.byCODEdocument");
    assert.equal(await playground.evaluate(() => byCODEviewer.VERSION), "1.7");
    assert.equal(await starterViewer.getAttribute("data-theme"), "dark");
    await starterViewer.locator(".byCODEtext").first().waitFor();
    assert.ok((await starterViewer.locator(".byCODElineNumber").count()) > 0);
    assert.equal(await starterViewer.locator(".byVIEWtoolbar, button, input, select").count(), 0);
    assert.equal(await starterViewer.locator(".byVIEWstatus:visible").count(), 0);
    assert.deepEqual(await starterViewer.evaluate((element) => [element, element.querySelector(".byVIEWpanel"), element.querySelector(".byCODElineNumber")].map((node) => getComputedStyle(node).backgroundColor)), [
      "rgba(0, 0, 0, 0)",
      "rgba(0, 0, 0, 0)",
      "rgba(0, 0, 0, 0)"
    ]);
    assert.ok((await starterViewer.locator(".byCODEtag").count()) > 0);
    assert.equal(await playground.locator("#integration-code script").count(), 0);
    const starterTagColor = await starterViewer
      .locator(".byCODEtag")
      .first()
      .evaluate((token) => getComputedStyle(token).color);
    await playground.locator("#site-theme").click();
    assert.equal(await starterViewer.getAttribute("data-theme"), "light");
    assert.notEqual(
      await starterViewer
        .locator(".byCODEtag")
        .first()
        .evaluate((token) => getComputedStyle(token).color),
      starterTagColor
    );
    await playground.locator("#site-theme").click();
    const readme = require("node:fs").readFileSync(path.join(__dirname, "../README.md"), "utf8");
    for (const extension of ["css", "js"]) assert.ok(readme.includes(`${cdnBase}md.min.${extension}`), "README assets must match the CDN starter");
    assert.equal(await playground.locator("#integration-note").textContent(), "CDN follows the latest release; updates may take time to reach caches.");
    assert.ok((await readStarter(playground)).includes(`href="${cdnBase}md.min.css"`));
    const codeRelease = await playground
      .frameLocator("#preview-frame")
      .locator(".byVIEWtoolbar")
      .evaluate(() => byCODEviewer.VERSION);
    for (const extension of ["css", "js"]) assert.ok(readme.includes(`easy-code-viewer@latest/code.min.${extension}`), "Markdown highlighting docs must use latest");
    const workflow = require("node:fs").readFileSync(path.join(__dirname, "../.github/workflows/rendering.yml"), "utf8");
    assert.ok(workflow.includes(`ref: v${codeRelease}`), "CI must test the same CODE release as the playground");
    assert.match(codeRelease, /^\d+(?:\.\d+)*$/);
    assert.equal(await playground.locator("#integration-cdn").isChecked(), true);
    await playground.locator('label[for="integration-cdn"]').click();
    const cdnCode = await readStarter(playground);
    assert.match(cdnCode, /^ {2}<head>$/m);
    assert.match(cdnCode, /^ {4}<script>$/m);
    assert.match(cdnCode, /^ {6}document\.addEventListener\("DOMContentLoaded", \(\) => \{$/m);
    assert.ok(cdnCode.includes(cdnBase));
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
                visible: bounds.top >= -1 && bounds.bottom <= view.innerHeight + 1,
                pinned: Math.abs(position === "top" ? bounds.top : view.innerHeight - bounds.bottom) < 1,
                creditsOrdered: position !== "bottom" || credits.top >= controls.bottom || (credits.top < controls.bottom && credits.bottom > controls.top),
                opaque: getComputedStyle(root.querySelector(".byVIEWcopy")).backgroundColor === getComputedStyle(root).backgroundColor,
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
    assert.equal(await readStarter(playground), cdnCode);
    const markdown = "# Downloaded document\n\n**Unicode: á 👋**\n\n</script><script>window.injected=true</script>\n\n`backticks` and ${literal}";
    await playground.locator("#markdown-source").fill(markdown);
    await playground.locator("#withLinks").uncheck();
    await playground.locator('label[for="preview-dark"]').click();
    assert.equal(await renderer.locator(".byVIEWthemeToggle svg").count(), 2);
    assert.equal(await readStarter(playground), cdnCode);
    await playground.locator('label[for="integration-local"]').click();
    const code = await readStarter(playground);
    assert.ok(code.includes('document.addEventListener("DOMContentLoaded"'));
    assert.ok(!code.includes('"withLinks": false'));
    assert.ok(code.includes('src="md.js" defer'));
    for (const name of ["toolbar", "credits", "themeToggle", "fontSizeControls", "copyButton"]) {
      await playground.locator(`#${name}`).evaluate((element) => {
        element.checked = false;
        element.dispatchEvent(new Event("change", { bubbles: true }));
      });
    }
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "viewer-starter-"));
    await Promise.all(["md.js", "md.css"].map((file) => fs.copyFile(path.join(__dirname, "..", file), path.join(directory, file))));
    // Run the exported starter in a fresh page to catch missing assets or initialization.
    const exported = await browser.newPage();
    exported.on("pageerror", (error) => errors.push(error.message));
    await exported.route("https://cdn.jsdelivr.net/**", async (route) => {
      const file = path.basename(new URL(route.request().url()).pathname).replace(/\.min(?=\.(?:css|js)$)/, "");
      const body = await fs.readFile(path.join(__dirname, "..", file));
      if (file.endsWith(".js")) await new Promise((resolve) => setTimeout(resolve, 75));
      await route.fulfill({ body, contentType: file.endsWith(".js") ? "text/javascript" : "text/css" });
    });
    try {
      for (const mode of ["cdn", "local"]) {
        await playground.locator("#markdown-source").fill("# Edited document\n\nThis should not change the starter.");
        await playground.locator(`label[for="integration-${mode}"]`).click();
        const displayed = await readStarter(playground);
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
        assert.equal(await exported.locator("#document").getAttribute("data-theme"), "github");
        assert.equal(await exported.locator("#document").evaluate((root) => root.classList.contains("light")), true);
        assert.equal(await exported.locator("#byVIEWtheme").count(), 0);
        assert.equal(await exported.locator('head link[rel="stylesheet"]').count(), 1);
        assert.doesNotMatch(html, /\.(light|dark)\.css/);
        for (const extension of ["css", "js"]) assert.ok(html.includes(`md${mode === "cdn" ? ".min" : ""}.${extension}`));
        const background = await exported.locator("#document").evaluate((element) => getComputedStyle(element).backgroundColor);
        await exported.locator(".byVIEWthemeToggle").click();
        await exported.waitForFunction((before) => getComputedStyle(document.getElementById("document")).backgroundColor !== before, background);
        assert.equal(await exported.locator(".byVIEWfontSize").count(), 3);
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
    assert.equal(await readStarter(playground), code);
    await playground.locator("#copy-integration").click();
    assert.equal(await playground.evaluate(() => window.copiedHTML), code);
    assert.deepEqual(errors, []);
    await playground.close();
  } finally {
    await browser.close();
  }
});

// --- CONFIGURATION AND FAMILY NAVIGATION ---
test("family customization, navigation and monospace controls", async () => {
  const bootstrapJS = await fetch("https://cdn.jsdelivr.net/gh/byuwur/spa.js@v20.7/js/bootstrap.min.js").then((response) => {
    assert.ok(response.ok, "Unable to load pinned Bootstrap JS");
    return response.text();
  });
  const browser = await launchBrowser();
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
      if (route.request().url() === "https://cdn.jsdelivr.net/gh/byuwur/spa.js@v20.7/css/bootstrap.min.css") return route.fulfill({ body: await getBootstrapCSS(), contentType: "text/css" });
      if (route.request().url() === "https://cdn.jsdelivr.net/gh/byuwur/spa.js@v20.7/js/bootstrap.min.js") return route.fulfill({ body: bootstrapJS, contentType: "text/javascript" });
      const url = new URL(route.request().url());
      if ([`${codeCDNBase}code.min.css`, `${codeCDNBase}code.min.js`].includes(url.href)) {
        return route.fulfill(await getCodeAsset(url.href));
      }
      if (url.origin !== "https://viewer.test") return route.abort();
      const file = path.basename(url.pathname).replace(/\.min(?=\.(?:css|js)$)/, "");
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
    await page.locator("#config-panel").evaluate((panel) => panel.classList.add("active"));
    for (const width of [360, 768, 1024, 1280]) {
      await page.setViewportSize({ width, height: 720 });
      assert.equal(
        await page.locator("#controlsSize").evaluate((size) => {
          const a = size.querySelector(".btn-group").getBoundingClientRect();
          const position = document.getElementById("controlsPosition");
          const b = position.querySelector(".btn-group").getBoundingClientRect();
          const legend = position.querySelector("legend");
          return (
            Math.abs(a.top - b.top) < 1 &&
            Math.abs(size.getBoundingClientRect().width - 2 * position.getBoundingClientRect().width) < 1 &&
            a.right < b.left &&
            legend.textContent === "Position" &&
            legend.getBoundingClientRect().height <= parseFloat(getComputedStyle(legend).lineHeight) + 1 &&
            [...size.querySelectorAll("label")].every((label) => label.scrollWidth <= label.clientWidth + 1 && label.getBoundingClientRect().right <= a.right + 1)
          );
        }),
        true,
        "Size and position controls share a 2:1 row without wrapping"
      );
    }
    assert.deepEqual(
      await page
        .locator(".accordion-button")
        .allTextContents()
        .then((labels) => labels.map((label) => label.trim()).slice(0, 3)),
      ["Preview appearance", "Viewer controls", "Rendering"]
    );
    assert.deepEqual(await page.locator("#options-json").evaluate((editor) => Object.keys(JSON.parse(editor.value)).slice(0, 20)), [
      "theme",
      "palette",
      "fontFamily",
      "fontSize",
      "lineHeight",
      "controlsFont",
      "backgroundColor",
      "containerBackgroundColor",
      "textColor",
      "customThemeCSS",
      "toolbar",
      "credits",
      "themeToggle",
      "fontSizeControls",
      "copyButton",
      "controlsCompact",
      "animations",
      "appearAnimation",
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
    assert.equal(await page.locator('[aria-label="Viewer suite"] a').count(), 9);
    assert.equal(await page.locator(".viewer-suite").getByRole("link", { name: "MD.edit", exact: true }).getAttribute("href"), "https://byuwur.github.io/easy-md-editor/");
    assert.equal(await page.locator('[aria-label="Viewer suite"]').getByRole("link", { name: "MD", exact: true }).getAttribute("aria-current"), "page");
    assert.equal(await page.locator(".site-footer .fa-heart").count(), 1);
    assert.equal(await page.locator("header .fa-github").count(), 1);
    assert.equal(await page.evaluate(() => Boolean(document.querySelector('[aria-label="Viewer suite"]').compareDocumentPosition(document.querySelector("footer")) & Node.DOCUMENT_POSITION_FOLLOWING)), true);
    await page.locator(".preview-appearance").evaluate((element) => {
      element.open = true;
    });
    await page.locator("#linkTarget-0").focus();
    await page.keyboard.press("ArrowRight");
    assert.equal(await page.locator("#linkTarget-1").isChecked(), true);
    await page.waitForFunction(() => document.getElementById("preview-frame").contentDocument.querySelector('.byMDlink[href^="https://"]')?.target === "_self");
    await page.keyboard.press("ArrowRight");
    assert.equal(JSON.parse(await page.locator("#options-json").inputValue()).linkTarget, false);
    await page.waitForFunction(() => !document.getElementById("preview-frame").contentDocument.querySelector('.byMDlink[href^="https://"]')?.hasAttribute("target"));
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("ArrowLeft");
    assert.equal(await page.locator("#linkTarget-0").isChecked(), true);
    await page.waitForFunction(() => getComputedStyle(document.querySelector(".preview-appearance"), "::details-content").opacity === "1");
    // Firefox may defer focus until the newly opened disclosure has rendered.
    await page.waitForFunction(() => {
      const radio = document.getElementById("preview-controls-font-0");
      radio.focus();
      return document.activeElement === radio;
    });
    await page.keyboard.press("ArrowRight");
    assert.equal(await page.locator("#preview-controls-font-1").isChecked(), true);
    assert.equal(JSON.parse(await page.locator("#options-json").inputValue()).controlsFont, "system-ui, sans-serif");
    await page.keyboard.press("ArrowLeft");
    await page.evaluate(() => {
      for (const [id, value] of [
        ["preview-font", "Georgia, serif"],
        ["preview-size", "1.5"],
        ["preview-leading", "1.8"],
        ["preview-controls-font", "system-ui, sans-serif"],
        ["preview-bg", "#123456"],
        ["preview-ink", "#fedcba"]
      ]) {
        const input = id === "preview-controls-font" ? document.querySelector(`[name="preview-controls-font"][value="${value}"]`) : document.getElementById(id);
        if (input.type === "radio") input.checked = true;
        else input.value = value;
        input.dispatchEvent(new Event("change", { bubbles: true }));
      }
    });
    await frame.waitForFunction((selector) => getComputedStyle(document.querySelector(selector)).backgroundColor === "rgb(18, 52, 86)", ".byMDdocument");
    assert.deepEqual(
      await root.evaluate((element) => {
        const style = getComputedStyle(element);
        return { font: style.fontFamily, size: style.fontSize, line: Math.round(parseFloat(style.lineHeight) * 1000) / 1000, bg: style.backgroundColor, text: style.color };
      }),
      { font: "Georgia, serif", size: "24px", line: 43.2, bg: "rgb(18, 52, 86)", text: "rgb(254, 220, 186)" }
    );
    assert.match(await frame.locator(".byVIEWtoolbar").evaluate((element) => getComputedStyle(element).fontFamily), /system-ui/);
    await page.locator("#copy-appearance").evaluate((button) => button.click());
    await page.waitForFunction(() => window.lastCopy?.includes("--by-view-controls-font"));
    assert.match(await page.evaluate(() => lastCopy), /\.byMDdocument/);
    assert.ok((await page.evaluate(() => lastCopy)).includes("--by-view-document-bg: #123456"));
    await page.locator('[data-options-view="json"]').evaluate((button) => button.click());
    const configuration = JSON.parse(await page.locator("#options-json").inputValue());
    for (const [name, value] of Object.entries({
      theme: "light",
      fontFamily: "Georgia, serif",
      fontSize: 1.5,
      lineHeight: 1.8,
      controlsFont: "system-ui, sans-serif",
      backgroundColor: "#123456",
      containerBackgroundColor: null,
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
    for (const [size, rem] of [
      ["xs", 0.5],
      ["xl", 1.25]
    ]) {
      await page.locator(`label[for="controlsSize-${size}"]`).click();
      await frame.waitForFunction((size) => document.querySelector(".byVIEWtoolbar").dataset.size === size, size);
      assert.equal(await frame.locator(".byVIEWtoolbar").evaluate((toolbar) => parseFloat(getComputedStyle(toolbar).fontSize) / parseFloat(getComputedStyle(document.documentElement).fontSize)), rem);
      await page.locator('[data-options-view="json"]').evaluate((button) => button.click());
      assert.equal(JSON.parse(await page.locator("#options-json").inputValue()).controlsSize, size);
      await page.locator("#copy-options").evaluate((button) => button.click());
      await page.waitForFunction((size) => JSON.parse(window.lastCopy).controlsSize === size, size);
      await page.locator('[data-options-view="form"]').evaluate((button) => button.click());
    }
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
    await page.setViewportSize({ width: 1280, height: 900 });
    assert.equal(await page.locator('#document-source [value="local"]').count(), 0);
    const uploadedSource = "# Your uploaded document\n\nPreserve this draft.";
    await page.locator("#local-file").setInputFiles({ name: "uploaded.md", mimeType: "text/markdown", buffer: Buffer.from(uploadedSource) });
    await page.waitForFunction(() => document.getElementById("document-source").value === "local");
    assert.equal(await page.locator('#document-source [value="local"]').textContent(), "uploaded.md");
    assert.equal(await sourceEditor.inputValue(), uploadedSource);
    await page.locator("#document-source").selectOption("features");
    await page.locator("#document-source").selectOption("local");
    assert.equal(await sourceEditor.inputValue(), uploadedSource);
    const largeSource = "# Large live source\n\n" + "x".repeat(70000);
    await sourceEditor.fill(largeSource);
    await frame.waitForFunction(() => document.getElementById("document").textContent.includes("Large live source"));
    await sourceEditor.fill(largeSource.replace("Large live source", "Latest live source"));
    await frame.waitForFunction(() => document.getElementById("document").textContent.includes("Latest live source"));
    assert.equal(await frame.locator("#document").evaluate((element) => element.textContent.includes("Large live source")), false);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});

// --- PALETTES AND CUSTOM THEME EDITING ---
test("playground palettes and editable two-mode custom themes stay synchronized", async () => {
  const browser = await launchBrowser();
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
      if (url.href === "https://cdn.jsdelivr.net/gh/byuwur/spa.js@v20.7/css/bootstrap.min.css") return route.fulfill({ body: await getBootstrapCSS(), contentType: "text/css" });
      if ([`${codeCDNBase}code.min.css`, `${codeCDNBase}code.min.js`].includes(url.href)) {
        return route.fulfill(await getCodeAsset(url.href));
      }
      if (url.origin !== "https://viewer.test") return route.abort();
      const file = path.basename(url.pathname).replace(/\.min(?=\.(?:css|js)$)/, "");
      return route.fulfill({ path: path.join(__dirname, "..", file), contentType: file.endsWith(".html") ? "text/html" : file.endsWith(".js") ? "text/javascript" : "text/css" });
    });
    await page.goto("https://viewer.test/index.html");
    const frame = page.frames().find((candidate) => candidate.parentFrame());
    await frame.waitForSelector(".byVIEWtoolbar");
    const root = frame.locator(".byMDdocument");
    const editor = page.locator("#custom-theme-css");
    const palette = page.locator("#preview-palette");
    const background = () =>
      root.evaluate((element) => {
        for (const animation of element.getAnimations()) if (animation.transitionProperty === "background-color") animation.finish();
        return getComputedStyle(element).backgroundColor;
      });
    // Hiding the header must disable dependent controls without erasing their configured values.
    const headerSettings = page.locator('#credits, #themeToggle, #fontSizeControls, #copyButton, #controlsCompact, [name="controlsSize"], [name="controlsPosition"]');
    const selectedSettings = await headerSettings.evaluateAll((controls) => controls.map((control) => [control.value, control.checked]));
    await page.locator("#toolbar").uncheck();
    await page.waitForFunction(() => document.getElementById("credits").disabled);
    assert.equal(await headerSettings.evaluateAll((controls) => controls.every((control) => control.disabled)), true);
    assert.equal(await page.locator("#animations").isEnabled(), true, "Content motion is independent of the viewer header");
    if (await page.locator("#displayContainer").count()) assert.equal(await page.locator("#displayContainer").isEnabled(), true);
    assert.deepEqual(await headerSettings.evaluateAll((controls) => controls.map((control) => [control.value, control.checked])), selectedSettings);
    await page.locator("#toolbar").check();
    await page.waitForFunction(() => !document.getElementById("credits").disabled);
    assert.equal(await headerSettings.evaluateAll((controls) => controls.every((control) => !control.disabled)), true);
    assert.equal(await page.locator("#appearAnimation").isChecked(), false);
    await page.locator("#appearAnimation").check();
    await page.locator("#animations").uncheck();
    await page.waitForFunction(() => document.getElementById("appearAnimation").disabled);
    assert.equal(await page.locator("#appearAnimation").isChecked(), true, "Disabling motion preserves the entrance preference");
    await page.locator("#animations").check();
    await page.waitForFunction(() => !document.getElementById("appearAnimation").disabled);
    await page.locator("#appearAnimation").uncheck();
    const initialBackground = await background();
    const hostBackground = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    assert.equal(await palette.inputValue(), "github");
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
    assert.equal(await palette.locator("optgroup").count(), 5);
    assert.equal(await palette.locator("option").count(), 49);
    for (const [name, expected] of Object.entries({
      solarized: "rgb(0, 43, 54)",
      dracula: "rgb(40, 42, 54)",
      darcula: "rgb(43, 43, 43)",
      discord: "rgb(49, 51, 56)",
      sakura: "rgb(48, 28, 44)",
      bubblegum: "rgb(59, 11, 45)",
      terminal: "rgb(13, 26, 17)",
      "high-contrast": "rgb(0, 0, 0)"
    })) {
      await palette.selectOption(name);
      assert.equal(await root.getAttribute("data-theme"), name);
      assert.ok((await editor.inputValue()).includes("--by-md-bg"));
      await setMode("dark");
      assert.equal(await background(), expected);
    }
    await page.locator(".preview-appearance").evaluate((element) => {
      element.open = true;
    });
    // Distinct light and dark values expose mode mixups and CSS leaking into the host page.
    const custom = '.byMDdocument.light[data-theme="custom"] { --by-md-bg: #f3f8fc; }\n.byMDdocument.dark[data-theme="custom"] { --by-md-bg: #102a43; }';
    // fill() does not wait for the disclosure's opening transition.
    await page.waitForFunction(() => getComputedStyle(document.querySelector(".preview-appearance"), "::details-content").opacity === "1");
    await editor.fill(custom);
    assert.equal(await editor.inputValue(), custom);
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
    await page.waitForFunction(() => document.getElementById("preview-palette").value === "github");
    assert.equal(await editor.inputValue(), defaults);
    assert.equal(await background(), initialBackground);
    assert.equal(await page.evaluate(() => getComputedStyle(document.body).backgroundColor), hostBackground);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});

// --- CODE VIEWER PLAYGROUND INTEGRATION ---
test("playground code examples pin sibling releases and switch presentation without changing Markdown", async () => {
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    await page.route("**/*", async (route) => {
      const url = new URL(route.request().url());
      if (url.href === "https://cdn.jsdelivr.net/gh/byuwur/spa.js@v20.7/css/bootstrap.min.css") return route.fulfill({ body: await getBootstrapCSS(), contentType: "text/css" });
      if ([`${codeCDNBase}code.min.css`, `${codeCDNBase}code.min.js`].includes(url.href)) {
        return route.fulfill(await getCodeAsset(url.href));
      }
      if (url.origin !== "https://viewer.test") return route.abort();
      const file = path.basename(url.pathname).replace(/\.min(?=\.(?:css|js)$)/, "");
      return route.fulfill({ path: path.join(__dirname, "..", file), contentType: file.endsWith(".html") ? "text/html" : file.endsWith(".js") ? "text/javascript" : "text/css" });
    });
    await page.goto("https://viewer.test/index.html");
    await page.locator('.feature-chip[data-example="code"]').click();
    const frame = page.frameLocator("#preview-frame");
    await frame.locator(".byCODEkeyword").first().waitFor();
    assert.deepEqual(await frame.locator('head [href*="easy-code-viewer"], head [src*="easy-code-viewer"]').evaluateAll((assets) => assets.map((asset) => asset.href || asset.src).sort()), [
      `${codeCDNBase}code.min.css`,
      `${codeCDNBase}code.min.js`
    ]);
    const markdown = await page.locator("#markdown-source").inputValue();
    assert.equal(await frame.locator(".byCODEhighlight").count(), 2);
    await page.locator("#codeHighlighting").evaluate((input) => input.click());
    await page.waitForFunction(() => !document.getElementById("preview-frame").contentDocument.querySelector(".byCODEhighlight"));
    assert.equal(await page.locator("#markdown-source").inputValue(), markdown);
    assert.equal(JSON.parse(await page.locator("#options-json").inputValue()).codeHighlighting, false);
    await page.locator("#codeHighlighting").evaluate((input) => input.click());
    await frame.locator(".byCODEkeyword").first().waitFor();
    assert.equal(JSON.parse(await page.locator("#options-json").inputValue()).codeHighlighting, true);
    for (const name of ["codeLineNumbers", "codeStatusBar"]) {
      assert.equal(await page.locator(`#${name}`).isChecked(), false);
      await page.locator(`#${name}`).evaluate((input) => input.click());
      await page.waitForFunction((name) => document.getElementById("preview-frame").contentDocument.querySelector(name === "codeLineNumbers" ? ".byCODElineNumber" : ".byCODEstatus"), name);
      assert.equal(JSON.parse(await page.locator("#options-json").inputValue())[name], true);
    }
    assert.equal(await page.locator("#markdown-source").inputValue(), markdown);
    assert.equal(await frame.locator(".byCODEblock").count(), 2);
    await page.locator("#reset-options").click();
    await page.waitForFunction(() => !document.getElementById("preview-frame").contentDocument.querySelector(".byCODEblock"));
    for (const name of ["codeLineNumbers", "codeStatusBar"]) assert.equal(await page.locator(`#${name}`).isChecked(), false);
  } finally {
    await browser.close();
  }
});
