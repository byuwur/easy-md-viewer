# byuwur/easy-md-viewer

**easy MD Viewer** is a lightweight and easy-to-use JavaScript library for rendering Markdown text in an HTML document. It provides common Markdown formatting, nested content, GFM-style features, automatic heading anchors, customizable themes, and safe link handling while staying dependency-free.

Test it out at: [codepen.io/byuwur/pen/01a0161a-7099-7a00-9603-665d04c6dea6](https://codepen.io/editor/byuwur/pen/01a0161a-7099-7a00-9603-665d04c6dea6)

## Features

- **Markdown Rendering**: Renders headings, paragraphs, emphasis, code, lists, blockquotes, horizontal rules, links, images, and other common Markdown syntax.
- **Heading Anchors**: Automatically generates unique heading IDs so same-document links such as `[Installation](#installation)` work without additional markup.
- **Nested Content**: Supports nested lists and recursively rendered blockquotes.
- **GFM Extras**: Includes strikethrough, task lists, tables with alignment, bare URL autolinks, and email autolinks.
- **Code Blocks**: Supports backtick and tilde fences with optional language metadata, as well as arbitrary-backtick inline code spans.
- **Flexible Input**: Render a Markdown string, another element's text content, or the target element's own text content.
- **Customizable Themes**: Includes light and dark themes with an optional built-in theme toggle.
- **Safe Link Handling**: Rejects executable URL schemes and keeps same-document anchor links in the current tab.
- **Safe Rendering**: Uses DOM nodes directly instead of generating Markdown HTML through `innerHTML`.
- **Dependency-Free**: Uses plain JavaScript and DOM APIs without a package manager or build step.

## Getting Started

### Installation

Include the required files in your HTML:

```html
<link href="md.css" rel="stylesheet" />
<link id="byVIEWtheme" href="md.dark.css" rel="stylesheet" />
<script src="md.js" defer></script>
```

### Basic Usage

Call `byMDviewer` with the target element, the Markdown text, and optional configuration options:

```javascript
const markdown = `# Hello

This is **Markdown**.

- Easy
- Lightweight
- Dependency-free`;

byMDviewer(document.getElementById("byMDrenderer"), markdown);
```

The intended input is Markdown text. The source can be passed directly as a string, read from another HTML element, or omitted to render the target element's own `textContent`.

### Options

The `byMDviewer` function accepts an optional `options` object:

- `withLinks` (default: `true`): If `true`, Markdown links, supported autolinks, bare URLs, and email addresses are rendered as clickable links.
- `withImages` (default: `true`): If `true`, supported Markdown images are rendered.
- `withTables` (default: `true`): If `true`, GFM-style tables are rendered.
- `withTasks` (default: `true`): If `true`, `[ ]` and `[x]` list items are rendered as disabled task checkboxes.
- `withStrikethrough` (default: `true`): If `true`, `~~strikethrough~~` is rendered.
- `breaks` (default: `false`): If `true`, normal line breaks inside paragraphs are rendered as `<br>` elements.
- `linkTarget` (default: `"_blank"`): Target used by rendered links. Same-document `#anchor` links never receive the external target. Set to `false` to omit target attributes from other links.
- `themeToggle` (default: `true`): Appends a light/dark theme toggle when a compatible theme stylesheet is found.

### Themes

The built-in theme toggle automatically detects the stylesheet identified by `#byVIEWtheme` or a stylesheet whose filename matches `md.light.css` or `md.dark.css`.

```html
<link id="byVIEWtheme" href="md.dark.css" rel="stylesheet" />
```

The toggle switches only the theme filename while preserving the stylesheet resource path.

You can disable the automatic toggle:

```javascript
byMDviewer(document.getElementById("byMDrenderer"), markdown, {
  themeToggle: false
});
```

Themes can also be switched manually by updating the `href` of the theme stylesheet:

```javascript
document.querySelector("#byVIEWtheme").setAttribute("href", "md.light.css");
```

```javascript
document.querySelector("#byVIEWtheme").setAttribute("href", "md.dark.css");
```

### Rendering From an Element

Pass another HTML element as the Markdown source to render its `textContent`:

```javascript
byMDviewer(document.getElementById("byMDrenderer"), document.getElementById("markdownSource"));
```

Or omit the source to render the target element's own `textContent`:

```javascript
byMDviewer(document.getElementById("byMDrenderer"));
```

### Heading Anchors

ATX headings automatically receive unique IDs derived from their rendered text:

```md
## Installation
```

renders with an anchor equivalent to:

```html
<h2 id="installation">Installation</h2>
```

This allows normal same-document Markdown links:

```md
[Installation](#installation)
```

Repeated headings receive unique IDs in document order:

```text
example
example-1
example-2
```

Heading IDs also work for headings rendered recursively inside supported nested content.

### Supported Markdown

The renderer supports the common syntax needed for normal Markdown documents:

- ATX headings (`#` through `######`)
- Paragraphs and Markdown hard line breaks
- Optional soft line breaks with `breaks: true`
- Bold, italic, combined emphasis, and strikethrough
- Arbitrary-backtick inline code
- Fenced code blocks using backticks or tildes
- Optional fenced-code language metadata
- Ordered and unordered lists
- Nested lists
- Ordered lists starting at values other than `1`
- Task lists
- Recursive blockquotes
- Horizontal rules
- Inline links and optional link titles
- Angle-bracket autolinks
- Bare URL and email autolinks
- Images with lazy loading
- GFM-style tables with column alignment
- Escaped pipes and inline-code pipes inside tables
- Markdown backslash escapes
- Common named and numeric HTML entities
- HTML comments and `[//]: # (...)` hidden document markers

This project intentionally focuses on practical Markdown rendering rather than implementing every CommonMark edge case or extension.

### Links

Supported links can use relative paths, same-document anchors, or allowed URL protocols.

External links use the configured `linkTarget`:

```md
[easy MD Viewer](https://github.com/byuwur/easy-md-viewer)
```

Same-document links remain in the current page regardless of `linkTarget`:

```md
[Options](#options)
```

Supported explicit URL protocols include `http`, `https`, `ftp`, `ftps`, `mailto`, and `tel`.

### Safety

**easy MD Viewer** does not execute raw HTML from Markdown. The renderer creates DOM nodes directly and treats unsupported HTML as text instead of inserting generated Markdown through `innerHTML`.

HTML comments are removed from rendered Markdown while comment-looking content inside fenced or inline code remains literal.

Markdown document-control markers using the following form are also hidden:

```md
[//]: # "OPTIONAL:SECTION"
```

Rendered links and images only accept supported URL protocols. Potentially executable schemes such as `javascript:` and `data:` are rejected.

### Example Markup

```html
<link href="md.css" rel="stylesheet" />
<link id="byVIEWtheme" href="md.dark.css" rel="stylesheet" />

<div id="byMDrenderer"> # easy MD Viewer Render **Markdown** directly from this element. ## Features - Lightweight - Dependency-free - DOM-based </div>

<script src="md.js"></script>
<script>
  byMDviewer(document.getElementById("byMDrenderer"));
</script>
```

## License

MIT (c) Andrés Trujillo [Mateus] byUwUr
