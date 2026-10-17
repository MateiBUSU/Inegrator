import type { ComponentPropsWithoutRef } from "react";
import Markdown from "react-markdown";
import rehypeSanitize, { defaultSchema, type Options as SanitizeSchema } from "rehype-sanitize";

// Lesson bodies, prompts and explanations are written by an AI (and edited by a teacher), so
// they are treated as untrusted. Every layer below is deliberate:
//
//  1. react-markdown builds React elements; it never uses dangerouslySetInnerHTML.
//  2. skipHtml drops raw HTML from the markdown completely (<script>, <iframe>, onclick="..."
//     and so on never reach the page).
//  3. urlTransform only lets http: and https: URLs through: javascript:, data:, vbscript:,
//     mailto: and relative links all become plain text. (The library default also allows
//     mailto:, irc: and xmpp:, which a lesson has no use for.)
//  4. Images are not rendered at all (no tracking pixels or remote content).
//  5. rehype-sanitize runs on the result as a last safety net, with the same protocol allowlist.
//  6. Links open in a new tab with rel="noopener noreferrer nofollow".

const ALLOWED_PROTOCOLS = ["http", "https"];

export const sanitizeSchema: SanitizeSchema = {
  ...defaultSchema,
  tagNames: (defaultSchema.tagNames ?? []).filter((tag) => tag !== "img" && tag !== "input"),
  protocols: { ...defaultSchema.protocols, href: ALLOWED_PROTOCOLS },
};

/** Keeps a URL only if it is an absolute http(s) URL; otherwise returns "" (the link is dropped). */
export function httpUrlsOnly(url: string): string {
  return /^https?:\/\//i.test(url.trim()) ? url : "";
}

function SafeLink({ href, children }: ComponentPropsWithoutRef<"a">) {
  if (!href) return <span>{children}</span>;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer nofollow">
      {children}
    </a>
  );
}

export function SafeMarkdown({ children }: { children: string }) {
  return (
    <div className="markdown">
      <Markdown
        skipHtml
        disallowedElements={["img"]}
        urlTransform={httpUrlsOnly}
        rehypePlugins={[[rehypeSanitize, sanitizeSchema]]}
        components={{ a: SafeLink }}
      >
        {children}
      </Markdown>
    </div>
  );
}
