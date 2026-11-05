"use strict";
/*
 * File: md.js
 * Desc: Contains the heart of easy MD viewer.
 * Deps: none
 * Copyright (c) 2026 Andres Trujillo [Mateus] byUwUr
 * https://github.com/byuwur/easy-md-viewer
 */

(function (global) {
  /* --- INITIALIZATION --- */
  if (global.byMDviewer?.initialized) return;

  /* --- METADATA --- */
  byMDviewer.VERSION = "2.7"; // 2026-11-05

  /* --- CONSTANTS --- */
  const ESCAPABLE = /[\\`*{}\[\]()#+\-.!_>~|]/;

  const SAFE_LINK_PROTOCOLS = new Set(["http:", "https:", "mailto:", "tel:", "ftp:", "ftps:"]);

  const SAFE_IMAGE_PROTOCOLS = new Set(["http:", "https:"]);

  const HEADING_IDS = Symbol("headingIds");

  /* --- APPEARANCE --- */
  const extraPalettes = new Set([
    "dracula",
    "darcula",
    "nord",
    "catppuccin",
    "catppuccin-frappe",
    "catppuccin-macchiato",
    "rose-pine",
    "rose-pine-moon",
    "gruvbox",
    "gruvbox-material",
    "tokyo-night",
    "tokyo-storm",
    "tokyo-moon",
    "one",
    "material",
    "material-ocean",
    "night-owl",
    "synthwave",
    "ayu",
    "everforest",
    "kanagawa",
    "selenized",
    "vscode",
    "monokai-dimmed",
    "discord",
    "slack",
    "bonyur",
    "sakura",
    "bubblegum",
    "candy",
    "rose-gold",
    "lavender",
    "cyberpunk",
    "sunset",
    "volcano",
    "amber",
    "terminal",
    "paper",
    "ink",
    "ocean",
    "forest",
    "mint",
    "ice",
    "sepia"
  ]);
  const warnedPalettes = new Set();
  const warnMissingThemes = (element, palette = element.dataset.theme) => {
    if (!extraPalettes.has(palette) || warnedPalettes.has(palette)) return;
    const document = element.ownerDocument;
    if (document.defaultView.getComputedStyle(document.documentElement).getPropertyValue("--by-md-themes-loaded").trim() === "1") return;
    warnedPalettes.add(palette);
    console.warn(`easy-md-viewer: Palette "${palette}" requires md.themes.css. Import it after md.css. https://byuwur.github.io/easy-md-viewer/`);
  };

  /** Explicit appearance options override markup; omitted values preserve the container's state. */
  const applyAppearance = (element, options) => {
    const { theme, palette, fontSize } = options;
    if (theme != null && !["light", "dark"].includes(theme)) throw new RangeError("Theme must be light or dark.");
    if (palette != null && (typeof palette !== "string" || !/^[a-z][\w-]*$/i.test(palette) || ["light", "dark"].includes(palette))) throw new RangeError("Palette must be a CSS theme name; use theme for light or dark.");
    warnMissingThemes(element, palette ?? element.dataset.theme);
    const size = typeof fontSize === "number" ? `${Math.max(0.5, Math.min(3, fontSize))}rem` : typeof fontSize === "string" ? `clamp(0.5rem, ${fontSize}, 3rem)` : "";
    if (fontSize != null && (typeof fontSize === "number" ? !Number.isFinite(fontSize) : typeof fontSize !== "string" || !CSS.supports("font-size", size))) throw new RangeError("Font size must be a finite multiplier or a CSS size.");
    if (theme != null || palette != null) {
      const mode = theme ?? (["light", "dark"].includes(element.dataset.theme) ? element.dataset.theme : element.classList.contains("dark") ? "dark" : "light");
      element.classList.toggle("light", mode === "light");
      element.classList.toggle("dark", mode === "dark");
      if (palette != null) element.dataset.theme = palette;
      else if (["light", "dark"].includes(element.dataset.theme)) element.dataset.theme = mode;
    }
    if (fontSize != null) {
      element.style.fontSize = size;
      element.dataset.byViewDefaultFontSize = element.style.fontSize;
    }
  };

  /* --- CONTROLS --- */
  // Mirrored across the family so each viewer can run without a shared runtime.
  // Mirrored across the family so each viewer can run without a shared runtime.
  /**
   * Adds container light/dark controls, retaining legacy stylesheet links as a fallback.
   * @param {HTMLElement} element Viewer container and theme owner.
   * @param {HTMLElement} controls Toolbar control group.
   * @param {string} filename Legacy theme stylesheet basename.
   * @returns {HTMLButtonElement} Theme toggle button.
   */
  const appendThemeToggle = (element, controls, filename) => {
    const escapedFilename = filename.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const themePattern = new RegExp(`^([^?#]*/)?${escapedFilename}\\.(light|dark)\\.css([?#].*)?$`, "i");
    const stylesheet = [document.getElementById("byVIEWtheme"), ...document.querySelectorAll('link[rel~="stylesheet"]')].find((link) => link && themePattern.test(link.getAttribute("href") || ""));
    // Explicit container state takes precedence over a shared legacy stylesheet.
    const localTheme = (target) => {
      if (["light", "dark"].includes(target.dataset.theme)) return target.dataset.theme;
      if (target.classList.contains("dark")) return "dark";
      if (target.classList.contains("light")) return "light";
      return target.dataset.theme ? "light" : null;
    };
    const legacyTheme = () => (stylesheet?.isConnected ? (stylesheet.getAttribute("href") || "").match(themePattern) : null);
    const getTheme = () => localTheme(element) || legacyTheme()?.[2].toLowerCase() || "light";
    const button = document.createElement("button");
    button.type = "button";
    button.className = "byVIEWthemeToggle";
    button.innerHTML =
      '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M21 12.8A9 9 0 0 1 11.2 3 9 9 0 1 0 21 12.8Z"/></svg><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4m0-14.2-1.4 1.4M6.3 17.7l-1.4 1.4"/></svg>';
    const sync = () => {
      const next = getTheme() === "dark" ? "light" : "dark";
      const toggles = !localTheme(element) && legacyTheme() ? [button, ...document.querySelectorAll(".byMDdocument > .byVIEWtoolbar > .byVIEWcontrols > .byVIEWthemeToggle")] : [button];
      for (const toggle of toggles) {
        // A legacy link must not change the controls of independently themed viewers.
        if (toggle !== button && localTheme(toggle.closest(".byMDdocument"))) continue;
        toggle.title = `Switch to ${next} theme`;
        toggle.setAttribute("aria-label", toggle.title);
      }
    };
    button.addEventListener("click", () => {
      const next = getTheme() === "dark" ? "light" : "dark";
      if (!localTheme(element) && legacyTheme()) {
        const href = stylesheet.getAttribute("href");
        stylesheet.setAttribute(
          "href",
          href.replace(themePattern, (_, path = "", theme, suffix = "") => `${path}${filename}.${next}.css${suffix}`)
        );
      } else if (element.dataset.theme && !["light", "dark"].includes(element.dataset.theme)) {
        // Named palettes stay selected while only the mode changes.
        element.classList.toggle("light", next === "light");
        element.classList.toggle("dark", next === "dark");
      } else if (element.hasAttribute("data-theme") || (!element.classList.contains("light") && !element.classList.contains("dark"))) {
        element.dataset.theme = next;
      } else {
        element.classList.toggle("light", next === "light");
        element.classList.toggle("dark", next === "dark");
      }
      sync();
    });
    button.addEventListener("focus", sync);
    button.addEventListener("pointerenter", sync);
    sync();
    return controls.appendChild(button);
  };

  /**
   * Adds text size controls for a renderer.
   * @param {HTMLElement} element - Renderer whose font size is changed.
   * @param {HTMLElement} controls - Toolbar that receives the controls.
   * @return {HTMLElement} The text size button group.
   */
  const appendFontSizeControls = (element, controls) => {
    element.dataset.byViewDefaultFontSize ??= element.style.fontSize;
    const sizes = document.createElement("div");
    sizes.className = "byVIEWfontSizes";
    controls.appendChild(sizes);
    const getSize = () => (parseFloat(getComputedStyle(element).fontSize) || 16) / (parseFloat(getComputedStyle(document.documentElement).fontSize) || 16);
    const decrease = document.createElement("button");
    const increase = document.createElement("button");
    const reset = document.createElement("button");
    reset.textContent = "A";
    decrease.textContent = "A-";
    increase.textContent = "A+";
    for (const [button, title] of [
      [decrease, "Decrease text size"],
      [reset, "Reset text size"],
      [increase, "Increase text size"]
    ]) {
      button.type = "button";
      button.className = "byVIEWfontSize";
      button.title = title;
      button.setAttribute("aria-label", title);
      sizes.appendChild(button);
    }
    const sync = () => {
      const size = getSize();
      decrease.disabled = size <= 0.5;
      increase.disabled = size >= 3;
    };
    for (const [button, step] of [
      [decrease, -0.125],
      [increase, 0.125]
    ]) {
      button.addEventListener("click", () => {
        const size = Math.max(0.5, Math.min(3, getSize() + step));
        element.style.fontSize = `${size}rem`;
        sync();
      });
    }
    reset.addEventListener("click", () => {
      element.style.fontSize = element.dataset.byViewDefaultFontSize;
      sync();
    });
    sync();
    return sizes;
  };

  /**
   * Add a copy action for the complete source, including content outside the visible rendered chunk.
   * @param {HTMLElement} controls Toolbar control group.
   * @param {Function} getText Callback that returns the text to copy.
   * @param {string} label Human-readable label.
   * @returns {void}
   */
  const appendCopyButton = (controls, getText, label) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "byVIEWcopy";
    button.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" aria-hidden="true" focusable="false"><!--!Font Awesome Free 7.3.1 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2026 Fonticons, Inc.--><path d="M288 64C252.7 64 224 92.7 224 128L224 384C224 419.3 252.7 448 288 448L480 448C515.3 448 544 419.3 544 384L544 183.4C544 166 536.9 149.3 524.3 137.2L466.6 81.8C454.7 70.4 438.8 64 422.3 64L288 64zM160 192C124.7 192 96 220.7 96 256L96 512C96 547.3 124.7 576 160 576L352 576C387.3 576 416 547.3 416 512L416 496L352 496L352 512L160 512L160 256L176 256L176 192L160 192z"/></svg>`;
    const caption = document.createElement("span");
    caption.setAttribute("aria-live", "polite");
    button.appendChild(caption);
    const reset = () => {
      if (button.dataset.state === "error") return;
      delete button.dataset.state;
      caption.textContent = "Copy";
      button.title = label;
      button.setAttribute("aria-label", label);
    };
    reset();
    button.addEventListener("mouseleave", reset);
    button.addEventListener("focusout", reset);
    controls.appendChild(button);
    button.addEventListener("click", async (event) => {
      button.disabled = true;
      let message = "Copied!";
      try {
        await navigator.clipboard.writeText(getText(event));
        caption.textContent = message;
        button.dataset.state = "success";
      } catch {
        caption.textContent = "Failed";
        button.dataset.state = "error";
        message = "Copy failed. Check clipboard access.";
      } finally {
        button.disabled = false;
        button.title = `${message} ${label}`;
        button.setAttribute("aria-label", button.title);
      }
    });
  };

  /**
   * innerText needs a rendered node to preserve paragraph and code line breaks.
   * @param {HTMLElement} element DOM element owned by this operation.
   * @returns {string}
   */
  const getPlainText = (element) => {
    const copy = element.cloneNode(true);
    copy.querySelectorAll(".byVIEWtoolbar").forEach((toolbar) => toolbar.remove());
    // Flatten code presentation so visual rows cannot add line breaks to copied source.
    copy.querySelectorAll(".byMDcodeBlock code").forEach((code) => code.replaceChildren(code.textContent));
    copy.style.cssText += "; position: fixed; top: 0; left: -10000rem; opacity: 0; pointer-events: none;";
    copy.style.width = `${element.getBoundingClientRect().width / parseFloat(getComputedStyle(document.documentElement).fontSize)}rem`;
    copy.setAttribute("aria-hidden", "true");
    document.body.appendChild(copy);
    try {
      return copy.innerText;
    } finally {
      copy.remove();
    }
  };

  /**
   * Attach the enabled theme, size, and copy controls to this renderer instance.
   * @param {HTMLElement} element DOM element owned by this operation.
   * @param {Object} options Options that configure this operation.
   * @param {string} filename File name or relative asset path.
   * @param {unknown} source Source data consumed without taking ownership of its storage.
   * @returns {void}
   */
  const appendViewerControls = (element, options, filename, source) => {
    const toolbar = document.createElement("div");
    toolbar.className = "byVIEWtoolbar";
    toolbar.dataset.size = ["xs", "small", "regular", "large", "xl"].includes(options.controlsSize) ? options.controlsSize : "regular";
    element.classList.toggle("byVIEWcompact", options.controlsCompact !== false);
    element.classList.toggle("byVIEWbottom", options.controlsPosition === "bottom");
    const controls = document.createElement("div");
    controls.className = "byVIEWcontrols";
    controls.setAttribute("role", "group");
    controls.setAttribute("aria-label", "Viewer controls");
    const info = document.createElement("small");
    info.className = "byVIEWinfo";
    info.innerHTML = /* HTML */ `<a href="https://github.com/byuwur/easy-md-viewer" target="_blank" rel="noopener noreferrer">easy-md-viewer</a> · v${byMDviewer.VERSION} ·
      <a href="https://byuwur.co" target="_blank" rel="noopener noreferrer">@byUwUr</a>`;
    if (options.credits !== false) toolbar.appendChild(info);
    if (options.themeToggle) appendThemeToggle(element, controls, filename);
    if (options.fontSizeControls) appendFontSizeControls(element, controls);
    if (options.copyButton) appendCopyButton(controls, (event) => (event.shiftKey ? source : getPlainText(element)), "Copy text (Shift+click for Markdown)");
    if (controls.childNodes.length) toolbar.appendChild(controls);
    if (options.toolbar === false || !toolbar.childNodes.length) {
      element.classList.remove("byVIEWbottom");
      return;
    }
    if (options.controlsPosition === "bottom") element.appendChild(toolbar);
    else element.prepend(toolbar);
  };

  /* --- PARSING --- */
  /**
   * Returns the amount of leading indentation, treating tabs as four spaces.
   * @param {string} line - Source line.
   * @return {number} Indentation width.
   */
  const getIndent = (line) => {
    let width = 0;
    for (const char of line) {
      if (char === " ") width += 1;
      else if (char === "\t") width += 4 - (width % 4);
      else break;
    }
    return width;
  };

  /**
   * Removes up to the requested indentation width from a line.
   * @param {string} line - Source line.
   * @param {number} width - Width to remove.
   * @return {string} De-indented line.
   */
  const removeIndent = (line, width) => {
    let removed = 0;
    let i = 0;
    while (i < line.length && removed < width) {
      if (line[i] === " ") {
        removed += 1;
        i += 1;
        continue;
      }
      if (line[i] === "\t") {
        removed += 4 - (removed % 4);
        i += 1;
        continue;
      }
      break;
    }
    return line.slice(i);
  };

  /**
   * Checks whether a URL is safe to assign to href/src.
   * Relative URLs and anchors are allowed.
   *
   * @param {string} value - URL candidate.
   * @param {boolean} image - Whether this URL will be used as an image source.
   * @return {boolean} True when the URL is allowed.
   */
  const isSafeUrl = (value, image = false) => {
    if (typeof value !== "string") return false;
    const url = value.trim();
    if (!url) return false;
    // Remove ASCII controls and whitespace only for protocol inspection.
    // This prevents strings such as "java\nscript:" from bypassing the protocol check.
    const protocolProbe = url.replace(/[\u0000-\u0020\u007f]+/g, "");
    const protocolMatch = protocolProbe.match(/^([a-zA-Z][a-zA-Z\d+.-]*):/);
    if (!protocolMatch) return true;
    const protocol = `${protocolMatch[1].toLowerCase()}:`;
    return (image ? SAFE_IMAGE_PROTOCOLS : SAFE_LINK_PROTOCOLS).has(protocol);
  };

  /**
   * Finds the length of a run of the same character.
   *
   * @param {string} text - Source text.
   * @param {number} start - Run start.
   * @return {number} Run length.
   */
  const markerRun = (text, start) => {
    let end = start + 1;
    while (end < text.length && text[end] === text[start]) end += 1;
    return end - start;
  };

  /**
   * Finds a closing backtick run with exactly the opening run's length.
   * Skips shorter and longer runs in full so they remain code content.
   * @param {string} text - Source text.
   * @param {number} start - Search offset immediately after the opening run.
   * @param {number} length - Number of backticks in the opening run.
   * @return {number} Closing run's start index, or -1 when no match exists.
   */
  const findClosingCodeRun = (text, start, length) => {
    for (let index = text.indexOf("`", start); index !== -1; ) {
      const run = markerRun(text, index);
      if (run === length) return index;
      index = text.indexOf("`", index + run);
    }
    return -1;
  };

  /**
   * Finds the next unescaped occurrence of a delimiter.
   * Code spans are skipped while searching.
   *
   * @param {string} text
   * @param {string} delimiter
   * @param {number} start
   * @return {number}
   */
  const findClosingDelimiter = (text, delimiter, start) => {
    for (let i = start; i <= text.length - delimiter.length; i++) {
      if (text[i] === "\\") {
        i += 1;
        continue;
      }
      if (text[i] === "`") {
        const run = markerRun(text, i);
        const close = findClosingCodeRun(text, i + run, run);
        if (close !== -1) {
          i = close + run - 1;
          continue;
        }
        i += run - 1;
        continue;
      }
      if (text.startsWith(delimiter, i)) return i;
    }
    return -1;
  };

  /**
   * Finds a matching closing square bracket,
   * allowing nested brackets.
   *
   * @param {string} text
   * @param {number} open
   * @return {number}
   */
  const findClosingBracket = (text, open) => {
    let depth = 0;
    for (let i = open; i < text.length; i++) {
      if (text[i] === "\\") {
        i += 1;
        continue;
      }
      if (text[i] === "`") {
        const run = markerRun(text, i);
        const close = findClosingCodeRun(text, i + run, run);
        if (close !== -1) {
          i = close + run - 1;
          continue;
        }
        i += run - 1;
        continue;
      }
      if (text[i] === "[") depth += 1;
      else if (text[i] === "]") {
        depth -= 1;
        if (depth === 0) return i;
      }
    }
    return -1;
  };

  /**
   * Finds the closing parenthesis for an inline link destination.
   * Nested parentheses and quoted titles are supported.
   *
   * @param {string} text
   * @param {number} open
   * @return {number}
   */
  const findClosingParen = (text, open) => {
    let depth = 0;
    let quote = null;
    for (let i = open; i < text.length; i++) {
      const char = text[i];
      if (char === "\\") {
        i += 1;
        continue;
      }
      if (quote) {
        if (char === quote) quote = null;
        continue;
      }
      if (char === '"' || char === "'") {
        quote = char;
        continue;
      }
      if (char === "(") depth += 1;
      else if (char === ")") {
        depth -= 1;
        if (depth === 0) return i;
      }
    }
    return -1;
  };

  /**
   * Parses a Markdown inline-link destination and optional title.
   *
   * @param {string} raw
   * @return {{url:string,title:string}|null}
   */
  const parseDestination = (raw) => {
    const source = raw.trim();
    if (!source) return null;
    let url = "";
    let rest = "";
    if (source[0] === "<") {
      let close = -1;
      for (let i = 1; i < source.length; i++) {
        if (source[i] === "\\") {
          i += 1;
          continue;
        }
        if (source[i] === ">") {
          close = i;
          break;
        }
      }
      if (close === -1) return null;
      url = source.slice(1, close);
      rest = source.slice(close + 1).trim();
    } else {
      let depth = 0;
      let i = 0;
      for (; i < source.length; i++) {
        const char = source[i];
        if (char === "\\") {
          i += 1;
          continue;
        }
        if (char === "(") depth += 1;
        else if (char === ")" && depth > 0) depth -= 1;
        else if (/\s/.test(char) && depth === 0) break;
      }
      url = source.slice(0, i);
      rest = source.slice(i).trim();
    }
    if (!url) return null;
    url = url.replace(/\\([\\()<>])/g, "$1");
    let title = "";
    if (rest) {
      const first = rest[0];
      const last = rest[rest.length - 1];
      const validPair = (first === '"' && last === '"') || (first === "'" && last === "'") || (first === "(" && last === ")");
      if (!validPair) return null;
      title = rest.slice(1, -1).replace(/\\([\\"'()])/g, "$1");
    }
    return {
      url,
      title
    };
  };

  /**
   * Converts a small safe subset
   * of HTML entities to text.
   *
   * @param {string} entity
   * @return {string|null}
   */
  const decodeEntity = (entity) => {
    const named = {
      "&amp;": "&",
      "&lt;": "<",
      "&gt;": ">",
      "&quot;": '"',
      "&apos;": "'"
    };
    if (named[entity]) return named[entity];
    let match = entity.match(/^&#(\d+);$/);
    if (match) {
      const code = Number(match[1]);
      if (Number.isInteger(code) && code >= 0 && code <= 0x10ffff) return String.fromCodePoint(code);
    }
    match = entity.match(/^&#x([\da-fA-F]+);$/);
    if (match) {
      const code = Number.parseInt(match[1], 16);
      if (Number.isInteger(code) && code >= 0 && code <= 0x10ffff) return String.fromCodePoint(code);
    }
    return null;
  };

  /**
   * Produces plain text suitable
   * for image alt text.
   * @param {string} text Text to format or render.
   * @returns {string}
   */
  const plainText = (text) => text.replace(/\\([\\`*{}\[\]()#+\-.!_>~|])/g, "$1").replace(/[`*_~]/g, "");

  /**
   * Converts rendered heading text into a GitHub-style anchor slug.
   *
   * @param {string} value
   * @return {string}
   */
  const headingSlug = (value) =>
    value
      .toLowerCase()
      .trim()
      .replace(/\s/g, " ")
      .replace(/[^\p{L}\p{M}\p{N}\p{Pc} -]/gu, "")
      .replace(/ /g, "-");

  /**
   * Generates a document-wide unique heading ID.
   *
   * @param {string} value
   * @param {Object} options
   * @return {string}
   */
  const headingId = (value, options) => {
    const occurrences = options[HEADING_IDS];
    const original = headingSlug(value);
    let result = original;
    while (Object.prototype.hasOwnProperty.call(occurrences, result)) {
      occurrences[original] += 1;
      result = `${original}-${occurrences[original]}`;
    }
    occurrences[result] = 0;
    return result;
  };

  /**
   * Trims punctuation commonly following
   * a bare URL in prose.
   * @param {unknown} value Value supplied by the caller.
   * @returns {string}
   */
  const trimBareUrl = (value) => {
    let url = value;
    while (/[.,!?;:]$/.test(url)) url = url.slice(0, -1);
    const pairs = [
      ["(", ")"],
      ["[", "]"]
    ];
    for (const [open, close] of pairs) {
      while (url.endsWith(close)) {
        const opens = [...url].filter((char) => char === open).length;
        const closes = [...url].filter((char) => char === close).length;
        if (closes <= opens) break;
        url = url.slice(0, -1);
      }
    }
    return url;
  };

  /**
   * One inline grammar serves rendering and editing. Ranges include delimiters; body ranges exclude them.
   * UTF-16 offsets stay relative to the original argument, including recursively parsed children.
   */
  const inlineTokens = (text, options = {}, base = 0, depth = 0) => {
    // Deep input stays literal instead of exhausting recursion in either rendering or editing.
    if (depth >= 32) return [{ type: "text", from: base, to: base + text.length, text }];
    const tokens = [];
    let start = 0;
    const literal = (end) => {
      if (end > start) tokens.push({ type: "text", from: base + start, to: base + end, text: text.slice(start, end) });
    };
    const formatted = (type, from, to, bodyFrom, bodyTo, extra = {}) => {
      literal(from);
      const token = { type, from: base + from, to: base + to, bodyFrom: base + bodyFrom, bodyTo: base + bodyTo, ...extra };
      if (!["code", "image", "entity", "escape"].includes(type) && !extra.auto) token.children = inlineTokens(text.slice(bodyFrom, bodyTo), options, base + bodyFrom, depth + 1);
      tokens.push(token);
      start = to;
      return to;
    };
    for (let i = 0; i < text.length; ) {
      const char = text[i];
      if (char === "\\" && i + 1 < text.length && ESCAPABLE.test(text[i + 1])) {
        i = formatted("escape", i, i + 2, i + 1, i + 2, { text: text[i + 1] });
        continue;
      }
      if (char === "`") {
        const run = markerRun(text, i),
          close = findClosingCodeRun(text, i + run, run);
        if (close !== -1) {
          let value = text.slice(i + run, close).replace(/\n/g, " ");
          if (/^\s.*\s$/.test(value) && /\S/.test(value)) value = value.slice(1, -1);
          i = formatted("code", i, close + run, i + run, close, { text: value });
          continue;
        }
        i += run;
        continue;
      }
      const image = options.withImages !== false && text.startsWith("![", i);
      if (image || (options.withLinks !== false && char === "[")) {
        const open = image ? i + 1 : i,
          close = findClosingBracket(text, open);
        if (close !== -1 && text[close + 1] === "(") {
          const end = findClosingParen(text, close + 1);
          const destination = end === -1 ? null : parseDestination(text.slice(close + 2, end));
          if (destination && isSafeUrl(destination.url, image)) {
            i = formatted(image ? "image" : "link", i, end + 1, open + 1, close, { url: destination.url, title: destination.title, text: plainText(text.slice(open + 1, close)) });
            continue;
          }
        }
      }
      if (options.withLinks !== false && char === "<") {
        const close = text.indexOf(">", i + 1);
        if (close !== -1) {
          const value = text.slice(i + 1, close);
          const url = /^(?:https?|ftp|ftps):\/\/[^\s<>]+$/i.test(value) && isSafeUrl(value);
          const email = /^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(value);
          if (url || email) {
            i = formatted("link", i, close + 1, i + 1, close, { url: email ? `mailto:${value}` : value, auto: true });
            continue;
          }
        }
      }
      if (options.withLinks !== false) {
        const rest = text.slice(i),
          url = rest.match(/^https?:\/\/[^\s<>"']+/i);
        const previous = i > 0 ? text[i - 1] : "";
        const email = /[\w.%+-]/.test(previous) ? null : rest.match(/^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
        const value = url ? trimBareUrl(url[0]) : email?.[0];
        if (value && (email || isSafeUrl(value))) {
          // Autolink labels are literal, rather than recursively parsed Markdown.
          literal(i);
          tokens.push({ type: "link", from: base + i, to: base + i + value.length, bodyFrom: base + i, bodyTo: base + i + value.length, url: email ? `mailto:${value}` : value, auto: true, text: value });
          i += value.length;
          start = i;
          continue;
        }
      }
      let matched = false;
      for (const [delimiter, type] of [
        ["***", "strongEm"],
        ["___", "strongEm"],
        ["**", "strong"],
        ["__", "strong"],
        ["~~", "del"],
        ["*", "em"],
        ["_", "em"]
      ]) {
        if (!text.startsWith(delimiter, i) || (type === "del" && options.withStrikethrough === false)) continue;
        if (delimiter === "_" && /[\p{L}\p{N}]/u.test(text[i - 1] || "") && /[\p{L}\p{N}]/u.test(text[i + 1] || "")) continue;
        const close = findClosingDelimiter(text, delimiter, i + delimiter.length);
        if (close <= i + delimiter.length) continue;
        if (delimiter === "_" && /[\p{L}\p{N}]/u.test(text[close - 1] || "") && /[\p{L}\p{N}]/u.test(text[close + 1] || "")) continue;
        i = formatted(type, i, close + delimiter.length, i + delimiter.length, close);
        matched = true;
        break;
      }
      if (matched) continue;
      if (char === "&") {
        const match = text.slice(i).match(/^&(?:amp|lt|gt|quot|apos|#\d+|#x[\da-fA-F]+);/);
        const value = match && decodeEntity(match[0]);
        if (value !== null && value !== undefined) {
          i = formatted("entity", i, i + match[0].length, i, i + match[0].length, { text: value });
          continue;
        }
      }
      i += 1;
    }
    literal(text.length);
    return tokens;
  };

  /**
   * Matches a fenced-code opening line.
   *
   * @param {string} line
   * @return {RegExpMatchArray|null}
   */
  const matchFence = (line) => {
    const match = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
    return match && (match[1][0] !== "`" || !match[2].includes("`")) ? match : null;
  };

  /**
   * Removes HTML comments and hidden markers while preserving code content.
   * Raw HTML is not rendered by easy-md-viewer, but Markdown comments should remain invisible.
   *
   * @param {string[]} lines - Source lines at the current nesting level.
   * @param {Object} options - Renderer options used to detect container boundaries.
   * @return {string[]} Lines with comments outside code removed.
   */
  const stripComments = (lines, options) => {
    const output = [];
    let inComment = false;
    let fence = null;
    for (let index = 0; index < lines.length; index++) {
      const line = lines[index];
      // Preserve everything inside fenced code.
      if (fence) {
        output.push(line);
        if (fence.close.test(line)) fence = null;
        continue;
      }
      // Detect fenced code before looking for comments.
      if (!inComment) {
        const opening = matchFence(line);
        if (opening) {
          const marker = opening[1][0];
          const minimumLength = opening[1].length;
          fence = {
            close: new RegExp(`^ {0,3}${marker === "`" ? "`" : "~"}{${minimumLength},}\\s*$`)
          };
          output.push(line);
          continue;
        }
      }
      // Containers keep their raw content until prefixes/indentation are removed.
      if (!inComment) {
        let next;
        if (/^ {0,3}>/.test(line)) next = readBlockquote(lines, index).next;
        else if (!isHorizontalRule(line) && matchListItem(line)) next = readListItem(lines, index, options).next;
        if (next !== undefined) {
          for (let cursor = index; cursor < next; cursor++) output.push(lines[cursor]);
          index = next - 1;
          continue;
        }
      }
      let cursor = 0;
      let visible = "";
      while (cursor < line.length) {
        // Continue consuming a multiline HTML comment.
        if (inComment) {
          const close = line.indexOf("-->", cursor);
          if (close === -1) {
            cursor = line.length;
            break;
          }
          inComment = false;
          cursor = close + 3;
          continue;
        }
        // Preserve escaped backticks as literal Markdown.
        if (line[cursor] === "\\" && line[cursor + 1] === "`") {
          visible += line.slice(cursor, cursor + 2);
          cursor += 2;
          continue;
        }
        // Preserve complete inline code spans before looking for comments inside them.
        if (line[cursor] === "`") {
          const run = markerRun(line, cursor);
          const close = findClosingCodeRun(line, cursor + run, run);

          if (close !== -1) {
            visible += line.slice(cursor, close + run);
            cursor = close + run;
            continue;
          }
          visible += "`".repeat(run);
          cursor += run;
          continue;
        }
        // Hide HTML comments outside code spans.
        if (line.startsWith(`<!--`, cursor)) {
          inComment = true;
          cursor += 4;
          continue;
        }
        visible += line[cursor];
        cursor += 1;
      }
      output.push(/^\s*\[\/\/\]:\s*#\s*(?:\(.*\)|".*"|'.*')\s*$/.test(visible) ? "" : visible);
    }
    return output;
  };

  /**
   * Checks whether a line is a Markdown horizontal rule.
   * @param {string} line One source line.
   * @returns {boolean}
   */
  const isHorizontalRule = (line) => {
    const value = line.trim();
    if (!value) return false;
    return /^(?:\*\s*){3,}$/.test(value) || /^(?:-\s*){3,}$/.test(value) || /^(?:_\s*){3,}$/.test(value);
  };

  /**
   * Parses a list-item opener.
   *
   * @param {string} line
   * @return {{indent:number,ordered:boolean,start:number,contentIndent:number,content:string}|null}
   */
  const matchListItem = (line) => {
    const match = line.match(/^(\s*)([-+*]|(\d+)[.)])\s+(.*)$/);
    if (!match) return null;
    const indent = getIndent(match[1]);
    const marker = match[2];
    const ordered = /^\d/.test(marker);
    return {
      indent,
      ordered,
      start: ordered ? Number(match[3]) : 1,
      contentIndent: indent + marker.length + 1,
      content: match[4]
    };
  };

  /**
   * Splits a GFM table row while respecting
   * escaped pipes and inline code.
   *
   * @param {string} line
   * @return {{from: number, to: number, text: string}[]}
   */
  const tableCells = (line) => {
    let source = line.trim();
    let base = line.length - line.trimStart().length;
    if (source.startsWith("|")) {
      source = source.slice(1);
      base++;
    }
    if (source.endsWith("|") && !source.endsWith("\\|")) source = source.slice(0, -1);
    const cells = [];
    let cell = "",
      start = 0;
    // Trim displayed cells without losing their positions in the unmodified source line.
    const push = (end) => {
      const leading = cell.length - cell.trimStart().length;
      const from = base + start + leading;
      cells.push({ from, to: Math.max(from, base + start + cell.trimEnd().length), text: cell.trim() });
      start = end + 1;
    };
    for (let i = 0; i < source.length; i++) {
      if (source[i] === "\\" && i + 1 < source.length) {
        cell += source[i] + source[i + 1];
        i += 1;
        continue;
      }
      if (source[i] === "`") {
        const run = markerRun(source, i);
        const close = findClosingCodeRun(source, i + run, run);
        if (close !== -1) {
          cell += source.slice(i, close + run);
          i = close + run - 1;
          continue;
        }
        cell += "`".repeat(run);
        i += run - 1;
        continue;
      }
      if (source[i] === "|") {
        push(i);
        cell = "";
        continue;
      }
      cell += source[i];
    }
    push(source.length);
    return cells;
  };

  const splitTableRow = (line) => tableCells(line).map((cell) => cell.text);

  /**
   * Parses a Markdown table separator row.
   *
   * @param {string} line
   * @return {(string|null)[]|null}
   */
  const parseTableDelimiter = (line) => {
    if (!line.includes("|")) return null;
    const cells = splitTableRow(line);
    if (!cells.length) return null;
    const alignments = [];
    for (const cell of cells) {
      const value = cell.replace(/\s/g, "");
      if (!/^:?-{3,}:?$/.test(value)) return null;
      if (value.startsWith(":") && value.endsWith(":")) alignments.push("center");
      else if (value.endsWith(":")) alignments.push("right");
      else if (value.startsWith(":")) alignments.push("left");
      else alignments.push(null);
    }
    return alignments;
  };

  /**
   * Determines whether a line begins a new
   * block that should terminate a paragraph.
   *
   * @param {string[]} lines
   * @param {number} index
   * @param {Object} options
   * @return {boolean}
   */
  const startsBlock = (lines, index, options) => {
    const line = lines[index] || "";
    if (!line.trim()) return true;
    if (matchFence(line)) return true;
    if (/^ {0,3}#{1,6}(?:\s+|$)/.test(line)) return true;
    if (/^ {0,3}>/.test(line)) return true;
    if (isHorizontalRule(line)) return true;
    if (matchListItem(line)) return true;
    if (options.withTables && index + 1 < lines.length && line.includes("|") && parseTableDelimiter(lines[index + 1])) return true;
    return false;
  };

  /**
   * Reads a blockquote and removes one level of quote prefixes.
   * @param {string[]} lines - Source lines.
   * @param {number} start - Opening line index.
   * @return {{lines: string[], next: number}} Quote content and first following line.
   */
  const readBlockquote = (lines, start) => {
    const quoteLines = [];
    let index = start;
    while (index < lines.length) {
      const match = lines[index].match(/^ {0,3}> ?(.*)$/);
      if (match) {
        quoteLines.push(match[1]);
        index += 1;
        continue;
      }
      if (!lines[index].trim() && index + 1 < lines.length && /^ {0,3}>/.test(lines[index + 1])) {
        quoteLines.push("");
        index += 1;
        continue;
      }
      break;
    }
    return { lines: quoteLines, next: index };
  };

  /**
   * Reads one list item's continuations and nested blocks.
   * @param {string[]} lines - Source lines.
   * @param {number} start - Opening line index.
   * @param {Object} options - Renderer options used to detect block boundaries.
   * @return {{lines: string[], next: number}} Item content and first following line.
   */
  const readListItem = (lines, start, options) => {
    const item = matchListItem(lines[start]);
    const baseIndent = item.indent;
    const ordered = item.ordered;
    const itemLines = [item.content];
    let next = start + 1;
    while (next < lines.length) {
      const line = lines[next];
      const candidate = matchListItem(line);
      // A sibling starts the next item.
      // Another list at the same or lower indentation ends this list.
      if (candidate) {
        if (candidate.indent <= baseIndent) break;
        itemLines.push(removeIndent(line, item.contentIndent));
        next += 1;
        continue;
      }
      // Keep blank-line handling strict so normal content after lists does not get swallowed.
      if (!line.trim()) {
        let lookahead = next + 1;
        while (lookahead < lines.length && !lines[lookahead].trim()) lookahead += 1;
        if (lookahead >= lines.length) {
          next = lookahead;
          break;
        }
        const afterBlank = matchListItem(lines[lookahead]);
        if (afterBlank && afterBlank.indent === baseIndent && afterBlank.ordered === ordered) {
          next = lookahead;
          break;
        }
        if (getIndent(lines[lookahead]) > baseIndent) {
          itemLines.push("");
          next += 1;
          continue;
        }
        // A blank line followed by normal unindented content ends the list.
        next = lookahead;
        break;
      }
      // Handle indented continuations and nested blocks.
      if (getIndent(line) > baseIndent) {
        itemLines.push(removeIndent(line, item.contentIndent));
        next += 1;
        continue;
      }
      // Allow lazy continuation text inside a list item.
      // A new block terminates the lazy continuation.
      if (!startsBlock(lines, next, options)) {
        itemLines.push(line);
        next += 1;
        continue;
      }
      break;
    }
    return { lines: itemLines, next };
  };

  /**
   * Scan one physical line; the caller carries the previous result's state forward.
   * Look ahead only for table headers. This is an editing classifier, not the full block renderer.
   */
  const scanLine = (text, context = {}, next = "") => {
    const result = { type: "paragraph", bodyFrom: 0, bodyTo: text.length, state: { fence: null, table: 0 } };
    if (context.fence) {
      const fence = context.fence;
      const closing = new RegExp(`^ {0,3}${fence.marker}{${fence.length},}\\s*$`).test(text);
      result.type = closing ? "fenceClose" : "code";
      result.state.fence = closing ? null : fence;
      return result;
    }
    const fence = matchFence(text);
    if (fence) {
      result.type = "fenceOpen";
      result.language = fence[2].trim().split(/\s+/)[0] || "plain";
      result.state.fence = { marker: fence[1][0], length: fence[1].length };
      return result;
    }
    if (!text.trim()) {
      result.type = "blank";
      return result;
    }
    // Complex containers retain exact source until visual editing can map them safely.
    if (text.includes("<!--") || /^\s*\[\/\/\]:/.test(text) || /^(?: {4}|\t)/.test(text) || /^ {0,3}>\s*>/.test(text)) {
      result.type = "source";
      return result;
    }
    const heading = text.match(/^ {0,3}(#{1,6})(?:\s+|$)/);
    if (heading) {
      result.type = "heading";
      result.level = heading[1].length;
      result.bodyFrom = heading[0].length;
      result.bodyTo = Math.max(result.bodyFrom, text.replace(/\s+#+\s*$/, "").length);
      return result;
    }
    if (isHorizontalRule(text)) {
      result.type = "rule";
      return result;
    }
    if (/^ {0,3}>/.test(text)) {
      result.type = "quote";
      result.bodyFrom = text.match(/^ {0,3}> ?/)[0].length;
      return result;
    }
    if (context.table && parseTableDelimiter(text)) {
      result.type = "tableDelimiter";
      result.state.table = context.table;
      return result;
    }
    if (text.includes("|") && parseTableDelimiter(next)) {
      result.type = "tableHeader";
      result.cells = tableCells(text);
      result.state.table = result.cells.length;
      return result;
    }
    if (context.table && text.includes("|") && !startsBlock([text], 0, { withTables: false })) {
      result.type = "tableRow";
      result.cells = tableCells(text);
      result.state.table = context.table;
      return result;
    }
    const list = matchListItem(text);
    if (list) {
      if (list.indent > 0) {
        result.type = "source";
        return result;
      }
      result.type = list.ordered ? "ordered" : "bullet";
      result.number = list.start;
      result.bodyFrom = text.length - list.content.length;
      const task = list.content.match(/^\[([ xX])\]\s+/);
      if (task) {
        result.type = "task";
        result.checked = task[1].toLowerCase() === "x";
        result.checkFrom = result.bodyFrom + 1;
        result.bodyFrom += task[0].length;
      }
    }
    return result;
  };

  /* --- RENDERING --- */
  /**
   * Appends a text node to an element.
   * @param {Node} parent - Parent DOM node.
   * @param {string} text - Text to append.
   * @returns {void}
   */
  const appendText = (parent, text) => {
    if (text) parent.appendChild(document.createTextNode(text));
  };

  /**
   * Adds target/rel behavior to external links. Same-document anchor links remain in the current tab.
   *
   * @param {HTMLAnchorElement} anchor
   * @param {Object} options
   * @returns {void}
   */
  const configureAnchor = (anchor, options) => {
    if (!options.linkTarget || anchor.getAttribute("href")?.startsWith("#")) return;
    anchor.target = options.linkTarget;
    if (options.linkTarget === "_blank") anchor.rel = "noopener noreferrer";
  };

  /** Render the shared inline tokens with DOM methods; source is never interpreted as HTML. */
  const appendInline = (parent, text, options) => {
    /** Queue one atomic batch. Parsing must finish before retained entries and parser indices advance. */
    const append = (target, tokens) => {
      for (const token of tokens) {
        if (["text", "escape", "entity"].includes(token.type)) {
          appendText(target, token.text);
          continue;
        }
        const tag = { strongEm: "strong", image: "img", link: "a" }[token.type] || token.type;
        const element = document.createElement(tag);
        if (token.type === "code") {
          element.className = "byMDinlineCode";
          element.textContent = token.text;
        } else if (token.type === "image") {
          element.className = "byMDimage";
          element.src = token.url;
          element.alt = token.text;
          element.loading = "lazy";
          if (token.title) element.title = token.title;
        } else if (token.type === "link") {
          element.className = "byMDlink";
          element.href = token.url;
          if (token.title) element.title = token.title;
          configureAnchor(element, options);
          if (token.auto) element.textContent = token.text ?? text.slice(token.bodyFrom, token.bodyTo);
          else append(element, token.children);
        } else if (token.type === "strongEm") {
          const em = document.createElement("em");
          append(em, token.children);
          element.appendChild(em);
        } else append(element, token.children);
        target.appendChild(element);
      }
    };
    append(parent, inlineTokens(text, options));
  };

  /**
   * Appends one line of inline Markdown
   * and handles Markdown line breaks.
   *
   * @param {Node} parent
   * @param {string} line
   * @param {boolean} last
   * @param {Object} options
   * @returns {void}
   */
  const appendInlineLine = (parent, line, last, options) => {
    let source = line;
    let hardBreak = false;
    // Treat two trailing spaces as a hard break.
    if (/ {2,}$/.test(source)) {
      hardBreak = true;
      source = source.replace(/ {2,}$/, "");
    } else if (/\\$/.test(source) && !/\\\\$/.test(source)) {
      // Treat a trailing backslash as a hard break.
      hardBreak = true;
      source = source.slice(0, -1);
    }
    appendInline(parent, source, options);
    if (!last) {
      if (hardBreak || options.breaks) parent.appendChild(document.createElement("br"));
      else appendText(parent, "\n");
    }
  };

  /**
   * Renders a Markdown table.
   *
   * @param {Node} parent
   * @param {string[]} lines
   * @param {number} start
   * @param {Object} options
   * @return {number}
   */
  const appendTable = (parent, lines, start, options) => {
    const headers = splitTableRow(lines[start]);
    const alignments = parseTableDelimiter(lines[start + 1]);
    if (!alignments) return start;
    const table = document.createElement("table");
    table.className = "byMDtable";
    const thead = document.createElement("thead");
    const headRow = document.createElement("tr");
    for (let column = 0; column < headers.length; column++) {
      const th = document.createElement("th");
      if (alignments[column]) th.classList.add(`byMDalign-${alignments[column]}`);
      appendInline(th, headers[column], options);
      headRow.appendChild(th);
    }
    thead.appendChild(headRow);
    table.appendChild(thead);
    const tbody = document.createElement("tbody");
    let index = start + 2;
    while (index < lines.length && lines[index].trim() && lines[index].includes("|")) {
      if (startsBlock(lines, index, { ...options, withTables: false })) break;
      const cells = splitTableRow(lines[index]);
      const row = document.createElement("tr");
      const width = Math.max(headers.length, cells.length);
      for (let column = 0; column < width; column++) {
        const td = document.createElement("td");
        if (alignments[column]) td.classList.add(`byMDalign-${alignments[column]}`);
        appendInline(td, cells[column] || "", options);
        row.appendChild(td);
      }
      tbody.appendChild(row);
      index += 1;
    }
    if (tbody.childNodes.length) table.appendChild(tbody);
    parent.appendChild(table);
    return index;
  };

  /**
   * Renders a fenced code block, optionally enhanced by easy-code-viewer.
   *
   * @param {Node} parent
   * @param {string[]} lines
   * @param {number} start
   * @param {Object} options
   * @return {number}
   */
  const appendFencedCode = (parent, lines, start, options) => {
    const opening = matchFence(lines[start]);
    const marker = opening[1][0];
    const minimumLength = opening[1].length;
    const info = opening[2].trim();
    const language = info ? info.split(/\s+/)[0] : "";
    const closePattern = new RegExp(`^ {0,3}${marker === "`" ? "`" : "~"}{${minimumLength},}\\s*$`);
    const body = [];
    let index = start + 1;
    while (index < lines.length && !closePattern.test(lines[index])) {
      body.push(lines[index]);
      index += 1;
    }
    if (index < lines.length) index += 1;
    const pre = document.createElement("pre");
    pre.className = "byMDcodeBlock";
    const code = document.createElement("code");
    if (language && /^[\w.+#-]+$/.test(language)) {
      code.classList.add(`language-${language}`);
      code.dataset.language = language;
    }
    code.textContent = body.join("\n");
    if (options.codeHighlighting || options.codeLineNumbers || options.codeStatusBar) {
      if (typeof global.byCODEviewer?.highlight !== "function") {
        console.warn("easy-md-viewer: Code highlighting and code-block details require easy-code-viewer. https://byuwur.github.io/easy-code-viewer/");
        // These options belong to this render; avoid repeating the warning for each fence.
        options.codeHighlighting = options.codeLineNumbers = options.codeStatusBar = false;
      } else {
        try {
          code.replaceChildren(
            global.byCODEviewer.highlight(code.textContent, language || "plain", {
              highlighting: options.codeHighlighting,
              lineNumbers: options.codeLineNumbers,
              statusBar: options.codeStatusBar
            })
          );
        } catch {
          // Optional code presentation must not interrupt Markdown or discard the source.
        }
      }
    }
    pre.appendChild(code);
    parent.appendChild(pre);
    return index;
  };

  /**
   * Renders a blockquote recursively.
   *
   * @param {Node} parent
   * @param {string[]} lines
   * @param {number} start
   * @param {Object} options
   * @return {number}
   */
  const appendBlockquote = (parent, lines, start, options) => {
    const { lines: quoteLines, next } = readBlockquote(lines, start);
    const quote = document.createElement("blockquote");
    quote.className = "byMDblockquote";
    renderBlocks(quote, quoteLines, options);
    parent.appendChild(quote);
    return next;
  };

  /**
   * Renders ordered/unordered lists,
   * nested lists and task lists.
   *
   * @param {Node} parent
   * @param {string[]} lines
   * @param {number} start
   * @param {Object} options
   * @return {number}
   */
  const appendList = (parent, lines, start, options) => {
    const first = matchListItem(lines[start]);
    if (!first) return start;
    const baseIndent = first.indent;
    const ordered = first.ordered;
    const list = document.createElement(ordered ? "ol" : "ul");
    list.className = "byMDlist";
    if (ordered && first.start !== 1) list.start = first.start;
    let index = start;
    while (index < lines.length) {
      const item = matchListItem(lines[index]);
      if (!item || item.indent !== baseIndent || item.ordered !== ordered) break;
      const { lines: itemLines, next } = readListItem(lines, index, options);
      const li = document.createElement("li");
      li.className = "byMDlistItem";
      const taskMatch = options.withTasks ? itemLines[0].match(/^\[([ xX])\]\s+(.*)$/) : null;
      if (taskMatch) {
        li.classList.add("byMDtask");
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.disabled = true;
        checkbox.checked = taskMatch[1].toLowerCase() === "x";
        checkbox.className = "byMDtaskCheckbox";
        checkbox.setAttribute("aria-label", checkbox.checked ? "Completed task" : "Incomplete task");
        li.appendChild(checkbox);
        const content = document.createElement("div");
        content.className = "byMDtaskContent";
        itemLines[0] = taskMatch[2];
        renderBlocks(content, itemLines, options);
        li.appendChild(content);
      } else renderBlocks(li, itemLines, options);
      list.appendChild(li);
      index = next;
    }
    parent.appendChild(list);
    return index;
  };

  /**
   * Renders block-level Markdown.
   *
   * @param {Node} parent
   * @param {string[]} lines
   * @param {Object} options
   * @returns {void}
   */
  function renderBlocks(parent, lines, options) {
    lines = stripComments(lines, options);
    for (let index = 0; index < lines.length; ) {
      const line = lines[index];
      // Skip blank lines.
      if (!line.trim()) {
        index += 1;
        continue;
      }
      // Render fenced code.
      if (matchFence(line)) {
        index = appendFencedCode(parent, lines, index, options);
        continue;
      }
      // Render ATX headings from H1 through H6.
      const heading = line.match(/^ {0,3}(#{1,6})(?:\s+|$)(.*)$/);
      if (heading) {
        const element = document.createElement(`h${heading[1].length}`);
        element.className = "byMDheading";
        const content = heading[2].replace(/\s+#+\s*$/, "");
        appendInline(element, content, options);
        element.id = headingId(element.textContent, options);
        parent.appendChild(element);
        index += 1;
        continue;
      }
      // Render horizontal rules before lists because --- is ambiguous.
      if (isHorizontalRule(line)) {
        parent.appendChild(document.createElement("hr"));
        index += 1;
        continue;
      }
      // Render blockquotes.
      if (/^ {0,3}>/.test(line)) {
        index = appendBlockquote(parent, lines, index, options);
        continue;
      }
      // Render GFM tables.
      if (options.withTables && index + 1 < lines.length && line.includes("|") && parseTableDelimiter(lines[index + 1])) {
        index = appendTable(parent, lines, index, options);
        continue;
      }
      // Render ordered and unordered lists.
      if (matchListItem(line)) {
        index = appendList(parent, lines, index, options);
        continue;
      }
      // Render paragraphs until a blank line or another recognized block begins.
      const paragraphLines = [line];
      let next = index + 1;
      while (next < lines.length && lines[next].trim() && !startsBlock(lines, next, options)) {
        paragraphLines.push(lines[next]);
        next += 1;
      }
      const paragraph = document.createElement("p");
      paragraph.className = "byMDparagraph";
      paragraphLines.forEach((value, i) => appendInlineLine(paragraph, value, i === paragraphLines.length - 1, options));
      parent.appendChild(paragraph);
      index = next;
    }
  }

  /* --- PUBLIC API --- */
  /**
   * Main API.
   * Renders Markdown into an HTMLElement.
   * The Markdown source can be:
   * 1. A string.
   * 2. Another HTMLElement's textContent.
   * 3. The target element's own textContent
   *    when the second argument is omitted.
   *
   * @param {HTMLElement} element
   * @param {string|HTMLElement} [markdown]
   * @param {Object} [options]
   *
   * @param {boolean} [options.withLinks=true]
   * @param {boolean} [options.withImages=true]
   * @param {boolean} [options.withTables=true]
   * @param {boolean} [options.withTasks=true]
   * @param {boolean} [options.withStrikethrough=true]
   * @param {boolean} [options.codeHighlighting=true] - Highlights fences when easy-code-viewer is loaded.
   * @param {boolean} [options.codeLineNumbers=false] - Adds non-copying line-number gutters to fences.
   * @param {boolean} [options.codeStatusBar=false] - Shows the language and line count above fences.
   * @param {boolean} [options.breaks=false]
   * @param {string|false} [options.linkTarget="_blank"]
   * @param {boolean} [options.toolbar=true] - Show the viewer header.
   * @param {boolean} [options.credits=true] - Show attribution in the header.
   * @param {"light"|"dark"} [options.theme] - Initial mode; overrides the container.
   * @param {string} [options.palette] - Named CSS palette for data-theme.
   * @param {number|string} [options.fontSize] - Number in rem or CSS size, bounded to 0.5rem through 3rem.
   * @param {boolean} [options.themeToggle=true] - Adds the theme toggle.
   * @param {boolean} [options.fontSizeControls=true] - Adds viewer-local text size controls.
   * @param {boolean} [options.copyButton=true] - Adds a clipboard copy button.
   * @param {"xs"|"small"|"regular"|"large"|"xl"} [options.controlsSize="regular"] - Sets the control size; invalid values use regular.
   * @param {boolean} [options.controlsCompact=true] - Places attribution beside the controls, wrapping as needed.
   * @param {"top"|"bottom"} [options.controlsPosition="top"] - Keeps the toolbar at the scroll area's top or bottom while the viewer is visible; invalid values use top.
   * @returns {void}
   * @throws {TypeError|RangeError}
   */
  function byMDviewer(element, markdown, options = {}) {
    if (!(element instanceof HTMLElement)) throw new TypeError("byMDviewer: element must be an HTMLElement.");
    let source = markdown;
    // Pull Markdown from another element when supplied, otherwise use the target element's own text content.
    if (source instanceof HTMLElement) source = source.textContent;
    else if (source === undefined || source === null) source = element.textContent;
    if (typeof source !== "string") throw new TypeError("byMDviewer: markdown must be a string or HTMLElement.");
    options = {
      withLinks: true,
      withImages: true,
      withTables: true,
      withTasks: true,
      withStrikethrough: true,
      codeHighlighting: true,
      codeLineNumbers: false,
      codeStatusBar: false,
      breaks: false,
      linkTarget: "_blank",
      toolbar: true,
      credits: true,
      themeToggle: true,
      fontSizeControls: true,
      copyButton: true,
      controlsSize: "regular",
      controlsCompact: true,
      animations: true,
      appearAnimation: false,
      controlsPosition: "top",
      ...options,
      [HEADING_IDS]: Object.create(null)
    };
    applyAppearance(element, options);
    // Clear the target safely.
    element.textContent = "";
    element.classList.add("byMDdocument");
    element.classList.toggle("byVIEWmotion", options.animations !== false);
    element.classList.toggle("byVIEWappear", options.animations !== false && options.appearAnimation === true);
    if (!element.classList.contains("byVIEWready")) {
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          if (element.classList.contains("byMDdocument")) element.classList.add("byVIEWready");
        })
      );
    }
    // Normalize line endings and remove the BOM.
    const normalized = source.replace(/\r\n?/g, "\n").replace(/^\uFEFF/, "");
    const content = document.createElement("div");
    content.className = "byMDcontent";
    element.appendChild(content);
    renderBlocks(content, normalized.split("\n"), options);
    appendViewerControls(element, options, "md", source);
  }
  /**
   * Return inline tokens with UTF-16 source ranges without creating DOM.
   * @param {string} source At most 65,536 characters; this limit does not cap full-document rendering.
   * @param {Object} [options] Inline link, image, and strikethrough flags, enabled unless false.
   * @returns {Object[]} Tokens with source/body ranges and nested children where applicable.
   * @throws {TypeError|RangeError} Invalid source type or excessive length.
   */
  byMDviewer.parseInline = (source, options = {}) => {
    if (typeof source !== "string") throw new TypeError("byMDviewer.parseInline: source must be a string.");
    if (source.length > 65536) throw new RangeError("Inline parsing is limited to 65,536 characters; edit longer lines as source.");
    return inlineTokens(source, options);
  };
  /**
   * Classify one physical line for incremental editing without creating DOM.
   * @param {string} source Current source line.
   * @param {Object} [context] Previous scan result's state, or an empty object for a fresh document.
   * @param {string} [next] Next source line, used to recognize table headers.
   * @returns {Object} Line type, source ranges, and state for the following line.
   * @throws {TypeError} A supplied line is not a string.
   */
  byMDviewer.scanLine = (source, context = {}, next = "") => {
    if (typeof source !== "string" || typeof next !== "string") throw new TypeError("byMDviewer.scanLine: lines must be strings.");
    return scanLine(source, context, next);
  };
  /* --- EXPORT --- */
  global.byMDviewer = byMDviewer;
  byMDviewer.initialized = true;
})(typeof window !== "undefined" ? window : this);
