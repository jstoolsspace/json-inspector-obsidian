/**
 * Query view: run JSONPath expressions against the parsed value.
 * Executes on Enter (and debounced while typing), shows a match count and a
 * results list, lets the user copy each result's value and path, and keeps a
 * local history of the last 10 queries.
 */
import { setIcon, Notice } from "obsidian";
import { stringify as losslessStringify } from "lossless-json";
import { JsonValue, isContainer, primitiveToDisplay } from "../services/jsonParser";
import { queryJsonPath, JsonPathMatch } from "../services/jsonPath";
import { toJsonPath } from "../utils/paths";
import { truncateMiddle } from "../utils/formatting";
import { copyText } from "../services/clipboard";
import type { InspectorSettings } from "../settings";

export interface QueryCallbacks {
  getHistory: () => string[];
  pushHistory: (query: string) => void;
}

export class QueryView {
  readonly el: HTMLElement;
  private input: HTMLInputElement;
  private statusEl: HTMLElement;
  private resultsEl: HTMLElement;
  private historyEl: HTMLElement;
  private value: JsonValue;
  private settings: InspectorSettings;
  private cb: QueryCallbacks;
  private debounceTimer: number | null = null;
  private runId = 0;

  constructor(parent: HTMLElement, value: JsonValue, settings: InspectorSettings, cb: QueryCallbacks) {
    this.value = value;
    this.settings = settings;
    this.cb = cb;
    this.el = parent.createDiv({ cls: "jsi-query" });

    const bar = this.el.createDiv({ cls: "jsi-query-bar" });
    const prompt = bar.createSpan({ cls: "jsi-query-prompt", text: "$" });
    prompt.setAttribute("aria-hidden", "true");
    this.input = bar.createEl("input", {
      cls: "jsi-query-input",
      attr: {
        type: "text",
        placeholder: "JSONPath, e.g. $.user.roles[*]",
        "aria-label": "JSONPath query",
        spellcheck: "false",
      },
    });
    const runBtn = bar.createEl("button", {
      cls: "jsi-btn jsi-square-btn",
      attr: { "aria-label": "Run query", title: "Run" },
    });
    setIcon(runBtn, "play");
    runBtn.addEventListener("click", () => this.run(this.input.value, true));

    this.statusEl = this.el.createDiv({ cls: "jsi-query-status" });
    this.statusEl.setAttribute("aria-live", "polite");

    this.resultsEl = this.el.createDiv({ cls: "jsi-query-results" });

    this.historyEl = this.el.createDiv({ cls: "jsi-query-history" });
    this.renderHistory();

    this.input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        this.run(this.input.value, true);
      }
    });
    this.input.addEventListener("input", () => {
      if (this.debounceTimer !== null) window.clearTimeout(this.debounceTimer);
      this.debounceTimer = window.setTimeout(() => this.run(this.input.value, false), 250);
    });
  }

  focus(): void {
    this.input.focus();
  }

  private run(query: string, record: boolean): void {
    const myRun = ++this.runId;
    const q = query.trim();
    this.resultsEl.empty();
    if (q.length === 0) {
      this.setStatus("");
      return;
    }
    const result = queryJsonPath(this.value, q);
    if (myRun !== this.runId) return;

    if (!result.ok) {
      this.setStatus(result.message, "error");
      return;
    }
    if (record && this.settings.rememberQueryHistory) {
      this.cb.pushHistory(q);
      this.renderHistory();
    }
    this.setStatus(`${result.matches.length} match${result.matches.length === 1 ? "" : "es"}`);
    this.renderResults(result.matches);
  }

  private setStatus(text: string, kind?: "error"): void {
    this.statusEl.setText(text);
    this.statusEl.toggleClass("jsi-query-error", kind === "error");
  }

  private renderResults(matches: JsonPathMatch[]): void {
    const frag = document.createDocumentFragment();
    const host = document.createElement("div");
    const limit = Math.min(matches.length, this.settings.maxInitialNodes);
    for (let i = 0; i < limit; i++) {
      const m = matches[i];
      const row = host.createDiv({ cls: "jsi-result" });
      const pathText = toJsonPath(m.path);
      const valueText = this.valueText(m.value);

      const main = row.createDiv({ cls: "jsi-result-main" });
      main.createDiv({ cls: "jsi-result-path", text: pathText });
      main.createDiv({ cls: "jsi-result-value", text: truncateMiddle(valueText, 300) });

      const actions = row.createDiv({ cls: "jsi-result-actions" });
      this.copyBtn(actions, "Copy value", "clipboard", valueText);
      this.copyBtn(actions, "Copy path", "route", pathText);
    }
    while (host.firstChild) frag.appendChild(host.firstChild);
    this.resultsEl.appendChild(frag);

    if (matches.length > limit) {
      this.resultsEl.createDiv({
        cls: "jsi-result-more",
        text: `… ${matches.length - limit} more results not shown`,
      });
    }
  }

  private copyBtn(parent: HTMLElement, label: string, icon: string, text: string): void {
    const btn = parent.createEl("button", {
      cls: "jsi-btn jsi-square-btn",
      attr: { "aria-label": label, title: label },
    });
    setIcon(btn, icon);
    btn.addEventListener("click", async () => {
      const ok = await copyText(text);
      new Notice(ok ? "Copied" : "Copy failed");
    });
  }

  private valueText(value: JsonValue): string {
    if (isContainer(value)) return losslessStringify(value, undefined, this.settings.indentSize) ?? "";
    return primitiveToDisplay(value);
  }

  private renderHistory(): void {
    this.historyEl.empty();
    if (!this.settings.rememberQueryHistory) return;
    const history = this.cb.getHistory();
    if (history.length === 0) return;
    this.historyEl.createDiv({ cls: "jsi-history-label", text: "Recent" });
    const list = this.historyEl.createDiv({ cls: "jsi-history-list" });
    for (const q of history) {
      const chip = list.createEl("button", {
        cls: "jsi-history-chip",
        text: truncateMiddle(q, 60),
        attr: { "aria-label": `Run query ${q}`, title: q },
      });
      chip.addEventListener("click", () => {
        this.input.value = q;
        this.run(q, false);
        this.input.focus();
      });
    }
  }

  destroy(): void {
    if (this.debounceTimer !== null) window.clearTimeout(this.debounceTimer);
    this.el.remove();
  }
}
