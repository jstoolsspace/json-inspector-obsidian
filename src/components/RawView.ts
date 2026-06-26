/**
 * Raw view: shows the exact original JSON text and offers Beautify / Minify /
 * word-wrap toggle / Copy. Beautify and Minify re-serialise losslessly, so
 * numbers and key order are never altered.
 */
import { setIcon } from "obsidian";
import { beautify, minify } from "../utils/formatting";
import { copyText } from "../services/clipboard";

export class RawView {
  readonly el: HTMLElement;
  private pre: HTMLElement;
  private code: HTMLElement;
  private current: string;
  private wrap: boolean;

  constructor(parent: HTMLElement, source: string, indent: number, wordWrap: boolean) {
    this.current = source;
    this.wrap = wordWrap;
    this.el = parent.createDiv({ cls: "jsi-raw" });

    const toolbar = this.el.createDiv({ cls: "jsi-raw-toolbar" });
    this.addButton(toolbar, "Beautify", "align-left", () => {
      try {
        this.setText(beautify(this.current, indent));
      } catch {
        /* leave text unchanged on invalid input */
      }
    });
    this.addButton(toolbar, "Minify", "minus", () => {
      try {
        this.setText(minify(this.current));
      } catch {
        /* ignore */
      }
    });

    const wrapBtn = this.addButton(toolbar, "Wrap", "wrap-text", () => {
      this.wrap = !this.wrap;
      this.applyWrap();
      wrapBtn.toggleClass("is-active", this.wrap);
    });
    wrapBtn.toggleClass("is-active", this.wrap);

    const spacer = toolbar.createDiv({ cls: "jsi-spacer" });
    spacer.setAttribute("aria-hidden", "true");

    this.addCopyButton(toolbar);

    this.pre = this.el.createEl("pre", { cls: "jsi-raw-pre" });
    this.code = this.pre.createEl("code");
    this.setText(source);
    this.applyWrap();
  }

  private addButton(
    parent: HTMLElement,
    label: string,
    icon: string,
    onClick: () => void,
  ): HTMLElement {
    const btn = parent.createEl("button", {
      cls: "jsi-btn jsi-icon-btn",
      attr: { "aria-label": label, title: label },
    });
    const iconEl = btn.createSpan({ cls: "jsi-btn-icon" });
    setIcon(iconEl, icon);
    btn.createSpan({ cls: "jsi-btn-label", text: label });
    btn.addEventListener("click", onClick);
    return btn;
  }

  private addCopyButton(parent: HTMLElement): void {
    const btn = parent.createEl("button", {
      cls: "jsi-btn jsi-icon-btn",
      attr: { "aria-label": "Copy raw JSON", title: "Copy" },
    });
    const iconEl = btn.createSpan({ cls: "jsi-btn-icon" });
    setIcon(iconEl, "copy");
    const label = btn.createSpan({ cls: "jsi-btn-label", text: "Copy" });
    btn.addEventListener("click", async () => {
      const ok = await copyText(this.current);
      label.textContent = ok ? "COPIED" : "FAILED";
      window.setTimeout(() => {
        label.textContent = "Copy";
      }, 1200);
    });
  }

  private setText(text: string): void {
    this.current = text;
    this.code.textContent = text; // textContent => no innerHTML, safe
  }

  private applyWrap(): void {
    this.pre.toggleClass("jsi-nowrap", !this.wrap);
  }

  focus(): void {
    this.pre.focus?.();
  }

  destroy(): void {
    this.el.remove();
  }
}
