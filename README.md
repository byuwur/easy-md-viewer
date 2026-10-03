# byuwur/easy-md-viewer

Render Markdown in an HTML page, with light and dark themes. Plain JavaScript, no dependencies or build step.

Try it on [GitHub Pages](https://byuwur.github.io/easy-md-viewer/) or [CodePen](https://codepen.io/byuwur/pen/VYPoWMM).

## Features

- Headings, lists, tables, blockquotes, links, images, and code.
- Nested content, task lists, strikethrough, and automatic heading anchors.
- Light/dark theme toggle and A-/A+ text size controls.
- Input from a Markdown string or an element's text.
- Safe URL handling; raw HTML is displayed as text.
- Plain JavaScript, with no dependencies or build step.

## Installation

Use the CDN:

```html
<link href="https://cdn.jsdelivr.net/gh/byuwur/easy-md-viewer@v1.4.final/md.min.css" rel="stylesheet" />
<link id="byVIEWtheme" href="https://cdn.jsdelivr.net/gh/byuwur/easy-md-viewer@v1.4.final/md.light.css" rel="stylesheet" />
<script src="https://cdn.jsdelivr.net/gh/byuwur/easy-md-viewer@v1.4.final/md.min.js" defer></script>
```

Or use the local files:

```html
<link href="md.css" rel="stylesheet" />
<link id="byVIEWtheme" href="md.light.css" rel="stylesheet" />
<script src="md.js" defer></script>
```

For development, omit `@v1.4.final` from the CDN URLs to load the latest changes.

## Usage

Save this as an HTML file beside `md.js`, `md.css`, and `md.light.css`, then open it in a browser. It renders a heading, emphasis, a link, a task list, and a table:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Markdown viewer example</title>
    <link href="md.css" rel="stylesheet" />
    <link id="byVIEWtheme" href="md.light.css" rel="stylesheet" />
  </head>
  <body>
    <div id="byMDrenderer"></div>

    <script src="md.js"></script>
    <script>
      const markdown = `# My project

Render **Markdown** directly in your page.

[Project source](https://github.com/byuwur/easy-md-viewer)

## Checklist

- [x] Load the viewer
- [ ] Write more content

| Feature | Available |
| --- | --- |
| Tables | Yes |
| Themes | Light and dark |
`;

      const target = document.getElementById("byMDrenderer");
      byMDviewer(target, markdown);
    </script>
  </body>
</html>
```

The target and library are loaded before the viewer call. Use the CDN URLs from Installation instead of the local paths if preferred. If you load the script with `defer` in the head, run the viewer call after `DOMContentLoaded` or from a later deferred script.

### Read from another element

With the library already loaded, use a hidden source element to keep Markdown separate from its output:

```html
<pre id="markdownSource" hidden>
# Hello

This is **Markdown** from an element.
</pre>
<div id="byMDrenderer"></div>

<script>
  const source = document.getElementById("markdownSource");
  const target = document.getElementById("byMDrenderer");
  byMDviewer(target, source);
</script>
```

### Render an element's own text

Omit the second argument to replace the target's Markdown text with rendered content:

```html
<div id="byMDrenderer"> # Hello This is **Markdown** inside the target. </div>

<script>
  byMDviewer(document.getElementById("byMDrenderer"));
</script>
```

## Options

Pass options as the third argument:

```javascript
byMDviewer(document.getElementById("byMDrenderer"), markdown, {
  breaks: true,
  themeToggle: false
});
```

| Option              | Default    | Meaning                                                                                   |
| ------------------- | ---------- | ----------------------------------------------------------------------------------------- |
| `withLinks`         | `true`     | Render clickable links, autolinks, bare URLs, and email addresses.                        |
| `withImages`        | `true`     | Render supported images.                                                                  |
| `withTables`        | `true`     | Render GFM-style tables.                                                                  |
| `withTasks`         | `true`     | Render `[ ]` and `[x]` items as disabled checkboxes.                                      |
| `withStrikethrough` | `true`     | Render `~~strikethrough~~`.                                                               |
| `breaks`            | `false`    | Turn ordinary paragraph line breaks into `<br>` elements.                                 |
| `linkTarget`        | `"_blank"` | Target for links; `false` omits it. Same-document anchors always stay in the current tab. |
| `themeToggle`       | `true`     | Add a toggle when a compatible theme stylesheet is present.                               |
| `fontSizeControls`  | `true`     | Add A-/A+ buttons to resize this viewer's text.                                           |

## Themes

The toggle finds `#byVIEWtheme` or a stylesheet named `md.light.css` or `md.dark.css`. It changes only the theme filename, keeping the resource path.

A- and A+ change the viewer's font size by `0.125rem`, between `0.5rem` and `3rem`. They work without a theme stylesheet, preserve the size when the target is rendered again, and do not change the rest of the page. Set `fontSizeControls: false` to hide them.

To switch manually:

```javascript
document.querySelector("#byVIEWtheme").href = "md.dark.css";
// Use md.light.css for the light theme.
```

## Supported Markdown

- ATX headings (`#` through `######`), paragraphs, hard line breaks, and optional soft breaks.
- Bold, italic, combined emphasis, and strikethrough.
- Inline code with arbitrary backtick lengths; backtick or tilde fences with optional language metadata.
- Ordered, unordered, nested, and task lists; ordered lists can start above `1`.
- Recursive blockquotes, horizontal rules, and lazy-loaded images.
- Inline links with optional titles, angle-bracket autolinks, bare URLs, and email links.
- GFM-style tables with alignment, escaped pipes, and inline-code pipes.
- Backslash escapes, common named and numeric HTML entities, and hidden comments/document markers.

This covers practical Markdown documents, not every CommonMark edge case or extension.

### Heading anchors

`## Installation` receives the ID `installation`, so `[Installation](#installation)` works. Repeated headings become `example`, `example-1`, `example-2`, and so on. Supported nested headings receive IDs too.

### Links and raw HTML

Links accept relative paths, same-document anchors, and `http`, `https`, `ftp`, `ftps`, `mailto`, or `tel` URLs. Links and images reject executable schemes such as `javascript:` and `data:`.

The renderer creates DOM nodes and treats unsupported raw HTML as text. It does not execute it. HTML comments are hidden, except inside code, including fences nested in blockquotes and lists. Document markers such as `[//]: # "OPTIONAL:SECTION"` are hidden too.

## Checks

GitHub Actions runs the rendering checks in `tests/rendering.cjs` on pushes and pull requests. It tests local `md.js` in Chromium, including the benchmark document.

For a visual check, serve this folder over HTTP, open `index.html`, and click **BENCHMARK MARKDOWN** to render `test.md`.

CDN examples use the pinned release. Local source fixes require a new release before they reach those URLs.

## License

MIT (c) Andres Trujillo [Mateus] byUwUr
