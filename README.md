# byuwur/easy-json-viewer

**easy MD Viewer** is a lightweight, dependency-free JavaScript Markdown viewer that renders Markdown directly into DOM nodes.

## Features

- No dependencies, package manager, or build step.
- ATX headings (`#` through `######`).
- Paragraphs and hard/optional soft line breaks.
- Bold, italic, combined emphasis, strikethrough, and inline code.
- Fenced code blocks using backticks or tildes, with optional language metadata.
- Safe inline links, angle-bracket autolinks, and bare URL/email autolinks.
- Images with lazy loading.
- Ordered, unordered, nested, and task lists.
- Recursive blockquotes.
- Horizontal rules.
- GFM-style tables with alignment.
- Backslash escapes and common/numeric HTML entities.
- Raw HTML is not executed; HTML comments and `[//]: # (...)` hidden markers remain invisible.

## Installation

Include the files directly:

```html
<link href="md.css" rel="stylesheet" />
<link id="byVIEWtheme" href="md.dark.css" rel="stylesheet" />
<script src="md.js" defer></script>
```

## Basic usage

```html
<div id="byMDrenderer"></div>
```

```js
byMDviewer(document.getElementById("byMDrenderer"), "# Hello\n\nThis is **Markdown**.");
```

The source can also be another HTML element:

```js
byMDviewer(targetElement, sourceElement);
```

Or omit the source to render the target element's own `textContent`:

```js
byMDviewer(document.getElementById("byMDrenderer"));
```

## Options

```js
byMDviewer(element, markdown, {
  withLinks: true,
  withImages: true,
  withTables: true,
  withTasks: true,
  withStrikethrough: true,
  breaks: false,
  linkTarget: "_blank"
});
```

Set `linkTarget: false` to leave links without a target attribute.

## Safety

`easy MD viewer` does not render raw HTML from Markdown. It builds DOM nodes directly rather than inserting generated Markdown HTML with `innerHTML`.

Potentially executable URL schemes such as `javascript:` and `data:` are not accepted for Markdown links/images.

## Themes

Switch themes by changing the byVIEWtheme stylesheet:

```js
document.querySelector("#byVIEWtheme").setAttribute("href", "md.light.css");
document.querySelector("#byVIEWtheme").setAttribute("href", "md.dark.css");
```

## License

MIT (c) Andrés Trujillo [Mateus] byUwUr
