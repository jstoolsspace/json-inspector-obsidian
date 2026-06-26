/**
 * Compact toolbar with TREE / RAW / QUERY tabs and a search toggle.
 * Uses proper ARIA tab semantics and arrow-key navigation between tabs.
 */
import { setIcon } from "obsidian";
import type { ViewMode } from "../settings";

export interface ToolbarCallbacks {
  onTab: (mode: ViewMode) => void;
  onToggleSearch: () => void;
}

const TABS: { mode: ViewMode; label: string }[] = [
  { mode: "tree", label: "TREE" },
  { mode: "raw", label: "RAW" },
  { mode: "query", label: "QUERY" },
];

export class InspectorToolbar {
  readonly el: HTMLElement;
  private tabEls = new Map<ViewMode, HTMLElement>();
  private cb: ToolbarCallbacks;

  constructor(parent: HTMLElement, active: ViewMode, cb: ToolbarCallbacks) {
    this.cb = cb;
    this.el = parent.createDiv({ cls: "jsi-toolbar" });

    const tablist = this.el.createDiv({ cls: "jsi-tabs" });
    tablist.setAttribute("role", "tablist");
    tablist.setAttribute("aria-label", "JSON inspector views");

    for (const { mode, label } of TABS) {
      const tab = tablist.createEl("button", {
        cls: "jsi-tab",
        text: label,
        attr: { role: "tab", "aria-label": `${label} view` },
      });
      tab.addEventListener("click", () => this.cb.onTab(mode));
      tab.addEventListener("keydown", (e) => this.onTabKey(e, mode));
      this.tabEls.set(mode, tab);
    }

    const spacer = this.el.createDiv({ cls: "jsi-spacer" });
    spacer.setAttribute("aria-hidden", "true");

    const searchBtn = this.el.createEl("button", {
      cls: "jsi-btn jsi-square-btn",
      attr: { "aria-label": "Find in JSON (Ctrl/Cmd+F)", title: "Find" },
    });
    setIcon(searchBtn, "search");
    searchBtn.addEventListener("click", () => this.cb.onToggleSearch());

    this.setActive(active);
  }

  setActive(mode: ViewMode): void {
    for (const [m, el] of this.tabEls) {
      const isActive = m === mode;
      el.toggleClass("is-active", isActive);
      el.setAttribute("aria-selected", String(isActive));
      el.tabIndex = isActive ? 0 : -1;
    }
  }

  private onTabKey(e: KeyboardEvent, mode: ViewMode): void {
    const order = TABS.map((t) => t.mode);
    const idx = order.indexOf(mode);
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      e.preventDefault();
      const delta = e.key === "ArrowRight" ? 1 : -1;
      const next = order[(idx + delta + order.length) % order.length];
      this.tabEls.get(next)?.focus();
      this.cb.onTab(next);
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      this.cb.onTab(mode);
    }
  }

  destroy(): void {
    this.el.remove();
  }
}
