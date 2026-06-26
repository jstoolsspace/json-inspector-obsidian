/**
 * A single node in the tree. Builds its children lazily (only when expanded),
 * so collapsed subtrees cost nothing and very large structures stay responsive.
 * Within one container, children are rendered in capped chunks via a
 * DocumentFragment, with a "show more" control for the remainder.
 */
import {
  JsonValue,
  JsonObject,
  kindOf,
  isContainer,
  childCount,
  primitiveToDisplay,
} from "../services/jsonParser";
import { PathSegment, segmentLabel } from "../utils/paths";
import { countLabel, truncateMiddle, quoteString } from "../utils/formatting";
import type { InspectorSettings } from "../settings";

export interface TreeContext {
  settings: InspectorSettings;
  /** Open the per-node actions menu, anchored to an element. */
  onMenu: (node: TreeNode, anchor: HTMLElement) => void;
  /** Active highlight, or null. */
  highlight: { query: string; caseSensitive: boolean } | null;
  /** Called whenever the set of visible rows changes (expand/collapse). */
  onStructureChange: () => void;
}

const CHUNK = 200;

export class TreeNode {
  readonly el: HTMLElement;
  readonly value: JsonValue;
  readonly path: PathSegment[];
  /** Object key or array index for this node; null for the synthetic root. */
  readonly key: PathSegment | null;
  readonly depth: number;
  private readonly ctx: TreeContext;
  private readonly isRoot: boolean;

  private row: HTMLElement | null = null;
  private toggleEl: HTMLElement | null = null;
  private childrenEl: HTMLElement | null = null;
  private childNodes: TreeNode[] = [];
  private childMap = new Map<string, TreeNode>();
  private expanded = false;
  private built = false;
  private rendered = 0; // how many children have been materialised
  private moreBtn: HTMLElement | null = null;

  constructor(
    parent: HTMLElement,
    value: JsonValue,
    path: PathSegment[],
    key: PathSegment | null,
    depth: number,
    ctx: TreeContext,
    isRoot = false,
  ) {
    this.value = value;
    this.path = path;
    this.key = key;
    this.depth = depth;
    this.ctx = ctx;
    this.isRoot = isRoot;
    this.el = parent.createDiv({ cls: isRoot ? "jsi-tree-root" : "jsi-node" });

    if (isRoot) {
      this.childrenEl = this.el;
      this.expanded = true;
    } else {
      this.buildRow();
    }
  }

  // ---- public API ---------------------------------------------------------

  get isExpandable(): boolean {
    return isContainer(this.value);
  }

  getRow(): HTMLElement | null {
    return this.row;
  }

  /** Initial population for the root and auto-expansion to a default depth. */
  initRoot(expandDepth: number): void {
    this.ensureBuilt();
    this.autoExpand(expandDepth);
  }

  private autoExpand(remaining: number): void {
    for (const child of this.childNodes) {
      if (child.isExpandable && remaining > 0) {
        child.expand();
        child.autoExpand(remaining - 1);
      }
    }
  }

  expand(): void {
    if (!this.isExpandable || this.expanded) {
      if (this.isExpandable) this.ensureBuilt();
      return;
    }
    this.expanded = true;
    this.ensureBuilt();
    if (this.childrenEl) this.childrenEl.style.display = "";
    this.updateToggle();
    if (this.row) this.row.setAttribute("aria-expanded", "true");
    this.ctx.onStructureChange();
  }

  collapse(): void {
    if (!this.isExpandable || !this.expanded || this.isRoot) return;
    this.expanded = false;
    if (this.childrenEl) this.childrenEl.style.display = "none";
    this.updateToggle();
    if (this.row) this.row.setAttribute("aria-expanded", "false");
    this.ctx.onStructureChange();
  }

  toggle(): void {
    if (this.expanded) this.collapse();
    else this.expand();
  }

  expandSubtree(): void {
    if (!this.isExpandable) return;
    this.expand();
    for (const child of this.childNodes) child.expandSubtree();
    if (this.moreBtn) this.renderMore(Number.MAX_SAFE_INTEGER);
  }

  collapseSubtree(): void {
    if (!this.isExpandable) return;
    for (const child of this.childNodes) child.collapseSubtree();
    this.collapse();
  }

  /** Expand toward a descendant path and return its row, or null. */
  reveal(segments: PathSegment[], index: number): HTMLElement | null {
    if (index >= segments.length) return this.row;
    if (!this.isExpandable) return null;
    this.expand();
    // Make sure the target child is materialised even past the chunk cap.
    this.ensureChildMaterialised(segments[index]);
    const child = this.childMap.get(String(segments[index]));
    if (!child) return null;
    return child.reveal(segments, index + 1);
  }

  destroy(): void {
    for (const c of this.childNodes) c.destroy();
    this.childNodes = [];
    this.childMap.clear();
    this.el.remove();
  }

  // ---- row construction ---------------------------------------------------

  private buildRow(): void {
    const kind = kindOf(this.value);
    this.row = this.el.createDiv({ cls: "jsi-row" });
    this.row.setAttribute("role", "treeitem");
    this.row.tabIndex = -1;
    this.row.style.setProperty("--jsi-depth", String(this.depth));

    // Toggle / spacer
    if (this.isExpandable) {
      this.toggleEl = this.row.createSpan({ cls: "jsi-toggle" });
      this.toggleEl.setAttribute("aria-hidden", "true");
      this.row.setAttribute("aria-expanded", "false");
      this.toggleEl.addEventListener("click", (e) => {
        e.stopPropagation();
        this.toggle();
        this.focus();
      });
    } else {
      this.row.createSpan({ cls: "jsi-toggle jsi-toggle-empty" });
    }

    // Key
    if (this.key !== null) {
      const keyCls =
        typeof this.key === "number" ? "jsi-key jsi-index" : "jsi-key";
      const keyEl = this.row.createSpan({ cls: keyCls });
      this.appendHighlighted(keyEl, segmentLabel(this.key));
      this.row.createSpan({ cls: "jsi-colon", text: ": " });
    }

    // Value / summary
    if (this.isExpandable) {
      this.buildContainerSummary(kind);
    } else {
      this.buildLeaf(kind);
    }

    // Actions
    const actions = this.row.createSpan({ cls: "jsi-actions" });
    const btn = actions.createEl("button", {
      cls: "jsi-action-btn",
      attr: { "aria-label": "Node actions", title: "Node actions" },
    });
    btn.textContent = "⋯";
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      this.ctx.onMenu(this, btn);
    });

    // Row interactions
    this.row.addEventListener("click", () => {
      if (this.isExpandable) this.toggle();
      this.focus();
    });

    this.updateToggle();
  }

  private buildContainerSummary(kind: string): void {
    const summary = this.row!.createSpan({ cls: "jsi-summary" });
    const open = kind === "array" ? "[" : "{";
    summary.createSpan({ cls: "jsi-bracket", text: open });
    if (this.ctx.settings.showItemCounts) {
      const n = childCount(this.value);
      summary.createSpan({
        cls: "jsi-count",
        text: ` ${countLabel(n, kind === "array" ? "array" : "object")} `,
      });
    } else {
      summary.createSpan({ text: " … " });
    }
    summary.createSpan({
      cls: "jsi-bracket",
      text: kind === "array" ? "]" : "}",
    });
  }

  private buildLeaf(kind: string): void {
    const valEl = this.row!.createSpan({ cls: `jsi-value jsi-${kind}` });
    if (kind === "string") {
      const raw = this.value as unknown as string;
      const display = truncateMiddle(quoteString(raw), 400);
      this.appendHighlighted(valEl, display, primitiveToDisplay(this.value));
    } else {
      valEl.setText(primitiveToDisplay(this.value));
      this.maybeHighlightPlain(valEl, primitiveToDisplay(this.value));
    }
  }

  // ---- children -----------------------------------------------------------

  private ensureBuilt(): void {
    if (this.built || !this.isExpandable) return;
    this.built = true;
    if (!this.childrenEl) {
      this.childrenEl = this.el.createDiv({ cls: "jsi-children" });
      this.childrenEl.setAttribute("role", "group");
    }
    const cap = Math.max(1, this.ctx.settings.maxInitialNodes);
    this.renderMore(Math.min(cap, CHUNK));
  }

  private renderMore(count: number): void {
    if (!this.childrenEl) return;
    if (this.moreBtn) {
      this.moreBtn.remove();
      this.moreBtn = null;
    }
    const entries = this.entries();
    const end = Math.min(this.rendered + count, entries.length);
    const frag = document.createDocumentFragment();
    const host = createDiv();
    for (let i = this.rendered; i < end; i++) {
      const [seg, val] = entries[i];
      const child = new TreeNode(
        host,
        val,
        [...this.path, seg],
        seg,
        this.depth + 1,
        this.ctx,
      );
      this.childNodes.push(child);
      this.childMap.set(String(seg), child);
    }
    while (host.firstChild) frag.appendChild(host.firstChild);
    this.childrenEl.appendChild(frag);
    this.rendered = end;

    if (this.rendered < entries.length) {
      this.moreBtn = this.childrenEl.createEl("button", {
        cls: "jsi-more",
        text: `Show ${Math.min(CHUNK, entries.length - this.rendered)} more (${entries.length - this.rendered} remaining)`,
      });
      this.moreBtn.style.setProperty("--jsi-depth", String(this.depth + 1));
      this.moreBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        this.renderMore(CHUNK);
        this.ctx.onStructureChange();
      });
    }
  }

  private ensureChildMaterialised(seg: PathSegment): void {
    if (this.childMap.has(String(seg))) return;
    const entries = this.entries();
    const targetIndex = entries.findIndex(([s]) => String(s) === String(seg));
    if (targetIndex < 0) return;
    if (targetIndex >= this.rendered) {
      this.renderMore(targetIndex - this.rendered + 1);
    }
  }

  private entries(): [PathSegment, JsonValue][] {
    if (Array.isArray(this.value)) {
      return this.value.map((v, i) => [i, v] as [PathSegment, JsonValue]);
    }
    const obj = this.value as JsonObject;
    return Object.keys(obj).map((k) => [k, obj[k]] as [PathSegment, JsonValue]);
  }

  // ---- helpers ------------------------------------------------------------

  focus(): void {
    this.row?.focus();
  }

  private updateToggle(): void {
    if (!this.toggleEl) return;
    this.toggleEl.setText(this.expanded ? "▾" : "▸");
  }

  /** Append text, wrapping matches of the active highlight in <span.jsi-mark>. */
  private appendHighlighted(parent: HTMLElement, text: string, matchAgainst?: string): void {
    const hl = this.ctx.highlight;
    if (!hl || hl.query.length === 0) {
      parent.appendText(text);
      return;
    }
    // We highlight the *display* text but test the match against the provided
    // source string when given (so quoted strings still highlight correctly).
    const hay = matchAgainst ?? text;
    if (!this.matches(hay, hl)) {
      parent.appendText(text);
      return;
    }
    this.splitHighlight(parent, text, hl);
  }

  private maybeHighlightPlain(parent: HTMLElement, text: string): void {
    const hl = this.ctx.highlight;
    if (!hl || hl.query.length === 0 || !this.matches(text, hl)) return;
    parent.empty();
    this.splitHighlight(parent, text, hl);
  }

  private splitHighlight(
    parent: HTMLElement,
    text: string,
    hl: { query: string; caseSensitive: boolean },
  ): void {
    const hay = hl.caseSensitive ? text : text.toLowerCase();
    const needle = hl.caseSensitive ? hl.query : hl.query.toLowerCase();
    let i = 0;
    let idx = hay.indexOf(needle, i);
    if (idx === -1) {
      parent.appendText(text);
      return;
    }
    while (idx !== -1) {
      if (idx > i) parent.appendText(text.slice(i, idx));
      parent.createSpan({ cls: "jsi-mark", text: text.slice(idx, idx + needle.length) });
      i = idx + needle.length;
      idx = hay.indexOf(needle, i);
    }
    if (i < text.length) parent.appendText(text.slice(i));
  }

  private matches(text: string, hl: { query: string; caseSensitive: boolean }): boolean {
    const hay = hl.caseSensitive ? text : text.toLowerCase();
    const needle = hl.caseSensitive ? hl.query : hl.query.toLowerCase();
    return hay.includes(needle);
  }
}

function createDiv(): HTMLElement {
  return document.createElement("div");
}
