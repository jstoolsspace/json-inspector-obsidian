/**
 * In-inspector search bar (Ctrl/Cmd+F). Searches keys and values, reports a
 * match count, supports Next/Previous, reveals the active hit in the tree, and
 * closes on Escape. Searching is debounced and stale runs are discarded.
 */
import { setIcon } from "obsidian";
import { JsonValue } from "../services/jsonParser";
import { searchJson, SearchHit } from "../services/search";
import { PathSegment } from "../utils/paths";

export interface SearchCallbacks {
  /** Apply (or clear) the highlight across the tree. */
  onHighlight: (query: string, caseSensitive: boolean) => void;
  /** Reveal and focus the hit at the given path. */
  onReveal: (path: PathSegment[]) => void;
  /** Close the search UI. */
  onClose: () => void;
}

export class SearchPanel {
  readonly el: HTMLElement;
  private input: HTMLInputElement;
  private countEl: HTMLElement;
  private value: JsonValue;
  private cb: SearchCallbacks;
  private hits: SearchHit[] = [];
  private current = -1;
  private caseSensitive = false;
  private debounceTimer: number | null = null;
  private runId = 0;

  constructor(parent: HTMLElement, value: JsonValue, cb: SearchCallbacks) {
    this.value = value;
    this.cb = cb;
    this.el = parent.createDiv({ cls: "jsi-search" });
    this.el.setAttribute("role", "search");

    const iconEl = this.el.createSpan({ cls: "jsi-search-icon" });
    setIcon(iconEl, "search");

    this.input = this.el.createEl("input", {
      cls: "jsi-search-input",
      attr: { type: "text", placeholder: "Find in JSON…", "aria-label": "Find in JSON" },
    });

    this.countEl = this.el.createSpan({ cls: "jsi-search-count", text: "0/0" });
    this.countEl.setAttribute("aria-live", "polite");

    this.makeBtn("Previous", "chevron-up", () => this.step(-1));
    this.makeBtn("Next", "chevron-down", () => this.step(1));
    const caseBtn = this.makeBtn("Match case", "case-sensitive", () => {
      this.caseSensitive = !this.caseSensitive;
      caseBtn.toggleClass("is-active", this.caseSensitive);
      this.runSearch(this.input.value);
    });
    this.makeBtn("Close", "x", () => this.cb.onClose());

    this.input.addEventListener("input", () => this.scheduleSearch(this.input.value));
    this.input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        this.step(e.shiftKey ? -1 : 1);
      } else if (e.key === "Escape") {
        e.preventDefault();
        this.cb.onClose();
      }
    });
  }

  focus(): void {
    this.input.focus();
    this.input.select();
  }

  private makeBtn(label: string, icon: string, onClick: () => void): HTMLElement {
    const btn = this.el.createEl("button", {
      cls: "jsi-btn jsi-square-btn",
      attr: { "aria-label": label, title: label },
    });
    setIcon(btn, icon);
    btn.addEventListener("click", onClick);
    return btn;
  }

  private scheduleSearch(query: string): void {
    if (this.debounceTimer !== null) window.clearTimeout(this.debounceTimer);
    this.debounceTimer = window.setTimeout(() => this.runSearch(query), 180);
  }

  private runSearch(query: string): void {
    const myRun = ++this.runId; // invalidate older async/debounced runs
    this.cb.onHighlight(query, this.caseSensitive);
    if (query.trim().length === 0) {
      this.hits = [];
      this.current = -1;
      this.updateCount();
      return;
    }
    const hits = searchJson(this.value, query, { caseSensitive: this.caseSensitive });
    if (myRun !== this.runId) return; // a newer search superseded this one
    this.hits = hits;
    this.current = hits.length > 0 ? 0 : -1;
    this.updateCount();
    if (this.current >= 0) this.cb.onReveal(this.hits[this.current].path);
  }

  private step(delta: number): void {
    if (this.hits.length === 0) return;
    this.current = (this.current + delta + this.hits.length) % this.hits.length;
    this.updateCount();
    this.cb.onReveal(this.hits[this.current].path);
  }

  private updateCount(): void {
    const total = this.hits.length;
    const pos = total === 0 ? 0 : this.current + 1;
    this.countEl.setText(`${pos}/${total}`);
    this.countEl.toggleClass("jsi-no-results", total === 0 && this.input.value.trim().length > 0);
  }

  destroy(): void {
    if (this.debounceTimer !== null) window.clearTimeout(this.debounceTimer);
    this.cb.onHighlight("", this.caseSensitive);
    this.el.remove();
  }
}
