// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import rehypeSanitize from "rehype-sanitize";
import { httpUrlsOnly, SafeMarkdown, sanitizeSchema } from "./safe-markdown";

// Security-relevant: lesson text comes from an AI model. Nothing in it may become executable
// markup or a dangerous link. These tests inspect the rendered DOM, not a snapshot.

afterEach(cleanup);

function renderMarkdown(source: string) {
  const { container } = render(<SafeMarkdown>{source}</SafeMarkdown>);
  return container;
}

/** Every attribute on every element, as "tag@attr=value". */
function attributes(container: HTMLElement): string[] {
  return [...container.querySelectorAll("*")].flatMap((element) =>
    [...element.attributes].map(
      (attr) => `${element.tagName.toLowerCase()}@${attr.name}=${attr.value}`,
    ),
  );
}

const hasEventHandler = (container: HTMLElement) =>
  [...container.querySelectorAll("*")].some((element) =>
    [...element.attributes].some((attr) => attr.name.toLowerCase().startsWith("on")),
  );

const DANGEROUS_ELEMENTS =
  "script, iframe, object, embed, style, link, meta, form, input, img, svg, base";

describe("SafeMarkdown: raw HTML from the AI is stripped", () => {
  it("removes a <script> tag and its code", () => {
    const container = renderMarkdown(
      "Text normal.\n\n<script>window.pwned = true; alert(1)</script>\n\nAltul.",
    );
    expect(container.querySelector("script")).toBeNull();
    expect(container.innerHTML).not.toContain("alert(1)");
    expect(container.innerHTML).not.toContain("pwned");
    expect(container.textContent).toContain("Text normal.");
    expect(container.textContent).toContain("Altul.");
    expect((window as unknown as { pwned?: boolean }).pwned).toBeUndefined();
  });

  it("removes an inline onclick (and other event handler attributes) from raw HTML", () => {
    const container = renderMarkdown(
      [
        '<div onclick="window.pwned = true">click me</div>',
        '<a href="https://example.com" onclick="steal()" onmouseover="steal()">link</a>',
        '<p onerror="x()" onload="x()">para</p>',
        '<button onclick="x()">b</button>',
      ].join("\n\n"),
    );
    expect(hasEventHandler(container)).toBe(false);
    expect(container.innerHTML).not.toMatch(/onclick|onmouseover|onerror|onload|steal|pwned/i);
  });

  it("removes inline HTML mixed into a sentence", () => {
    const container = renderMarkdown(
      'Un cuvânt <img src=x onerror="alert(1)"> și <b onclick="x()">aldin</b> aici.',
    );
    expect(container.querySelector(DANGEROUS_ELEMENTS)).toBeNull();
    expect(hasEventHandler(container)).toBe(false);
    expect(container.innerHTML).not.toContain("onerror");
  });

  it.each([
    '<iframe src="https://evil.example"></iframe>',
    '<object data="x"></object>',
    '<embed src="x">',
    "<style>body{display:none}</style>",
    '<link rel="stylesheet" href="https://evil.example/x.css">',
    '<meta http-equiv="refresh" content="0;url=https://evil.example">',
    '<form action="https://evil.example"><input name="password"></form>',
    '<svg onload="alert(1)"><script>alert(2)</script></svg>',
    '<base href="https://evil.example/">',
    "<math><mtext></mtext></math>",
  ])("removes dangerous element: %s", (html) => {
    const container = renderMarkdown(`Înainte\n\n${html}\n\nDupă`);
    expect(container.querySelector(DANGEROUS_ELEMENTS)).toBeNull();
    expect(hasEventHandler(container)).toBe(false);
    expect(container.textContent).toContain("Înainte");
    expect(container.textContent).toContain("După");
  });

  it("does not let an HTML comment or CDATA smuggle markup through", () => {
    const container = renderMarkdown(
      "a <!-- <script>alert(1)</script> --> b <![CDATA[<script>alert(2)</script>]]> c",
    );
    expect(container.querySelector("script")).toBeNull();
    expect(container.innerHTML).not.toContain("alert");
  });
});

describe("SafeMarkdown: links", () => {
  it.each([
    "javascript:alert(1)",
    "JaVaScRiPt:alert(1)",
    "  javascript:alert(1)",
    "java\tscript:alert(1)",
    "data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==",
    "vbscript:msgbox(1)",
    "file:///etc/passwd",
    "mailto:someone@example.com",
    "ftp://example.com/x",
    "//evil.example/path",
    "/relative/path",
    "#fragment",
  ])("renders a markdown link to %j as plain text, not a link", (url) => {
    const container = renderMarkdown(`[apasă aici](${url})`);
    expect(container.querySelector("a")).toBeNull();
    expect(container.textContent).toContain("apasă aici");
    expect(attributes(container).join(" ")).not.toMatch(/href/i);
  });

  it("drops a javascript: href inside raw HTML as well", () => {
    const container = renderMarkdown(
      '<a href="javascript:alert(1)">x</a> și [y](javascript:alert(2))',
    );
    expect(container.querySelector("a")).toBeNull();
    expect(container.innerHTML).not.toContain("javascript");
  });

  it("keeps http and https links, and makes them safe to open", () => {
    const container = renderMarkdown(
      "[doc](https://example.com/page?a=1) și [alt](http://example.org)",
    );
    const anchors = [...container.querySelectorAll("a")];
    expect(anchors.map((a) => a.getAttribute("href"))).toEqual([
      "https://example.com/page?a=1",
      "http://example.org",
    ]);
    for (const anchor of anchors) {
      expect(anchor.getAttribute("target")).toBe("_blank");
      expect(anchor.getAttribute("rel")).toBe("noopener noreferrer nofollow");
    }
  });

  it("does not turn bare URLs or autolinks with other schemes into links", () => {
    const container = renderMarkdown("<javascript:alert(1)> și <https://example.com>");
    const hrefs = [...container.querySelectorAll("a")].map((a) => a.getAttribute("href"));
    expect(hrefs.every((href) => href === null || /^https?:\/\//.test(href))).toBe(true);
    // The text may be shown (inert, inside a span); no attribute may carry the scheme.
    expect(attributes(container).join(" ")).not.toContain("javascript:");
    expect(container.querySelector("span")?.textContent).toContain("javascript:alert(1)");
  });
});

describe("SafeMarkdown: images and attributes", () => {
  it("renders no images at all (no remote content or tracking pixels)", () => {
    const container = renderMarkdown(
      '![alt](https://example.com/p.png) ![x](javascript:alert(1)) <img src="https://example.com/p.png">',
    );
    expect(container.querySelector("img")).toBeNull();
    expect(container.innerHTML).not.toContain("example.com/p.png");
  });

  it("never produces an element with an on* attribute, style or srcdoc, for any of the inputs above", () => {
    const container = renderMarkdown(
      '<p style="x" onclick="y" srcdoc="z" formaction="w">t</p>\n\n[a](https://example.com "title")\n\n```html\n<script>alert(1)</script>\n```',
    );
    const found = attributes(container);
    expect(found.some((a) => /@(on|style=|srcdoc|formaction)/i.test(a))).toBe(false);
  });
});

describe("SafeMarkdown: content that is safe still renders normally", () => {
  it("renders headings, emphasis, lists and inline code", () => {
    const container = renderMarkdown(
      "# Titlu\n\nText **aldin** și *cursiv* cu `int x = 5;`.\n\n- unu\n- doi\n\n1. a\n2. b",
    );
    expect(container.querySelector("h1")?.textContent).toBe("Titlu");
    expect(container.querySelector("strong")?.textContent).toBe("aldin");
    expect(container.querySelector("em")?.textContent).toBe("cursiv");
    expect(container.querySelector("p code")?.textContent).toBe("int x = 5;");
    expect(container.querySelectorAll("ul li")).toHaveLength(2);
    expect(container.querySelectorAll("ol li")).toHaveLength(2);
  });

  it("shows code blocks as literal text, so HTML inside them is inert", () => {
    const container = renderMarkdown(
      '```cpp\n#include <iostream>\nint main() { std::cout << "<script>alert(1)</script>"; }\n```',
    );
    const code = container.querySelector("pre code");
    expect(code?.textContent).toContain("#include <iostream>");
    expect(code?.textContent).toContain("<script>alert(1)</script>"); // visible as text
    expect(container.querySelector("script")).toBeNull();
  });

  it("renders blockquotes and escapes angle brackets that are not HTML", () => {
    const container = renderMarkdown("> citat\n\n3 < 5 și 7 > 2 și a<b");
    expect(container.querySelector("blockquote")?.textContent).toContain("citat");
    expect(container.textContent).toContain("3 < 5 și 7 > 2");
  });

  it("renders empty input without crashing", () => {
    expect(renderMarkdown("").textContent).toBe("");
  });
});

describe("httpUrlsOnly", () => {
  it("accepts only absolute http(s) URLs", () => {
    expect(httpUrlsOnly("https://example.com")).toBe("https://example.com");
    expect(httpUrlsOnly("HTTP://example.com")).toBe("HTTP://example.com");
    for (const url of [
      "javascript:alert(1)",
      "data:text/html,x",
      "/x",
      "#x",
      "mailto:a@b.c",
      "",
      "ftp://x",
    ]) {
      expect(httpUrlsOnly(url)).toBe("");
    }
  });
});

// The sanitizer is the second layer behind urlTransform. Run it on its own, on a tree that
// already carries a dangerous href, so it is proven to hold even if the first layer let it by.
describe("the rehype-sanitize layer on its own", () => {
  const tree = (href: string) => ({
    type: "root" as const,
    children: [
      {
        type: "element" as const,
        tagName: "a",
        properties: { href, onClick: "alert(1)" },
        children: [{ type: "text" as const, value: "x" }],
      },
    ],
  });
  const sanitize = (href: string) =>
    (
      rehypeSanitize(sanitizeSchema) as unknown as (t: ReturnType<typeof tree>) => {
        children: { properties: Record<string, unknown> }[];
      }
    )(tree(href)).children[0]?.properties ?? {};

  it.each(["javascript:alert(1)", "JaVaScRiPt:alert(1)", "data:text/html,<b>x</b>", "vbscript:x"])(
    "drops the href %s and any inline handler",
    (href) => {
      const props = sanitize(href);
      expect(props.href).toBeUndefined();
      expect(Object.keys(props).some((key) => key.toLowerCase().startsWith("on"))).toBe(false);
    },
  );

  it("keeps an https link", () => {
    expect(sanitize("https://example.com/a").href).toBe("https://example.com/a");
  });
});
