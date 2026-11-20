/*
 * File: __tests__/rendering.cjs
 * Desc: Bounded, offline checks for the public MD renderer contract.
 */
const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");
const { chromium, firefox, webkit } = require("playwright");
const engine = process.env.BROWSER_ENGINE || "chromium";
assert.ok(["chromium", "firefox", "webkit"].includes(engine), "Unsupported BROWSER_ENGINE");

test("MD library", { timeout: 30000 }, async (t) => {
  const browser = await { chromium, firefox, webkit }[engine].launch({
    timeout: 10000,
    ...(engine === "chromium" ? { channel: process.env.BROWSER_CHANNEL, executablePath: process.env.CHROMIUM_EXECUTABLE_PATH } : {})
  });
  t.after(() => browser.close());
  const page = await browser.newPage();
  page.setDefaultTimeout(5000);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  // Load authored files directly; CDN availability is not part of this contract.
  await page.route("**/*", (route) => route.abort());
  // ===== BROWSER FIXTURE =====
  await page.setContent('<!doctype html><meta charset="UTF-8"><div id="viewer"></div>');
  await page.addStyleTag({ path: path.join(__dirname, "../md.css") });
  await page.addScriptTag({ path: path.join(__dirname, "../md.js") });
  await page.evaluate(() => {
    window.root = document.getElementById("viewer");
  });

  // ===== RENDERING BEHAVIOR =====
  await t.test("renders headings, lists, emphasis, and fenced source", async () => {
    const source = "# Core\n\n**strong**\n\n- first\n- second\n\n```js\nconst n = 1;\n```";
    await page.evaluate((source) => byMDviewer(root, source, { animations: false }), source);
    assert.equal(await page.locator(".byMDcontent h1").textContent(), "Core");
    assert.equal(await page.locator(".byMDcontent strong").textContent(), "strong");
    assert.equal(await page.locator(".byMDcontent li").count(), 2);
    assert.match(await page.locator(".byMDcontent pre").textContent(), /const n = 1;/);
  });

  await t.test("prefixed documents keep their own heading links and preserve host links", async () => {
    const anchors = await page.evaluate(() => {
      const markdown = "[First](#install) [Again](#install-1) [Host](#contact)\n\n## Install\n\n## Install";
      const other = document.body.appendChild(document.createElement("section"));
      byMDviewer(other, markdown);
      byMDviewer(root, markdown, { headingIdPrefix: "guide-" });
      const ids = [...root.querySelectorAll("h2")].map((heading) => heading.id);
      const links = [...root.querySelectorAll(".byMDlink")].map((link) => link.getAttribute("href"));
      const original = other.querySelector("h2").id;
      other.remove();
      return { ids, links, original };
    });
    assert.deepEqual(anchors, {
      ids: ["guide-install", "guide-install-1"],
      links: ["#guide-install", "#guide-install-1", "#contact"],
      original: "install"
    });
  });

  await t.test("keeps HTML and unsafe links inert", async () => {
    await page.evaluate(() => byMDviewer(root, '<img src=x onerror="window.injected=1">\n\n[bad](javascript:alert(1))'));
    assert.equal(await page.locator("#viewer img, #viewer script, #viewer a[href^='javascript:']").count(), 0);
    assert.equal(await page.evaluate(() => window.injected), undefined);
  });

  await t.test("replacement preserves only the new document and copies its source", async () => {
    await page.evaluate(() => {
      byMDviewer(root, "# stale");
      byMDviewer(root, "# current");
      window.copied = null;
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: {
          writeText: async (text) => {
            window.copied = text;
          }
        }
      });
    });
    assert.equal(await page.locator(".byMDcontent h1").textContent(), "current");
    await page.locator(".byVIEWcopy").click({ modifiers: ["Shift"] });
    assert.equal(await page.evaluate(() => window.copied), "# current");
  });

  assert.deepEqual(errors, [], "No uncaught browser errors");
});
