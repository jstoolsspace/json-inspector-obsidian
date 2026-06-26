/**
 * Tree view container. Owns the root node, the Expand/Collapse-all controls,
 * keyboard navigation, the per-node actions menu, and search reveal/highlight.
 */
import { Menu, setIcon, Notice } from "obsidian";
import { stringify as losslessStringify } from "lossless-json";
import { JsonValue, isContainer, primitiveToDisplay } from "../services/jsonParser";
import { TreeNode, TreeContext } from "./TreeNode";
import { PathSegment, toJsonPath, toJsonPointer, segmentLabel } from "../utils/paths";
import { copyText } from "../services/clipboard";
import type { InspectorSettings } from "../settings";

export class TreeView {
  readonly el: HTMLElement;
  private root: TreeNode;
  private treeEl: HTMLElement;
  private ctx: TreeContext;
  private indent: number;
  private focusedRow: HTMLElement | null = null;
  private keyHandler: (e: KeyboardEvent) => void;

  constructor(
    parent: HTMLElement,
    value: JsonValue,
    settings: InspectorSettings,
    highlight: { query: string; caseSensitive: boolean } | null = null,
  ) {
    this.indent = settings.indentSize;
    this.el = parent.createDiv({ cls: "jsi-treeview" });

    // Controls
    const controls = this.el.createDiv({ cls: "jsi-tree-controls" });
    this.makeControl(controls, "Expand all", "chevrons-down-up", () => {
      this.root.expandSubtree();
      this.refreshNav();
    });
    this.makeControl(controls, "Collapse all", "chevrons-up-down", () => {
      this.root.collapseSubtree();
      this.refreshNav();
    });

    // Tree
    this.treeEl = this.el.createDiv({ cls: "jsi-tree" });
    this.treeEl.setAttribute("role", "tree");
    this.treeEl.setAttribute("aria-label", "JSON tree");
    this.treeEl.toggleClass("jsi-wrap", settings.wordWrap);

    this.ctx = {
      settings,
      highlight,
      onMenu: (node, anchor) => this.openMenu(node, anchor),
      onStructureChange: () => this.refreshNav(),
    };

    if (isContainer(value)) {
      this.root = new TreeNode(this.treeEl, value, [], null, 0, this.ctx, true);
      this.root.initRoot(settings.defaultExpandDepth);
    } else {
      // Primitive root: render a single leaf row.
      this.root = new TreeNode(this.treeEl, value, [], null, 0, this.ctx, true);
      this.treeEl.createDiv({ cls: "jsi-row jsi-root-primitive" }, (row) => {
        row.tabIndex = -1;
        row.setAttribute("role", "treeitem");
        row.createSpan({ cls: "jsi-value", text: primitiveToDisplay(value) });
      });
    }

    this.keyHandler = (e) => this.onKeyDown(e);
    this.treeEl.addEventListener("keydown", this.keyHandler);
    this.refreshNav();
  }

  private makeControl(parent: HTMLElement, label: string, icon: string, onClick: () => void): void {
    const btn = parent.createEl("button", {
      cls: "jsi-btn jsi-icon-btn",
      attr: { "aria-label": label, title: label },
    });
    const iconEl = btn.createSpan({ cls: "jsi-btn-icon" });
    setIcon(iconEl, icon);
    btn.createSpan({ cls: "jsi-btn-label", text: label });
    btn.addEventListener("click", onClick);
  }

  // ---- search integration -------------------------------------------------

  setHighlight(query: string, caseSensitive: boolean): void {
    this.ctx.highlight = query ? { query, caseSensitive } : null;
  }

  /** Expand to and focus the given path; returns the row if found. */
  revealPath(segments: PathSegment[]): HTMLElement | null {
    const row = this.root.reveal(segments, 0);
    this.refreshNav();
    if (row) {
      this.setFocusedRow(row);
      row.scrollIntoView({ block: "nearest" });
      row.addClass("jsi-current-hit");
      window.setTimeout(() => row.removeClass("jsi-current-hit"), 1500);
    }
    return row;
  }

  focusTree(): void {
    const rows = this.visibleRows();
    if (rows.length) this.setFocusedRow(rows[0]);
  }

  // ---- keyboard navigation ------------------------------------------------

  private visibleRows(): HTMLElement[] {
    const all = Array.from(
      this.treeEl.querySelectorAll<HTMLElement>(".jsi-row"),
    );
    return all.filter((r) => r.offsetParent !== null);
  }

  private setFocusedRow(row: HTMLElement): void {
    if (this.focusedRow) this.focusedRow.tabIndex = -1;
    this.focusedRow = row;
    row.tabIndex = 0;
    row.focus();
  }

  private refreshNav(): void {
    const rows = this.visibleRows();
    if (rows.length === 0) return;
    if (!this.focusedRow || !rows.includes(this.focusedRow)) {
      rows.forEach((r, i) => (r.tabIndex = i === 0 ? 0 : -1));
      // Don't steal focus; just make first row tabbable.
      if (this.focusedRow && !rows.includes(this.focusedRow)) this.focusedRow = null;
    }
  }

  private onKeyDown(e: KeyboardEvent): void {
    const rows = this.visibleRows();
    const active = (document.activeElement as HTMLElement) ?? this.focusedRow;
    const idx = active ? rows.indexOf(active) : -1;
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        if (idx < rows.length - 1) this.setFocusedRow(rows[idx + 1]);
        break;
      case "ArrowUp":
        e.preventDefault();
        if (idx > 0) this.setFocusedRow(rows[idx - 1]);
        break;
      case "ArrowRight": {
        e.preventDefault();
        if (idx < 0) break;
        const expanded = rows[idx].getAttribute("aria-expanded");
        if (expanded === "false") {
          rows[idx].click();
        } else if (idx < rows.length - 1) {
          this.setFocusedRow(rows[idx + 1]);
        }
        break;
      }
      case "ArrowLeft": {
        e.preventDefault();
        if (idx < 0) break;
        const expanded = rows[idx].getAttribute("aria-expanded");
        if (expanded === "true") {
          rows[idx].click();
        }
        break;
      }
      case "Enter":
      case " ":
        if (idx >= 0) {
          e.preventDefault();
          rows[idx].click();
        }
        break;
      case "Home":
        e.preventDefault();
        if (rows.length) this.setFocusedRow(rows[0]);
        break;
      case "End":
        e.preventDefault();
        if (rows.length) this.setFocusedRow(rows[rows.length - 1]);
        break;
    }
  }

  // ---- actions menu -------------------------------------------------------

  private openMenu(node: TreeNode, anchor: HTMLElement): void {
    const menu = new Menu();
    const value = node.value;
    const path = node.path;

    menu.addItem((i) =>
      i
        .setTitle("Copy value")
        .setIcon("clipboard")
        .onClick(() => this.copy(this.valueToText(value))),
    );
    if (node.key !== null) {
      menu.addItem((i) =>
        i
          .setTitle("Copy key")
          .setIcon("key")
          .onClick(() => this.copy(segmentLabel(node.key as PathSegment))),
      );
    }
    menu.addItem((i) =>
      i
        .setTitle("Copy object")
        .setIcon("braces")
        .onClick(() => this.copy(this.stringify(value))),
    );
    menu.addSeparator();
    menu.addItem((i) =>
      i
        .setTitle("Copy JSONPath")
        .setIcon("route")
        .onClick(() => this.copy(toJsonPath(path))),
    );
    menu.addItem((i) =>
      i
        .setTitle("Copy JSON Pointer")
        .setIcon("locate")
        .onClick(() => this.copy(toJsonPointer(path))),
    );
    if (node.isExpandable) {
      menu.addSeparator();
      menu.addItem((i) =>
        i
          .setTitle("Expand subtree")
          .setIcon("chevrons-down-up")
          .onClick(() => {
            node.expandSubtree();
            this.refreshNav();
          }),
      );
      menu.addItem((i) =>
        i
          .setTitle("Collapse subtree")
          .setIcon("chevrons-up-down")
          .onClick(() => {
            node.collapseSubtree();
            this.refreshNav();
          }),
      );
    }

    const rect = anchor.getBoundingClientRect();
    menu.showAtPosition({ x: rect.left, y: rect.bottom });
  }

  private valueToText(value: JsonValue): string {
    if (isContainer(value)) return this.stringify(value);
    return primitiveToDisplay(value);
  }

  private stringify(value: JsonValue): string {
    return losslessStringify(value, undefined, this.indent) ?? "";
  }

  private async copy(text: string): Promise<void> {
    const ok = await copyText(text);
    new Notice(ok ? "Copied" : "Copy failed");
  }

  destroy(): void {
    this.treeEl.removeEventListener("keydown", this.keyHandler);
    this.root.destroy();
    this.el.remove();
  }
}
