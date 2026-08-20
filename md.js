"use strict";
/*
 * File: md.js
 * Desc: Contains the heart of easy MD viewer.
 * Deps: none
 * Copyright (c) 2026 Andrés Trujillo [Mateus] byUwUr
 * https://github.com/byuwur/easy-md-viewer
 */

(function (global) {
  const ESCAPABLE = /[\\`*{}\[\]()#+\-.!_>~|]/;
  const SAFE_LINK_PROTOCOLS = new Set(["http:", "https:", "mailto:", "tel:", "ftp:", "ftps:"]);
  const SAFE_IMAGE_PROTOCOLS = new Set(["http:", "https:"]);
  const HEADING_IDS = Symbol("headingIds");

  /**
   * Appends a text node to an element.
   * @param {Node} parent - Parent DOM node.
   * @param {string} text - Text to append.
   */
  const appendText = (parent, text) => {
    if (text) parent.appendChild(document.createTextNode(text));
  };

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
        const ticks = "`".repeat(run);
        const close = text.indexOf(ticks, i + run);
        if (close !== -1) {
          i = close + run - 1;
          continue;
        }
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
        const ticks = "`".repeat(run);
        const close = text.indexOf(ticks, i + run);
        if (close !== -1) {
          i = close + run - 1;
          continue;
        }
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
   * Adds target/rel behavior to external links. Same-document anchor links remain in the current tab.
   *
   * @param {HTMLAnchorElement} anchor
   * @param {Object} options
   */
  const configureAnchor = (anchor, options) => {
    if (!options.linkTarget || anchor.getAttribute("href")?.startsWith("#")) return;
    anchor.target = options.linkTarget;
    if (options.linkTarget === "_blank") anchor.rel = "noopener noreferrer";
  };

  /**
   * Trims punctuation commonly following
   * a bare URL in prose.
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
   * Renders inline Markdown without
   * ever using innerHTML.
   */
  const appendInline = (parent, text, options) => {
    let buffer = "";
    const flush = () => {
      appendText(parent, buffer);
      buffer = "";
    };
    for (let i = 0; i < text.length; ) {
      const char = text[i];
      // Handle backslash escapes.
      if (char === "\\" && i + 1 < text.length && ESCAPABLE.test(text[i + 1])) {
        buffer += text[i + 1];
        i += 2;
        continue;
      }
      // Support arbitrary backtick-run delimiters for inline code.
      if (char === "`") {
        const run = markerRun(text, i);
        const ticks = "`".repeat(run);
        const close = text.indexOf(ticks, i + run);
        if (close !== -1) {
          flush();
          let codeText = text.slice(i + run, close).replace(/\n/g, " ");
          if (/^\s.*\s$/.test(codeText) && /\S/.test(codeText)) codeText = codeText.slice(1, -1);
          const code = document.createElement("code");
          code.className = "byMDinlineCode";
          code.textContent = codeText;
          parent.appendChild(code);
          i = close + run;
          continue;
        }
      }
      // Handle images and inline links.
      const isImage = options.withImages && text.startsWith("![", i);
      const isLink = options.withLinks && char === "[";
      if (isImage || isLink) {
        const openBracket = isImage ? i + 1 : i;
        const closeBracket = findClosingBracket(text, openBracket);
        if (closeBracket !== -1 && text[closeBracket + 1] === "(") {
          const closeParen = findClosingParen(text, closeBracket + 1);
          if (closeParen !== -1) {
            const destination = parseDestination(text.slice(closeBracket + 2, closeParen));
            if (destination && isSafeUrl(destination.url, isImage)) {
              flush();
              const label = text.slice(openBracket + 1, closeBracket);
              if (isImage) {
                const img = document.createElement("img");
                img.className = "byMDimage";
                img.src = destination.url;
                img.alt = plainText(label);
                if (destination.title) img.title = destination.title;
                img.loading = "lazy";
                parent.appendChild(img);
              } else {
                const a = document.createElement("a");
                a.className = "byMDlink";
                a.href = destination.url;
                if (destination.title) a.title = destination.title;
                configureAnchor(a, options);
                appendInline(a, label, options);
                parent.appendChild(a);
              }
              i = closeParen + 1;
              continue;
            }
          }
        }
      }
      // Handle explicit Markdown URL and email autolinks.
      if (options.withLinks && char === "<") {
        const close = text.indexOf(">", i + 1);
        if (close !== -1) {
          const value = text.slice(i + 1, close);
          const isUrl = /^(?:https?|ftp|ftps):\/\/[^\s<>]+$/i.test(value) && isSafeUrl(value);
          const isEmail = /^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(value);
          if (isUrl || isEmail) {
            flush();
            const a = document.createElement("a");
            a.className = "byMDlink";
            a.href = isEmail ? `mailto:${value}` : value;
            a.textContent = value;
            configureAnchor(a, options);
            parent.appendChild(a);
            i = close + 1;
            continue;
          }
        }
      }
      // Handle GFM-style bare URLs and email addresses.
      if (options.withLinks) {
        const rest = text.slice(i);
        const urlMatch = rest.match(/^https?:\/\/[^\s<>"']+/i);
        if (urlMatch) {
          const url = trimBareUrl(urlMatch[0]);
          if (url && isSafeUrl(url)) {
            flush();
            const a = document.createElement("a");
            a.className = "byMDlink";
            a.href = url;
            a.textContent = url;
            configureAnchor(a, options);
            parent.appendChild(a);
            i += url.length;
            continue;
          }
        }
        const previous = i > 0 ? text[i - 1] : "";
        if (!/[\w.%+-]/.test(previous)) {
          const emailMatch = rest.match(/^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
          if (emailMatch) {
            flush();
            const a = document.createElement("a");
            a.className = "byMDlink";
            a.href = `mailto:${emailMatch[0]}`;
            a.textContent = emailMatch[0];
            configureAnchor(a, options);
            parent.appendChild(a);
            i += emailMatch[0].length;
            continue;
          }
        }
      }
      // Handle combined strong emphasis.
      const triple = text.slice(i, i + 3);
      if (triple === "***" || triple === "___") {
        const close = findClosingDelimiter(text, triple, i + 3);
        if (close > i + 3) {
          flush();
          const strong = document.createElement("strong");
          const em = document.createElement("em");
          appendInline(em, text.slice(i + 3, close), options);
          strong.appendChild(em);
          parent.appendChild(strong);
          i = close + 3;
          continue;
        }
      }
      // Handle strong emphasis.
      const double = text.slice(i, i + 2);
      if (double === "**" || double === "__") {
        const close = findClosingDelimiter(text, double, i + 2);
        if (close > i + 2) {
          flush();
          const strong = document.createElement("strong");
          appendInline(strong, text.slice(i + 2, close), options);
          parent.appendChild(strong);
          i = close + 2;
          continue;
        }
      }
      // Handle GFM strikethrough.
      if (options.withStrikethrough && double === "~~") {
        const close = findClosingDelimiter(text, "~~", i + 2);
        if (close > i + 2) {
          flush();
          const del = document.createElement("del");
          appendInline(del, text.slice(i + 2, close), options);
          parent.appendChild(del);
          i = close + 2;
          continue;
        }
      }
      // Handle emphasis.
      // Keep underscores inside words literal.
      if (char === "*" || char === "_") {
        const previous = i > 0 ? text[i - 1] : "";
        const next = text[i + 1] || "";
        const underscoreInsideWord = char === "_" && /[\p{L}\p{N}]/u.test(previous) && /[\p{L}\p{N}]/u.test(next);
        if (!underscoreInsideWord) {
          const close = findClosingDelimiter(text, char, i + 1);
          if (close > i + 1) {
            const beforeClose = text[close - 1] || "";
            const afterClose = text[close + 1] || "";
            const closingUnderscoreInsideWord = char === "_" && /[\p{L}\p{N}]/u.test(beforeClose) && /[\p{L}\p{N}]/u.test(afterClose);
            if (!closingUnderscoreInsideWord) {
              flush();
              const em = document.createElement("em");
              appendInline(em, text.slice(i + 1, close), options);
              parent.appendChild(em);
              i = close + 1;
              continue;
            }
          }
        }
      }
      // Decode a small entity subset without using innerHTML.
      if (char === "&") {
        const match = text.slice(i).match(/^&(?:amp|lt|gt|quot|apos|#\d+|#x[\da-fA-F]+);/);
        if (match) {
          const decoded = decodeEntity(match[0]);
          if (decoded !== null) {
            buffer += decoded;
            i += match[0].length;
            continue;
          }
        }
      }
      buffer += char;
      i += 1;
    }
    flush();
  };

  /**
   * Matches a fenced-code opening line.
   *
   * @param {string} line
   * @return {RegExpMatchArray|null}
   */
  const matchFence = (line) => line.match(/^ {0,3}(`{3,}|~{3,})([^`]*)$/);

  /**
   * Removes HTML comments while preserving comment-looking content inside code.
   * Raw HTML is not rendered by easy-md-viewer, but Markdown comments should remain invisible.
   *
   * @param {string} source
   * @return {string}
   */
  const stripHtmlComments = (source) => {
    const lines = source.split("\n");
    const output = [];
    let inComment = false;
    let fence = null;
    for (const line of lines) {
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
          const ticks = "`".repeat(run);
          const close = line.indexOf(ticks, cursor + run);

          if (close !== -1) {
            visible += line.slice(cursor, close + run);
            cursor = close + run;
            continue;
          }
        }
        // Hide HTML comments outside code spans.
        if (line.startsWith("<!--", cursor)) {
          inComment = true;
          cursor += 4;
          continue;
        }
        visible += line[cursor];
        cursor += 1;
      }
      output.push(visible);
    }
    return output.join("\n");
  };

  /**
   * Removes Markdown hidden-comment/reference markers such as:
   *
   * [//]&#58; # (OPTIONAL:SECTION BEGIN)
   */
  const stripHiddenCommentMarkers = (lines) => {
    const output = [];
    let fence = null;
    for (const line of lines) {
      if (fence) {
        output.push(line);
        if (fence.close.test(line)) fence = null;
        continue;
      }
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
      output.push(/^\s*\[\/\/\]:\s*#\s*\(.*\)\s*$/.test(line) ? "" : line);
    }
    return output;
  };

  /**
   * Checks whether a line is a Markdown horizontal rule.
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
   * @return {string[]}
   */
  const splitTableRow = (line) => {
    let source = line.trim();
    if (source.startsWith("|")) source = source.slice(1);
    if (source.endsWith("|") && !source.endsWith("\\|")) source = source.slice(0, -1);
    const cells = [];
    let cell = "";
    for (let i = 0; i < source.length; i++) {
      if (source[i] === "\\" && i + 1 < source.length) {
        cell += source[i] + source[i + 1];
        i += 1;
        continue;
      }
      if (source[i] === "`") {
        const run = markerRun(source, i);
        const ticks = "`".repeat(run);
        const close = source.indexOf(ticks, i + run);
        if (close !== -1) {
          cell += source.slice(i, close + run);
          i = close + run - 1;
          continue;
        }
      }
      if (source[i] === "|") {
        cells.push(cell.trim());
        cell = "";
        continue;
      }
      cell += source[i];
    }
    cells.push(cell.trim());
    return cells;
  };

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
   * Appends one line of inline Markdown
   * and handles Markdown line breaks.
   *
   * @param {Node} parent
   * @param {string} line
   * @param {boolean} last
   * @param {Object} options
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
   * Renders a fenced code block.
   *
   * @param {Node} parent
   * @param {string[]} lines
   * @param {number} start
   * @return {number}
   */
  const appendFencedCode = (parent, lines, start) => {
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
    const quote = document.createElement("blockquote");
    quote.className = "byMDblockquote";
    renderBlocks(quote, quoteLines, options);
    parent.appendChild(quote);
    return index;
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
      const itemLines = [item.content];
      let next = index + 1;
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
   */
  function renderBlocks(parent, lines, options) {
    for (let index = 0; index < lines.length; ) {
      const line = lines[index];
      // Skip blank lines.
      if (!line.trim()) {
        index += 1;
        continue;
      }
      // Render fenced code.
      if (matchFence(line)) {
        index = appendFencedCode(parent, lines, index);
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

  /**
   * Adds a light/dark theme toggle to a renderer.
   * Expected theme filenames:
   * - {filename}.light.css
   * - {filename}.dark.css
   * @param {HTMLElement} element - Renderer that receives the toggle.
   * @param {string} filename - Theme stylesheet base filename.
   * @return {HTMLButtonElement|null} The toggle button, or null when no valid theme stylesheet is loaded.
   */
  const appendThemeToggle = (element, filename) => {
    const escapedFilename = filename.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const themePattern = new RegExp(`${escapedFilename}\\.(light|dark)\\.css(?:[?#].*)?$`, "i");
    const themeReplacePattern = new RegExp(`${escapedFilename}\\.(light|dark)\\.css`, "i");
    // Prefer the documented #byVIEWtheme link, but also support automatic detection.
    const stylesheet = document.getElementById("byVIEWtheme") || [...document.querySelectorAll('link[rel~="stylesheet"]')].find((link) => themePattern.test(link.getAttribute("href") || ""));
    if (!stylesheet) return null;
    // Read the active theme from the stylesheet filename.
    const getTheme = () => {
      const match = (stylesheet.getAttribute("href") || "").match(themeReplacePattern);
      return match ? match[1].toLowerCase() : null;
    };
    if (!getTheme()) return null;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "byVIEWthemeToggle";
    button.textContent = "\u263E\uFE0E \u2600\uFE0E"; // ☾︎ ☀︎
    // Keep accessibility text consistent with the theme actually loaded.
    const sync = () => {
      const next = getTheme() === "dark" ? "light" : "dark";
      button.title = `Switch to ${next} theme`;
      button.setAttribute("aria-label", button.title);
    };
    button.addEventListener("click", () => {
      const current = getTheme();
      const next = current === "dark" ? "light" : "dark";
      const href = stylesheet.getAttribute("href") || "";

      // Replace only the theme filename while preserving paths and query strings.
      stylesheet.setAttribute("href", href.replace(themeReplacePattern, `${filename}.${next}.css`));
      sync();
    });
    sync();
    return element.appendChild(button);
  };

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
   * @param {boolean} [options.breaks=false]
   * @param {string|false} [options.linkTarget="_blank"]
   * @param {boolean} [options.themeToggle=true] - Appends a theme toggle at the top-right of the element.
   */
  global.byMDviewer = function byMDviewer(element, markdown, options = {}) {
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
      breaks: false,
      linkTarget: "_blank",
      themeToggle: true,
      ...options,
      [HEADING_IDS]: Object.create(null)
    };
    // Clear the target safely.
    element.textContent = "";
    element.classList.add("byMDdocument");
    if (options.themeToggle) appendThemeToggle(element, "md");
    // Normalize line endings and remove the BOM.
    const normalized = source.replace(/\r\n?/g, "\n").replace(/^\uFEFF/, "");
    // Remove invisible Markdown and HTML comments before block parsing.
    // This keeps document-control metadata out of rendered policy documents.
    const lines = stripHiddenCommentMarkers(stripHtmlComments(normalized).split("\n"));
    renderBlocks(element, lines, options);
  };
})(typeof window !== "undefined" ? window : this);
