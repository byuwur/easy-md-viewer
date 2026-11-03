# byuwur/easy-md-viewer

![easy-md-viewer preview](prev.jpg)

**Markdown, made to be read.**

Render Markdown into headings, lists, tables, tasks, links, and code blocks.

Use it for READMEs, documentation, notes, and other Markdown content.

One JavaScript file. One scoped stylesheet. No build step. Plain JavaScript, with no runtime dependencies.

[Open the playground](https://byuwur.github.io/easy-md-viewer/) · [CodePen](https://codepen.io/byuwur/pen/VYPoWMM)

Open `index.html` for the local playground; its page assets require internet access.

## Installation

**Recommended: CDN.** No downloads or package manager.

```html
<link href="https://cdn.jsdelivr.net/gh/byuwur/easy-md-viewer@main/md.css" rel="stylesheet" />
<script src="https://cdn.jsdelivr.net/gh/byuwur/easy-md-viewer@main/md.js" defer></script>
```

The CDN example tracks `@main` and requires internet access. Use a published tag or commit to pin a version.

**Local files:** For offline use, save `md.js` and `md.css` beside your HTML:

```html
<link href="md.css" rel="stylesheet" />
<script src="md.js" defer></script>
```

## Usage

```html
<div id="byMDrenderer" data-theme="light"></div>
<script>
  document.addEventListener("DOMContentLoaded", () => {
    const markdown = "# My project\n\nRender **Markdown** directly in your page.";
    byMDviewer(document.getElementById("byMDrenderer"), markdown);
  });
</script>
```

The second argument also accepts an `HTMLElement` whose text contains Markdown:

```javascript
const target = document.getElementById("byMDrenderer");
byMDviewer(target, document.getElementById("markdownSource"));
```

Use `byMDviewer(target)` instead when the target itself contains Markdown.

Exported HTML starters use default settings, independently of playground changes.

## Options

Pass options as the third argument, such as `byMDviewer(target, markdown, { breaks: true })`.

| Option              | Default     | Meaning                                                                      |
| ------------------- | ----------- | ---------------------------------------------------------------------------- |
| `withLinks`         | `true`      | Render links, autolinks, bare URLs, and email addresses.                     |
| `withImages`        | `true`      | Render supported images.                                                     |
| `withTables`        | `true`      | Render GFM-style tables.                                                     |
| `withTasks`         | `true`      | Render task checkboxes.                                                      |
| `withStrikethrough` | `true`      | Render `~~strikethrough~~`.                                                  |
| `breaks`            | `false`     | Convert paragraph line breaks to `<br>`.                                     |
| `linkTarget`        | `"_blank"`  | Link target; `false` omits it. Same-document anchors stay in this tab.       |
| `toolbar` | `true` | Show the viewer header; secondary tools are configured separately. |
| `credits` | `true` | Show attribution in the header. |
| `themeToggle`       | `true`      | Show the theme toggle.                                                       |
| `fontSizeControls`  | `true`      | Show text-size controls.                                                     |
| `copyButton`        | `true`      | Show Copy: click for rendered plain text; Shift+click for original Markdown. |
| `controlsSize`      | `"regular"` | `"small"`, `"regular"`, or `"large"`; invalid values use `"regular"`.        |
| `controlsCompact`   | `true`      | Keep credits beside controls; `false` stacks them. Wraps as needed.          |
| `controlsPosition`  | `"top"`     | Sticky `"top"` or `"bottom"` toolbar; invalid values use `"top"`.            |

Plain-text copying preserves paragraph and code line breaks, excluding controls and credits. Copy requires clipboard permission in a secure context.

Read the library version with `byMDviewer.VERSION`.

Controls stick to the selected edge of the page or nearest scrolling container.

The default header shows Theme, text-size controls, and Copy. Secondary tools are opt-in. Use `toolbar: false` to hide the header, or switch individual controls off as needed.

Controls use monospace by default; override `--by-view-controls-font` to change it.

## Themes

`md.css` includes all palettes in Light and Dark. Monokai is the default.

| Palette           | `data-theme`    | What it looks like                                                |
| ----------------- | --------------- | ----------------------------------------------------------------- |
| Monokai (default) | `monokai`       | Warm light and dark colors.                                       |
| GitHub            | `github`        | Familiar neutral surfaces and syntax colors.                      |
| Solarized         | `solarized`     | Warm light or deep blue-green dark surfaces.                      |
| High Contrast     | `high-contrast` | Black/white surfaces, strong text, borders, and focus indicators. |

Use a mode class and a palette name together:

```html
<div id="viewer" class="dark" data-theme="github"></div>
<!-- High Contrast Light: class="light" data-theme="high-contrast" -->
<!-- High Contrast Dark: class="dark" data-theme="high-contrast" -->
```

Rendering adds `.byMDdocument`; its variables affect only that container and its children. The theme switch changes mode while keeping the palette; re-rendering preserves both. A named palette without a mode class starts in Light; if both mode classes are present, Dark wins.

`data-theme="light"` and `data-theme="dark"` select Monokai and override mode classes. A mode class alone, or no explicit theme, also uses Monokai.

### High Contrast

High Contrast text colors target at least [7:1 contrast](https://www.w3.org/WAI/WCAG22/Understanding/contrast-enhanced.html), with [3:1 contrast for control boundaries and focus cues](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html). Check contrast again when you override colors.

### Make it yours

**Custom theme CSS** starts with the selected palette's complete Light/Dark defaults, including controls and format-specific colors. Switching presets keeps your custom draft until Reset. On your page, use `data-theme="custom"` with `class="light"` or `class="dark"`.

Define a named palette after the viewer stylesheet. Unspecified colors inherit Monokai:

```css
.byMDdocument.light[data-theme="ocean"] {
  --by-md-bg: #f3f8fc;
  --by-md-text: #102a43;
  --by-md-border: #486581;
  --by-md-link: #005a9c;
}

.byMDdocument.dark[data-theme="ocean"] {
  --by-md-bg: #102a43;
  --by-md-text: #f0f6fc;
  --by-md-border: #9fb3c8;
  --by-md-link: #8cd3ff;
}
```

```html
<div id="viewer" class="dark" data-theme="ocean"></div>
```

Named palettes need no JavaScript registration or extra theme files.

In the playground configuration, `theme` is the mode, `palette` is its name, and `customThemeCSS` holds custom rules. Null appearance values inherit defaults. Pass only documented API options to the renderer.

**Copy CSS** exports typography and individual color overrides. Inline colors override palette variables; clear them or Reset to restore palette defaults.

Text-size controls change only this viewer, in `0.125rem` steps from `0.5rem` to `3rem`, independently of button size. **A** restores its initial size; re-rendering preserves the selected size.

### Legacy theme links

Legacy integrations can use `#byVIEWtheme` or a detected `md.light.css` / `md.dark.css` link. The toggle keeps its path, query, and hash and updates viewers sharing the link. Explicit container themes stay independent. Separate theme files are no longer shipped; retain your hosted legacy files to use this alternative.

## Supported Markdown

Supports ATX headings, emphasis, strikethrough, code spans/fences, ordered/unordered/nested/task lists, recursive blockquotes, horizontal rules, images, links, aligned GFM tables, escapes, and common HTML entities. Task checkboxes are disabled. This covers practical documents rather than every CommonMark edge case or extension.

### Heading anchors

`## Installation` gets `installation`; repeated headings get suffixes such as `example-1`. Nested headings also receive IDs. Link with `[Installation](#installation)`.

### Links and raw HTML

Links accept relative paths, anchors, and `http`, `https`, `ftp`, `ftps`, `mailto`, or `tel`. Links/images reject executable schemes including `javascript:` and `data:`.

Raw HTML is displayed as text. Comments and document markers such as `[//]: # "OPTIONAL:SECTION"` are hidden except inside code.

## Checks

Theme tests cover both modes, container isolation, legacy links, custom CSS, and High Contrast.

Landing tests fetch the pinned Bootstrap stylesheet unless `BOOTSTRAP_CSS_PATH` points to a cached copy.

[GitHub Actions](.github/workflows/rendering.yml) runs `tests/rendering.cjs` against local `md.js` in Chromium, including the benchmark and playground exports. For visual checks, serve `index.html` over HTTP and select `test.md` from the Document menu.

## The easy viewers

Need a viewer for another format? Explore the family:

[Markdown](https://github.com/byuwur/easy-md-viewer) · [JSON](https://github.com/byuwur/easy-json-viewer) · [CSV & TSV](https://github.com/byuwur/easy-csv-viewer) · [Logs](https://github.com/byuwur/easy-log-viewer) · [Diff](https://github.com/byuwur/easy-diff-viewer) · [XML](https://github.com/byuwur/easy-xml-viewer) · [YAML](https://github.com/byuwur/easy-yaml-viewer) · [Source code](https://github.com/byuwur/easy-code-viewer)

## License

MIT (c) Andres Trujillo [Mateus] byUwUr
