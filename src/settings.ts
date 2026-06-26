/**
 * Plugin settings: data model, defaults and the settings tab UI.
 *
 * Privacy note: only user preferences and (optionally) the list of recent
 * JSONPath queries are persisted. Note JSON content is never written here.
 */
import { App, PluginSettingTab, Setting } from "obsidian";
import type JsonInspectorPlugin from "./main";

export type ViewMode = "tree" | "raw" | "query";

export interface InspectorSettings {
  /** Which tab is shown first. */
  defaultView: ViewMode;
  /** How many levels are expanded initially in the tree. */
  defaultExpandDepth: number;
  /** Indentation used by the Raw view's Beautify action. */
  indentSize: 2 | 4;
  /** Wrap long lines in Raw view and long values in Tree view. */
  wordWrap: boolean;
  /** Show "n items" / "n keys" badges on containers. */
  showItemCounts: boolean;
  /** Also render standard ```json blocks as the inspector. Off by default. */
  renderStandardJson: boolean;
  /** Cap on the number of nodes rendered before showing a "load more" control. */
  maxInitialNodes: number;
  /** Remember the last 10 JSONPath queries across sessions. */
  rememberQueryHistory: boolean;
  /** Persisted recent JSONPath queries (most recent first). */
  queryHistory: string[];
}

export const DEFAULT_SETTINGS: InspectorSettings = {
  defaultView: "tree",
  defaultExpandDepth: 2,
  indentSize: 2,
  wordWrap: true,
  showItemCounts: true,
  renderStandardJson: false,
  maxInitialNodes: 2000,
  rememberQueryHistory: true,
  queryHistory: [],
};

export const MAX_QUERY_HISTORY = 10;

export class JsonInspectorSettingTab extends PluginSettingTab {
  private plugin: JsonInspectorPlugin;

  constructor(app: App, plugin: JsonInspectorPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName("Default view")
      .setDesc("Which tab is shown when an inspector first renders.")
      .addDropdown((dd) =>
        dd
          .addOption("tree", "Tree")
          .addOption("raw", "Raw")
          .addOption("query", "Query")
          .setValue(this.plugin.settings.defaultView)
          .onChange(async (v) => {
            this.plugin.settings.defaultView = v as ViewMode;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Default expand depth")
      .setDesc("How many levels of the tree are expanded initially (0–10).")
      .addSlider((sl) =>
        sl
          .setLimits(0, 10, 1)
          .setValue(this.plugin.settings.defaultExpandDepth)
          .onChange(async (v) => {
            this.plugin.settings.defaultExpandDepth = v;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Indent size")
      .setDesc("Spaces used by the Raw view's Beautify action.")
      .addDropdown((dd) =>
        dd
          .addOption("2", "2 spaces")
          .addOption("4", "4 spaces")
          .setValue(String(this.plugin.settings.indentSize))
          .onChange(async (v) => {
            this.plugin.settings.indentSize = Number(v) === 4 ? 4 : 2;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Word wrap")
      .setDesc("Wrap long values and long Raw lines instead of scrolling.")
      .addToggle((tg) =>
        tg.setValue(this.plugin.settings.wordWrap).onChange(async (v) => {
          this.plugin.settings.wordWrap = v;
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName("Show item counts")
      .setDesc('Display "n items" / "n keys" badges on objects and arrays.')
      .addToggle((tg) =>
        tg.setValue(this.plugin.settings.showItemCounts).onChange(async (v) => {
          this.plugin.settings.showItemCounts = v;
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName("Render standard ```json blocks as JSON Inspector")
      .setDesc(
        "When enabled, plain json code blocks are also rendered by this plugin. Off by default to avoid conflicts with other plugins. Reload notes after changing.",
      )
      .addToggle((tg) =>
        tg.setValue(this.plugin.settings.renderStandardJson).onChange(async (v) => {
          this.plugin.settings.renderStandardJson = v;
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName("Maximum initial rendered nodes")
      .setDesc(
        "Upper bound on nodes drawn before a 'load more' control appears, to keep large JSON responsive.",
      )
      .addText((tx) =>
        tx
          .setPlaceholder("2000")
          .setValue(String(this.plugin.settings.maxInitialNodes))
          .onChange(async (v) => {
            const n = Number(v);
            if (Number.isFinite(n) && n > 0) {
              this.plugin.settings.maxInitialNodes = Math.floor(n);
              await this.plugin.saveSettings();
            }
          }),
      );

    new Setting(containerEl)
      .setName("Remember query history")
      .setDesc("Keep the last 10 JSONPath queries between sessions.")
      .addToggle((tg) =>
        tg.setValue(this.plugin.settings.rememberQueryHistory).onChange(async (v) => {
          this.plugin.settings.rememberQueryHistory = v;
          if (!v) this.plugin.settings.queryHistory = [];
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName("Reset settings")
      .setDesc("Restore all settings above to their defaults.")
      .addButton((btn) =>
        btn
          .setButtonText("Reset to defaults")
          .setWarning()
          .onClick(async () => {
            this.plugin.settings = { ...DEFAULT_SETTINGS, queryHistory: [] };
            await this.plugin.saveSettings();
            this.display();
          }),
      );
  }
}
