<!--
===============================================================================
EASY MD VIEWER TEST SOURCE
===============================================================================

This block should NEVER appear in the rendered output.

# Hidden heading
**hidden bold**
- hidden list
[hidden link](https://example.com)

===============================================================================
-->

[//]: # (HIDDEN:MARKER)
[//]: # (OPTIONAL:TEST BEGIN)

# easy MD Viewer BenchMarkDown

A coverage and regression document for **easy-md-viewer**.

This file intentionally mixes normal Markdown, edge cases, Unicode, URLs, nesting,
escaping, comments, and repeated content.

**Expected behavior:** supported Markdown should render consistently, hidden comments
should remain hidden, raw HTML should remain text, and unsafe URLs should not become
clickable links.

---

## Test Index

1. [Headings](#1-headings)
2. [Paragraphs](#2-paragraphs)
3. [Emphasis](#3-emphasis)
4. [Inline Code](#4-inline-code)
5. [Fenced Code](#5-fenced-code)
6. [Escapes](#6-escapes)
7. [HTML-Looking Text](#7-html-looking-text)
8. [Hidden Comments](#8-hidden-comments)
9. [Links](#9-links)
10. [Autolinks](#10-autolinks)
11. [Bare URLs and Emails](#11-bare-urls-and-emails)
12. [Images](#12-images)
13. [Unordered Lists](#13-unordered-lists)
14. [Ordered Lists](#14-ordered-lists)
15. [Nested Lists](#15-nested-lists)
16. [Multiline List Items](#16-multiline-list-items)
17. [Task Lists](#17-task-lists)
18. [Blockquotes](#18-blockquotes)
19. [Horizontal Rules](#19-horizontal-rules)
20. [Tables](#20-tables)
21. [Unicode](#21-unicode)
22. [Whitespace and Empty Content](#22-whitespace-and-empty-content)
23. [Special Characters](#23-special-characters)
24. [Regression: List Termination](#24-regression-list-termination)
25. [Regression: Comments Around Blocks](#25-regression-comments-around-blocks)
26. [Regression: Markdown Inside Code](#26-regression-markdown-inside-code)
27. [Regression: Pipes](#27-regression-pipes)
28. [Regression: URL Punctuation](#28-regression-url-punctuation)
29. [Regression: Nested Formatting](#29-regression-nested-formatting)
30. [Malformed Markdown](#30-malformed-markdown)
31. [Ordering / Volume Test](#31-ordering--volume-test)
32. [Mixed Stress Test](#32-mixed-stress-test)
33. [End Marker](#33-end-marker)

---

## 1. Headings

# Heading 1

## Heading 2

### Heading 3

#### Heading 4

##### Heading 5

###### Heading 6

### Heading With Closing Hashes ###

### Heading containing **bold**, *italic*, `code`, and ~~strike~~

---

## 2. Paragraphs

This is a normal paragraph.

This paragraph contains multiple
source lines that should remain part
of the same paragraph when `breaks` is `false`.

This line ends with two spaces.  
This should be a hard line break.

This line ends with a backslash.\
This should also be a hard line break.

A paragraph with punctuation: ! @ # $ % ^ & * ( ) _ + - = [ ] { } ; : ' " , . / ? \ | ` ~

---

## 3. Emphasis

**bold**

__bold with underscores__

*italic*

_italic with underscores_

***bold italic***

___bold italic with underscores___

~~strikethrough~~

**bold with *italic* inside**

*italic with **bold** inside*

~~strike with **bold** inside~~

**bold with `inline code` inside**

Normal **bold**, *italic*, ~~strike~~, and `code` in the same sentence.

foo_bar_baz should keep the underscores inside the word.

snake_case_value should remain readable.

_unambiguous emphasis_

**unclosed bold

*unclosed italic

~~unclosed strike

---

## 4. Inline Code

`const value = true;`

`<strong>This should be code, not HTML.</strong>`

`**This should not become bold.**`

``code containing ` one backtick``

```code containing `` two backticks```

`https://example.com should not become a link inside code`

`[not a link](https://example.com)`

`<!-- not a comment inside inline code -->`

---

## 5. Fenced Code

```javascript
const hello = "world";
const markdown = "**not bold inside code**";
console.log(hello, markdown);
```

```json
{
  "string": "Hello, world!",
  "boolean": true,
  "number": 123.456,
  "null": null
}
```

~~~css
.byMDdocument {
  display: block;
}
~~~

```text
<!-- This comment-looking text must stay inside the code block. -->
[//]: # (THIS MUST ALSO STAY VISIBLE INSIDE CODE)
# Not a heading
**Not bold**
https://example.com
```

````markdown
A fence can contain a shorter fence:

```javascript
console.log("nested-looking fence");
```
````

---

## 6. Escapes

\*not italic\*

\**not bold\**

\# not a heading

\- not a list item

\+ not a list item

\> not a blockquote

\[not a link\]\(https://example.com\)

\`not inline code\`

Escaped pipe: \|

Escaped backslash: \\

Escaped punctuation: \! \# \( \) \[ \] \{ \} \_ \* \~ \>

---

## 7. HTML-Looking Text

<strong>This must remain literal text, not become bold HTML.</strong>

<div class="test">This must remain literal text.</div>

<script>alert("This must never execute.");</script>

<style>body { display: none; }</style>

Custom-looking tag: <easy-md-viewer>

Less than and greater than: 1 < 2 and 3 > 2.

Entities: &amp; &lt; &gt; &quot; &apos;

Numeric entities: &#169; &#9731; &#x1F98B;

---

## 8. Hidden Comments

Visible before inline comment. <!-- THIS MUST BE HIDDEN --> Visible after inline comment.

<!--
THIS ENTIRE BLOCK MUST BE HIDDEN.

## Hidden Heading

- Hidden item 1
- Hidden item 2

**Hidden bold text**

https://example.com/hidden
-->

Visible after the hidden block.

[//]: # (THIS ENTIRE MARKER MUST BE HIDDEN)

[//]: # (OPTIONAL:EXAMPLE BEGIN)

The text between marker lines remains visible because the markers themselves are
document-control comments, not section-removal instructions.

[//]: # (OPTIONAL:EXAMPLE END)

[//]: # (OPTIONAL:DISABLED BEGIN)
<!--
### Disabled Section

This entire optional section must stay hidden.

- Hidden list item
- Another hidden list item
-->
[//]: # (OPTIONAL:DISABLED END)

Visible after the disabled optional section.

---

## 9. Links

[Normal HTTPS link](https://example.com)

[HTTP link](http://example.com)

[Link with path](https://example.com/path/to/page)

[Link with query](https://example.com/search?q=hello&lang=en)

[Link with fragment](https://example.com/page#section)

[Link with encoded path](https://example.com/a%20folder/file.md)

[Relative link](/docs/readme)

[Relative child link](docs/readme.md)

[Anchor link](#links)

[Email link](mailto:test@example.com)

[Telephone link](tel:+1234567890)

[FTP link](ftp://example.com/file.txt)

[Link with title](https://example.com "Example website")

[Parentheses in URL](https://example.com/wiki/Test_(example))

[**Bold link label**](https://example.com)

[*Italic link label*](https://example.com)

[`Code link label`](https://example.com)

Unsafe link should not become clickable: [javascript](javascript:alert(1))

Unsafe data link should not become clickable: [data](data:text/html,test)

Broken link syntax: [broken](

Broken label: [broken

---

## 10. Autolinks

<https://example.com>

<http://example.com/path>

<ftp://example.com/file.txt>

<test@example.com>

Not an autolink: <example.com>

Not HTML: <strong>

---

## 11. Bare URLs and Emails

https://example.com

http://example.com

Visit https://example.com for more information.

URL followed by punctuation: https://example.com.

URL followed by comma: https://example.com,

URL with query: https://example.com/search?q=hello&lang=en

URL with fragment: https://example.com/page#section

URL with balanced parentheses: https://example.com/wiki/Test_(example)

Email: test@example.com

Email inside sentence: Contact test@example.com for information.

Not an email: @example.com

Not an email: test@

---

## 12. Images

![Example image](https://raw.githubusercontent.com/byuwur/easy-md-viewer/main/test.png)

![Example image with title](https://raw.githubusercontent.com/byuwur/easy-md-viewer/main/test.png "Example image")

![Alt with **Markdown-looking** text](https://raw.githubusercontent.com/byuwur/easy-md-viewer/main/test.png)

![Relative image](test.png)

Unsafe image should remain text: ![Unsafe image](javascript:alert(1))

Unsafe data image should remain text: ![Data image](data:image/png;base64,AAAA)

Broken image: ![broken](

---

## 13. Unordered Lists

- One
- Two
- Three

* Asterisk one
* Asterisk two
* Asterisk three

+ Plus one
+ Plus two
+ Plus three

- **Bold item**
- *Italic item*
- `Code item`
- [Linked item](https://example.com)
- ~~Struck item~~

Paragraph after unordered lists.

---

## 14. Ordered Lists

1. One
2. Two
3. Three

5. Starts at five
6. Six
7. Seven

1) Parenthesis marker one
2) Parenthesis marker two
3) Parenthesis marker three

Paragraph after ordered lists.

---

## 15. Nested Lists

- Level 1 A
  - Level 2 A
    - Level 3 A
    - Level 3 B
  - Level 2 B
- Level 1 B

1. Ordered level 1
   1. Ordered level 2
      1. Ordered level 3
      2. Ordered level 3
   2. Ordered level 2
2. Ordered level 1

- Unordered parent
  1. Ordered child one
  2. Ordered child two
- Another unordered parent
  - Nested unordered
    1. Nested ordered
    2. Nested ordered

Paragraph after nested lists.

---

## 16. Multiline List Items

- This is a list item
  whose content continues on another line.

- This item contains multiple lines
  that should remain associated
  with the same list item.

- This item has a nested paragraph-like continuation.

  More indented content belongs to the item.

- Final item.

Paragraph after multiline list items.

---

## 17. Task Lists

- [x] Completed task
- [X] Completed task using uppercase X
- [ ] Incomplete task
- [x] **Completed bold task**
- [ ] Task with [a link](https://example.com)
- [ ] Task with `inline code`

- [x] Parent task
  - [x] Nested completed task
  - [ ] Nested incomplete task
    - [x] Deep task

Paragraph after task lists.

---

## 18. Blockquotes

> Simple blockquote.

> **Bold** inside a blockquote.
>
> *Italic* inside a blockquote.
>
> `Code` inside a blockquote.

> ## Heading inside blockquote
>
> - Item one
> - Item two
>
> 1. Ordered one
> 2. Ordered two

> Level one
>> Level two
>>> Level three

> A blockquote containing a task list:
>
> - [x] Done
> - [ ] Not done

Paragraph after blockquotes.

---

## 19. Horizontal Rules

Three dashes:

---

Three asterisks:

***

Three underscores:

___

Spaced dashes:

- - -

Spaced asterisks:

* * *

Spaced underscores:

_ _ _

---

## 20. Tables

| Name | Type | Value |
|---|---|---|
| String | text | Hello |
| Number | numeric | 123 |
| Boolean | logical | true |

| Left | Center | Right |
|:---|:---:|---:|
| A | B | C |
| D | E | F |

| Markdown | Result |
|---|---|
| **Bold** | strong |
| *Italic* | emphasis |
| `Code` | code |
| ~~Strike~~ | deleted |
| [Link](https://example.com) | anchor |

| Escaping |
|---|
| foo \| bar |
| `foo | bar` |
| backslash \\ |

Paragraph after tables.

---

## 21. Unicode

Accented: áéíóú ñ ü ç

Spanish: ¡Hola! ¿Cómo estás?

Emoji: 😀 😎 ❤️ 🦋 🚀

Symbols: © ® ™ € £ ¥ § ± × ÷

Greek: α β γ δ Ω

Cyrillic: Привет мир

Japanese: こんにちは世界

Chinese: 你好世界

Arabic: مرحبا بالعالم

Korean: 안녕하세요 세계

Mixed: Hello 世界 🌎 — café — Привет — مرحبا

Combining characters: é á ö

---

## 22. Whitespace and Empty Content

Paragraph before several blank lines.



Paragraph after several blank lines.

    Four leading spaces are intentionally not treated as an indented code block by easy-md-viewer.

	A tab starts this line.

Text with     multiple     internal     spaces.

Trailing spaces at the end of this line should not create extra visible content.     

---

## 23. Special Characters

Brackets: [ ] ( ) { } < >

Markdown markers: * ** *** _ __ ___ ~~ ` `` ```

Punctuation: ! @ # $ % ^ & * ( ) _ + - = [ ] { } | ; : ' " , . < > / ? \ ` ~

Math-looking text: 1 + 2 = 3, 10 * 5 = 50, a_b, x^2.

Template-looking text: {{ value }} ${value} <% value %>

JSON-looking text: {"nested":true,"value":123}

CSS-looking text: .class { color: red; }

JS-looking text: const value = () => true;

---

## 24. Regression: List Termination

- List item A
- List item B
- List item C

### This heading must NOT be inside the final list item

This paragraph must NOT be inside the final list item.

- New list A
- New list B

Another paragraph outside the list.

1. Ordered A
2. Ordered B

### Another heading outside the ordered list

Another paragraph outside the ordered list.

---

## 25. Regression: Comments Around Blocks

<!-- hidden before heading -->
### Visible Heading

<!-- hidden before paragraph -->
Visible paragraph.

<!-- hidden before list -->
- Visible item one
- Visible item two
<!-- hidden after list -->

<!--
- Completely hidden list one
- Completely hidden list two
-->

Visible paragraph after hidden list.

---

## 26. Regression: Markdown Inside Code

Inline: `**bold** *italic* ~~strike~~ [link](https://example.com)`

```markdown
# Heading
## Heading 2

**bold**
*italic*
~~strike~~

- list
- list

[link](https://example.com)

<!-- comment -->
[//]: # (hidden marker looking text)
```

---

## 27. Regression: Pipes

Normal text containing a | pipe should remain normal.

Escaped pipe: \|

Inline code pipe: `a | b`

| Column A | Column B |
|---|---|
| escaped \| pipe | code `a | b` |
| one | two |

---

## 28. Regression: URL Punctuation

https://example.com.

https://example.com,

https://example.com!

https://example.com?

https://example.com;

https://example.com:

(https://example.com)

[https://example.com]

Balanced: https://example.com/foo_(bar)

---

## 29. Regression: Nested Formatting

**bold *italic* bold**

*italic **bold** italic*

~~strike **bold** strike~~

**bold ~~strike~~ bold**

[**bold *italic* link**](https://example.com)

> **Blockquote bold with *nested italic*.**
>
> - **List item with [link](https://example.com) and `code`.**

---

## 30. Malformed Markdown

These cases should remain stable and must not throw exceptions.

**

*

***

~~

`

``

[

[]

[link]

[link](

[link]()

![image]

![image](

<

>

---

## 31. Ordering / Volume Test

The following sequence is intentionally repetitive. Every item from `000` through
`099` should appear once, in order, with no missing or duplicated values.

- `000`
- `001`
- `002`
- `003`
- `004`
- `005`
- `006`
- `007`
- `008`
- `009`
- `010`
- `011`
- `012`
- `013`
- `014`
- `015`
- `016`
- `017`
- `018`
- `019`
- `020`
- `021`
- `022`
- `023`
- `024`
- `025`
- `026`
- `027`
- `028`
- `029`
- `030`
- `031`
- `032`
- `033`
- `034`
- `035`
- `036`
- `037`
- `038`
- `039`
- `040`
- `041`
- `042`
- `043`
- `044`
- `045`
- `046`
- `047`
- `048`
- `049`
- `050`
- `051`
- `052`
- `053`
- `054`
- `055`
- `056`
- `057`
- `058`
- `059`
- `060`
- `061`
- `062`
- `063`
- `064`
- `065`
- `066`
- `067`
- `068`
- `069`
- `070`
- `071`
- `072`
- `073`
- `074`
- `075`
- `076`
- `077`
- `078`
- `079`
- `080`
- `081`
- `082`
- `083`
- `084`
- `085`
- `086`
- `087`
- `088`
- `089`
- `090`
- `091`
- `092`
- `093`
- `094`
- `095`
- `096`
- `097`
- `098`
- `099`

---

## 32. Mixed Stress Test

> ### Nested document sample
>
> This combines **bold**, *italic*, ~~strike~~, `code`, and a
> [safe link](https://example.com).
>
> - [x] Completed
> - [ ] Pending
>   - Nested item with **formatting**
>   - Nested item with https://example.com
>
> | Feature | Status |
> |:---|---:|
> | **Markdown** | Working |
> | `DOM` | Safe |
> | ~~Dependencies~~ | None |

1. First ordered item with **bold**.
2. Second ordered item with `code`.
3. Third ordered item with a [link](https://example.com).
   - Nested unordered item.
   - Another nested item.
4. Fourth ordered item.

Final paragraph with Unicode 🦋, an email test@example.com, a URL
https://example.com/path?q=easy-md-viewer#benchmark, and escaped Markdown
\*literal asterisks\*.

---

## 33. End Marker

**END OF EASY MD VIEWER TEST**

If this line renders, the complete document reached the end without being swallowed
by a comment, code fence, list, blockquote, table, or malformed inline construct.

[//]: # (OPTIONAL:TEST END)
