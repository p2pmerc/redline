import { marked } from "marked";
import DOMPurify from "dompurify";

function slug(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "report";
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function exportMarkdown(title: string, markdown: string) {
  const text = `# ${title}\n\n${markdown}\n`;
  download(new Blob([text], { type: "text/markdown;charset=utf-8" }), `${slug(title)}.md`);
}

const printStyles = `
  @page { margin: 22mm 18mm; }
  * { box-sizing: border-box; }
  body { font: 11pt/1.6 "Inter", system-ui, sans-serif; color: #171717; margin: 0; }
  header { border-bottom: 3px solid #e5484d; padding-bottom: 10px; margin-bottom: 22px; }
  header small { color: #737373; letter-spacing: .08em; text-transform: uppercase; font-size: 8.5pt; }
  h1 { font-size: 20pt; margin: 6px 0 0; letter-spacing: -.02em; }
  h2 { font-size: 14pt; margin-top: 24px; } h3 { font-size: 12pt; }
  code { font: 9.5pt ui-monospace, Menlo, monospace; background: #f3f3f3; padding: 1px 4px; border-radius: 4px; }
  pre { background: #f6f6f6; border: 1px solid #e5e5e5; border-radius: 8px; padding: 12px; overflow: auto; white-space: pre-wrap; break-inside: avoid; }
  pre code { background: none; padding: 0; }
  blockquote { margin: 12px 0; padding-left: 14px; border-left: 3px solid #d4d4d4; color: #525252; }
  table { border-collapse: collapse; width: 100%; } td, th { border: 1px solid #e5e5e5; padding: 6px 8px; }
  footer { margin-top: 32px; padding-top: 10px; border-top: 1px solid #e5e5e5; color: #737373; font-size: 8.5pt; }
`;

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** Opens the browser print dialog on a clean, styled copy of the report so it can be saved as PDF. */
export async function exportPdf(title: string, markdown: string, meta: { id?: string; target?: string; hash?: string } = {}) {
  const html = DOMPurify.sanitize(await marked.parse(markdown, { async: true }));
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;";
  document.body.appendChild(frame);
  const doc = frame.contentDocument!;
  doc.open();
  doc.write(`<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>${printStyles}</style></head><body>
    <header><small>Redline vulnerability report${meta.id ? ` · ${escapeHtml(meta.id)}` : ""}${meta.target ? ` · ${escapeHtml(meta.target)}` : ""}</small><h1>${escapeHtml(title)}</h1></header>
    <main>${html}</main>
    <footer>${meta.hash ? `Content hash ${escapeHtml(meta.hash)} · ` : ""}Exported ${new Date().toLocaleString()}</footer>
  </body></html>`);
  doc.close();
  await new Promise((resolve) => setTimeout(resolve, 250));
  frame.contentWindow!.focus();
  frame.contentWindow!.print();
  setTimeout(() => frame.remove(), 4000);
}
