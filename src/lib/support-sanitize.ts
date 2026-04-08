/**
 * HTML sanitizer for support-inbox inbound email bodies.
 *
 * Threat model: the thread view at /sa/support/[id] is SA-only, but we still
 * treat inbound email HTML as fully untrusted. Defence in depth:
 *
 *  1. sanitize-html strips <script>, <style>, <iframe>, <object>, <embed>,
 *     event handlers, javascript: URLs, expression() CSS, and anything else
 *     not explicitly allow-listed.
 *  2. The sanitized HTML is rendered inside a <iframe sandbox srcDoc="…"/>
 *     WITHOUT `allow-scripts`, so even a missed vector cannot execute JS or
 *     reach the parent document.
 *  3. A locked-down CSP meta tag inside the iframe blocks all network egress
 *     (no remote images, fonts, CSS, JS), preventing tracking pixels and
 *     CSRF via image/form beacons.
 *
 * This helper runs in Node (server components + API routes). It must not
 * be imported from client components.
 */

import sanitizeHtml from "sanitize-html";

const ALLOWED_TAGS = [
  // Basic block
  "p", "div", "span", "br", "hr",
  "h1", "h2", "h3", "h4", "h5", "h6",
  "blockquote", "pre", "code",
  // Lists
  "ul", "ol", "li",
  // Tables (emails use these a lot)
  "table", "thead", "tbody", "tfoot", "tr", "td", "th", "caption",
  // Inline
  "a", "b", "strong", "i", "em", "u", "s", "strike", "sub", "sup", "small",
  "mark", "abbr",
];

const ALLOWED_ATTR: sanitizeHtml.IOptions["allowedAttributes"] = {
  a: ["href", "title"],
  // Let emails keep minimal inline table styling; strip everything dangerous.
  td: ["colspan", "rowspan", "align", "valign"],
  th: ["colspan", "rowspan", "align", "valign", "scope"],
  table: ["cellpadding", "cellspacing", "border", "align"],
  "*": ["style"], // style attribute is allowed but passed through allowedStyles
};

const ALLOWED_STYLES: sanitizeHtml.IOptions["allowedStyles"] = {
  "*": {
    color: [/^.*$/],
    "background-color": [/^.*$/],
    "font-weight": [/^.*$/],
    "font-style": [/^.*$/],
    "font-size": [/^[0-9]+(px|em|rem|%)$/],
    "text-align": [/^(left|right|center|justify)$/],
    "text-decoration": [/^.*$/],
    padding: [/^[0-9 .pxem%]+$/],
    margin: [/^[0-9 .pxem%]+$/],
    border: [/^[0-9a-zA-Z #]+$/],
  },
};

/**
 * Sanitize arbitrary inbound HTML to a safe subset.
 * Returns a string that is safe to drop into an iframe srcDoc, provided the
 * iframe has `sandbox` (no `allow-scripts`) and a blocking CSP meta tag.
 */
export function sanitizeSupportHtml(raw: string): string {
  if (!raw) return "";
  return sanitizeHtml(raw, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: ALLOWED_ATTR,
    allowedStyles: ALLOWED_STYLES,
    // Disallow every scheme for URLs except https/mailto. No http (no mixed
    // content, no trackers), no javascript:, no data: URLs.
    allowedSchemes: ["https", "mailto"],
    allowedSchemesByTag: { a: ["https", "mailto"] },
    allowProtocolRelative: false,
    disallowedTagsMode: "discard",
    transformTags: {
      // Force every external link to open in a new tab and strip referrer.
      a: sanitizeHtml.simpleTransform("a", {
        rel: "noopener noreferrer nofollow",
        target: "_blank",
      }),
    },
  });
}

/**
 * Parse the stored encrypted body (decrypted) into {text, html}.
 * Accepts:
 *   - v1 JSON wrapper: {"v":1,"text":"…","html":"…"}
 *   - Legacy raw string: treated as plaintext.
 */
export function parseBodyWrapper(decrypted: string): { text: string; html: string } {
  if (!decrypted) return { text: "", html: "" };
  // Fast path — only try JSON.parse if it looks like an object.
  if (decrypted.charCodeAt(0) === 123 /* { */) {
    try {
      const obj = JSON.parse(decrypted) as { v?: number; text?: unknown; html?: unknown };
      if (obj && obj.v === 1) {
        return {
          text: typeof obj.text === "string" ? obj.text : "",
          html: typeof obj.html === "string" ? obj.html : "",
        };
      }
    } catch {
      // fall through
    }
  }
  return { text: decrypted, html: "" };
}
