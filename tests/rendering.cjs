const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs/promises");
const test = require("node:test");
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
        ["single backticks ignore longer runs", '`a``b`', root => root.querySelector('code')?.textContent === 'a``b'],
        ["double backticks ignore longer runs", '``a```b``', root => root.querySelector('code')?.textContent === 'a```b'],
        ["unmatched code runs stay literal", '``unclosed`', root => !root.querySelector('code') && root.textContent === '``unclosed`'],
        ["tilde fence info accepts backticks", '~~~js`meta\n<!-- literal -->\n~~~', root => root.querySelector('pre code')?.textContent === '<!-- literal -->'],
        ["quoted document markers are hidden", '[//]: # "OPTIONAL:SECTION"\n# Visible', root => root.children.length === 1 && root.querySelector('h1')?.textContent === 'Visible'],
        ["comments inside ordinary code survive", '`<!-- literal -->`\n\n```html\n<!-- literal -->\n```', root => root.querySelectorAll('code').length === 2 && Array.from(root.querySelectorAll('code')).every(code => code.textContent === '<!-- literal -->')],
        ["comments outside code are hidden", 'Before <!-- hidden --> after', root => root.textContent === 'Before  after'],
        ["table code preserves pipes", '| Value |\n| --- |\n| `a|b` |', root => root.querySelector('td code')?.textContent === 'a|b'],
        ["longer runs preserve comments inside code", '`a``<!-- literal -->`', root => root.querySelector('code')?.textContent === 'a``<!-- literal -->'],
        ["link labels skip brackets inside code", '[`a``]b`](https://example.com)', root => root.querySelector('a code')?.textContent === 'a``]b'],
        ["table code skips longer runs before pipes", '| Value |\n| --- |\n| `a``|b` |', root => root.querySelector('td code')?.textContent === 'a``|b' && root.querySelectorAll('td').length === 1],
        ["emphasis skips delimiters inside code", '*`a``*b`*', root => root.querySelector('em code')?.textContent === 'a``*b'],
        ["nested lists still render", '- Parent\n  - Child', root => root.querySelector('ul li ul li')?.textContent === 'Child'],
        ["heading anchors stay unique", '# Same\n# Same', root => root.querySelectorAll('h1')[0]?.id === 'same' && root.querySelectorAll('h1')[1]?.id === 'same-1'],
        ["unsafe links stay inert", '[bad](javascript:alert(1))', root => !root.querySelector('a')],
        ["disabled options stay disabled", '~~text~~ [link](https://example.com)', root => !root.querySelector('del, a'), { withLinks: false, withStrikethrough: false }]
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
  } finally {
    await browser.close();
  }
});
