/**
 * JSON Inspector — Obsidian plugin entry point.
 *
 * Registers a Markdown code-block processor for `json-inspector` (and,
 * optionally, plain `json`) and renders each block as an interactive inspector.
 * All work is local: no network requests, no telemetry, no eval.
 */
import {
  Plugin,
  MarkdownPostProcessorContext,
  MarkdownRenderChild,
} from "obsidian";
import { JsonInspector } from "./components/JsonInspector";
import {
  DEFAULT_SETTINGS,
  InspectorSettings,
  JsonInspectorSettingTab,
  MAX_QUERY_HISTORY,
} from "./settings";

export default class JsonInspectorPlugin extends Plugin {
  settings: InspectorSettings = DEFAULT_SETTINGS;

  async onload(): Promise<void> {
    await this.loadSettings();

    this.registerMarkdownCodeBlockProcessor(
      "json-inspector",
      (source, element, context) => this.renderBlock(source, element, context),
    );

    // Optionally take over plain ```json blocks. Registered only when enabled
    // so we never interfere with other plugins by default. Toggling requires an
    // app reload to (de)register this processor.
    if (this.settings.renderStandardJson) {
      this.registerMarkdownCodeBlockProcessor(
        "json",
        (source, element, context) => this.renderBlock(source, element, context),
      );
    }

    this.addSettingTab(new JsonInspectorSettingTab(this.app, this));
  }

  private renderBlock(
    source: string,
    element: HTMLElement,
    context: MarkdownPostProcessorContext,
  ): void {
    const child = new InspectorRenderChild(element, source, this);
    context.addChild(child);
  }

  async loadSettings(): Promise<void> {
    const data = (await this.loadData()) as Partial<InspectorSettings> | null;
    this.settings = Object.assign({}, DEFAULT_SETTINGS, data ?? {});
    if (!Array.isArray(this.settings.queryHistory)) this.settings.queryHistory = [];
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  getQueryHistory(): string[] {
    return this.settings.rememberQueryHistory ? this.settings.queryHistory : [];
  }

  pushQueryHistory(query: string): void {
    if (!this.settings.rememberQueryHistory) return;
    const q = query.trim();
    if (q.length === 0) return;
    const list = this.settings.queryHistory.filter((x) => x !== q);
    list.unshift(q);
    this.settings.queryHistory = list.slice(0, MAX_QUERY_HISTORY);
    void this.saveSettings();
  }
}

/**
 * Wraps a single rendered inspector so Obsidian can dispose of it (and all its
 * listeners) when the containing note section is unloaded or re-rendered.
 */
class InspectorRenderChild extends MarkdownRenderChild {
  private inspector: JsonInspector | null = null;
  private source: string;
  private plugin: JsonInspectorPlugin;

  constructor(containerEl: HTMLElement, source: string, plugin: JsonInspectorPlugin) {
    super(containerEl);
    this.source = source;
    this.plugin = plugin;
  }

  onload(): void {
    this.inspector = new JsonInspector(this.containerEl, this.source, this.plugin.settings, {
      getQueryHistory: () => this.plugin.getQueryHistory(),
      pushQueryHistory: (q) => this.plugin.pushQueryHistory(q),
    });
  }

  onunload(): void {
    this.inspector?.destroy();
    this.inspector = null;
  }
}
