/**
 * Top-level component for one `json-inspector` code block. Owns the toolbar,
 * the three views (Tree / Raw / Query), and the search panel, and is
 * responsible for tearing everything down via destroy().
 */
import { parseJson, JsonValue } from "../services/jsonParser";
import { InspectorToolbar } from "./InspectorToolbar";
import { TreeView } from "./TreeView";
import { RawView } from "./RawView";
import { QueryView } from "./QueryView";
import { SearchPanel } from "./SearchPanel";
import { ErrorView } from "./ErrorView";
import { PathSegment } from "../utils/paths";
import type { InspectorSettings, ViewMode } from "../settings";

export interface InspectorDeps {
  getQueryHistory: () => string[];
  pushQueryHistory: (query: string) => void;
}

export class JsonInspector {
  readonly el: HTMLElement;
  private source: string;
  private settings: InspectorSettings;
  private deps: InspectorDeps;

  private parsed: JsonValue | null = null;
  private toolbar: InspectorToolbar | null = null;
  private bodyEl: HTMLElement | null = null;
  private treeHost: HTMLElement | null = null;

  private treeView: TreeView | null = null;
  private rawView: RawView | null = null;
  private queryView: QueryView | null = null;
  private searchPanel: SearchPanel | null = null;
  private errorView: ErrorView | null = null;

  private active: ViewMode;
  private highlight: { query: string; caseSensitive: boolean } | null = null;
  private keyHandler: ((e: KeyboardEvent) => void) | null = null;

  constructor(parent: HTMLElement, source: string, settings: InspectorSettings, deps: InspectorDeps) {
    this.source = source;
    this.settings = settings;
    this.deps = deps;
    this.active = settings.defaultView;
    this.el = parent.createDiv({ cls: "jsi-root" });

    const result = parseJson(source);
    if (!result.ok) {
      this.errorView = new ErrorView(this.el, result, source);
      return;
    }
    this.parsed = result.value;
    this.render();
  }

  private render(): void {
    this.toolbar = new InspectorToolbar(this.el, this.active, {
      onTab: (mode) => this.switchView(mode),
      onToggleSearch: () => this.toggleSearch(),
    });

    this.bodyEl = this.el.createDiv({ cls: "jsi-body" });
    this.switchView(this.active);

    this.keyHandler = (e) => this.onKeyDown(e);
    this.el.addEventListener("keydown", this.keyHandler, true);
  }

  private switchView(mode: ViewMode): void {
    if (!this.bodyEl || this.parsed === null) return;
    this.active = mode;
    this.toolbar?.setActive(mode);
    this.bodyEl.empty();
    this.treeView = null;
    this.rawView = null;
    this.queryView = null;
    this.treeHost = null;

    if (mode === "tree") {
      this.treeHost = this.bodyEl.createDiv({ cls: "jsi-tree-host" });
      this.buildTree();
    } else if (mode === "raw") {
      this.rawView = new RawView(
        this.bodyEl,
        this.source,
        this.settings.indentSize,
        this.settings.wordWrap,
      );
    } else {
      this.queryView = new QueryView(this.bodyEl, this.parsed, this.settings, {
        getHistory: () => this.deps.getQueryHistory(),
        pushHistory: (q) => this.deps.pushQueryHistory(q),
      });
      this.queryView.focus();
    }
  }

  private buildTree(): void {
    if (!this.treeHost || this.parsed === null) return;
    this.treeView = new TreeView(this.treeHost, this.parsed, this.settings, this.highlight);
  }

  private rebuildTreeWithHighlight(): void {
    if (this.active !== "tree" || !this.treeHost) return;
    this.treeView?.destroy();
    this.treeHost.empty();
    this.buildTree();
  }

  // ---- search -------------------------------------------------------------

  private toggleSearch(): void {
    if (this.searchPanel) {
      this.closeSearch();
    } else {
      this.openSearch();
    }
  }

  private openSearch(): void {
    if (this.parsed === null || !this.bodyEl) return;
    // Search operates on the tree; switch to it if necessary.
    if (this.active !== "tree") this.switchView("tree");
    this.searchPanel = new SearchPanel(this.el, this.parsed, {
      onHighlight: (query, caseSensitive) => {
        this.highlight = query ? { query, caseSensitive } : null;
        this.rebuildTreeWithHighlight();
      },
      onReveal: (path: PathSegment[]) => {
        this.treeView?.revealPath(path);
      },
      onClose: () => this.closeSearch(),
    });
    // Place the search bar directly under the toolbar.
    if (this.toolbar) this.el.insertAfter(this.searchPanel.el, this.toolbar.el);
    this.searchPanel.focus();
  }

  private closeSearch(): void {
    this.searchPanel?.destroy();
    this.searchPanel = null;
    this.highlight = null;
    this.rebuildTreeWithHighlight();
  }

  private onKeyDown(e: KeyboardEvent): void {
    if ((e.ctrlKey || e.metaKey) && (e.key === "f" || e.key === "F")) {
      e.preventDefault();
      e.stopPropagation();
      if (!this.searchPanel) this.openSearch();
      else this.searchPanel.focus();
    } else if (e.key === "Escape" && this.searchPanel) {
      e.preventDefault();
      this.closeSearch();
    }
  }

  destroy(): void {
    if (this.keyHandler) this.el.removeEventListener("keydown", this.keyHandler, true);
    this.searchPanel?.destroy();
    this.treeView?.destroy();
    this.rawView?.destroy();
    this.queryView?.destroy();
    this.errorView?.destroy();
    this.toolbar?.destroy();
    this.el.remove();
  }
}
