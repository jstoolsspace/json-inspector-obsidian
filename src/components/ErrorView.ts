/**
 * Renders a tidy parse-error panel. Shows the message, line/column, a small
 * snippet around the problem, and keeps the original source copyable.
 */
import { setIcon } from "obsidian";
import { ParseError, buildErrorSnippet } from "../services/jsonParser";
import { copyText } from "../services/clipboard";

export class ErrorView {
  readonly el: HTMLElement;

  constructor(parent: HTMLElement, error: ParseError, source: string) {
    this.el = parent.createDiv({ cls: "jsi-error" });

    const header = this.el.createDiv({ cls: "jsi-error-header" });
    const icon = header.createSpan({ cls: "jsi-error-icon" });
    setIcon(icon, "alert-triangle");
    header.createSpan({ cls: "jsi-error-title", text: "Invalid JSON" });

    const loc =
      error.line !== null && error.column !== null
        ? `Line ${error.line}, column ${error.column}`
        : "Location unavailable";
    this.el.createDiv({ cls: "jsi-error-location", text: loc });

    this.el.createDiv({ cls: "jsi-error-message", text: error.message });

    const snippet = buildErrorSnippet(source, error.line, error.column);
    if (snippet) {
      this.el.createEl("pre", { cls: "jsi-error-snippet" }, (pre) => {
        pre.createEl("code", { text: snippet });
      });
    }

    const actions = this.el.createDiv({ cls: "jsi-error-actions" });
    const copyBtn = actions.createEl("button", {
      cls: "jsi-btn",
      attr: { "aria-label": "Copy original source" },
    });
    copyBtn.createSpan({ text: "Copy source" });
    copyBtn.addEventListener("click", () => {
      void (async () => {
        const ok = await copyText(source);
        const span = copyBtn.querySelector("span");
        if (span) {
          const prev = span.textContent;
          span.textContent = ok ? "COPIED" : "Copy failed";
          window.setTimeout(() => {
            span.textContent = prev;
          }, 1200);
        }
      })();
    });
  }

  destroy(): void {
    this.el.remove();
  }
}
