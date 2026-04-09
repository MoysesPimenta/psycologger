"use client";

/**
 * Sandboxed iframe renderer for inbound support email HTML.
 *
 * Defence in depth layers:
 *  1. Server sanitized the HTML with sanitize-html before sending it here.
 *  2. This iframe uses `sandbox=""` (no `allow-scripts`, no `allow-forms`,
 *     no `allow-same-origin`), so even if the sanitizer missed a vector the
 *     browser cannot execute JS or reach the parent window.
 *  3. A CSP meta tag inside srcDoc blocks all network egress (no images,
 *     fonts, stylesheets, fetch), preventing tracking pixels and beacons.
 *  4. The iframe auto-resizes to its content using a ResizeObserver via
 *     postMessage — but since scripts are disabled we instead just measure
 *     after load via `contentDocument.documentElement.scrollHeight`.
 */

import { useEffect, useRef, useState } from "react";

export function SupportMessageHtml({ html }: { html: string }) {
  const ref = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(120);

  // Wrap the sanitized HTML with a strict CSP and a neutral base style.
  const srcDoc = `<!doctype html>
<html>
<head>
<meta charset="utf-8"/>
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'; frame-ancestors 'self'"/>
<base target="_blank"/>
<style>
  /* Neutralize email-client styling: inbound HTML often ships with white
     backgrounds, dark text, fixed widths, and Outlook MSO conditionals. We
     force the entire subtree to inherit our dark palette so the rendered
     email blends into the SA UI instead of looking like a pasted screenshot. */
  html,body{margin:0;padding:12px;background:#0b1220 !important;color:#e5e7eb !important;font-family:ui-sans-serif,system-ui,sans-serif;font-size:14px;line-height:1.5;word-wrap:break-word;overflow-wrap:anywhere}
  *,*::before,*::after{background-color:transparent !important;color:inherit !important;border-color:#374151 !important;box-shadow:none !important;max-width:100% !important}
  a,a *{color:#93c5fd !important;text-decoration:underline}
  blockquote{border-left:3px solid #374151 !important;margin:8px 0;padding-left:12px;color:#9ca3af !important}
  pre,code{background:#1f2937 !important;padding:2px 4px;border-radius:4px}
  table{border-collapse:collapse;width:auto !important}
  td,th{padding:4px 8px;border:1px solid #374151 !important}
  img{max-width:100% !important;height:auto !important;background:transparent !important}
  hr{border-color:#374151 !important}
</style>
</head>
<body>${html}</body>
</html>`;

  useEffect(() => {
    const iframe = ref.current;
    if (!iframe) return;
    const measure = () => {
      try {
        const doc = iframe.contentDocument;
        if (!doc) return;
        const h = Math.max(
          doc.body?.scrollHeight ?? 0,
          doc.documentElement?.scrollHeight ?? 0
        );
        if (h > 0) setHeight(Math.min(h + 8, 4000));
      } catch {
        // Cross-origin or sandbox denied access — leave default height.
      }
    };
    iframe.addEventListener("load", measure);
    // Also re-measure after a short delay to catch reflows.
    const t = setTimeout(measure, 200);
    return () => {
      iframe.removeEventListener("load", measure);
      clearTimeout(t);
    };
  }, [html]);

  return (
    <iframe
      ref={ref}
      title="Conteúdo do email"
      sandbox=""
      srcDoc={srcDoc}
      style={{
        width: "100%",
        border: "none",
        height: `${height}px`,
        background: "transparent",
        colorScheme: "dark",
      }}
    />
  );
}
