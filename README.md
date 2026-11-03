# byuwur/easy-md-viewer

![easy-md-viewer preview](prev.jpg)

Render Markdown with light/dark themes and text-size controls. Plain JavaScript; no dependencies or build step.

Try [GitHub Pages](https://byuwur.github.io/easy-md-viewer/) or [CodePen](https://codepen.io/byuwur/pen/VYPoWMM).

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

| Option              | Default     | Meaning                                                                            |
| ------------------- | ----------- | ---------------------------------------------------------------------------------- |
| `withLinks`         | `true`      | Render links, autolinks, bare URLs, and email addresses.                           |
| `withImages`        | `true`      | Render supported images.                                                           |
| `withTables`        | `true`      | Render GFM-style tables.                                                           |
| `withTasks`         | `true`      | Render task checkboxes.                                                            |
| `withStrikethrough` | `true`      | Render `~~strikethrough~~`.                                                        |
| `breaks`            | `false`     | Convert paragraph line breaks to `<br>`.                                           |
| `linkTarget`        | `"_blank"`  | Link target; `false` omits it. Same-document anchors stay in this tab.             |
| `themeToggle`       | `true`      | Show the theme toggle.                                                       |
| `fontSizeControls`  | `true`      | Show A-/A+ controls.                                                               |
| `copyButton`        | `true`      | Show Copy: click for rendered plain text; Shift+click for original Markdown.       |
| `controlsSize`      | `"regular"` | Button size: `"small"`, `"regular"`, or `"large"`; invalid values use `"regular"`. |
| `controlsCompact`   | `true`     | Put attribution beside the controls, wrapping when space is limited.               |
| `controlsPosition`  | `"top"`     | Toolbar position: `"top"` or `"bottom"`; invalid values use `"top"`.               |

Plain-text copying preserves paragraph and code line breaks and excludes viewer controls and attribution. Shift+click copies the source, including Markdown markers. Copy requires browser clipboard access in a secure context; the button reports failure if access is unavailable or denied.

Each toolbar shows a GitHub link, version, and author portfolio link in a muted theme color. Read the library version with `byMDviewer.VERSION`.

Controls stay visible at the selected edge of the page or nearest scrolling container while the viewer is in view. Their opaque background follows the viewer theme. Bottom toolbars put credits below the buttons when stacked. For a compact header, use `{ controlsSize: "small", controlsCompact: true, controlsPosition: "top" }`. Button size is independent of the document text size.

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
