# JSON Inspector

An Obsidian plugin that renders JSON code blocks as an interactive inspector —
a Tree view, a Raw view, and a JSONPath Query view — directly inside your notes.
Inspired by the JSTools JSON Inspector browser extension for Chrome.

Everything runs **locally**: no network requests, no telemetry, no accounts,
no `eval`. Numbers are parsed **losslessly**, so big integers and
high-precision decimals are never altered.

## Usage

Add a fenced code block with the language `json-inspector`:

````markdown
```json-inspector
{
  "user": {
    "id": 42,
    "name": "Anton",
    "roles": ["admin", "developer"]
  }
}
```
````

When you leave edit mode (Reading view, or Live Preview with the cursor outside
the block) the block becomes an interactive viewer.

Optionally, enable **Render standard ```json blocks as JSON Inspector** in
settings to also take over plain `json` blocks. This is **off by default** to
avoid conflicting with other plugins.

## Features

### Views

- **TREE** — collapsible objects/arrays, distinct colors for keys, strings,
  numbers, booleans and null, item counts, Expand all / Collapse all, keyboard
  navigation, and lazy rendering so large structures stay responsive. Long
  values wrap instead of breaking the note width.
- **RAW** — the exact original JSON, with Beautify, Minify, word-wrap toggle and
  Copy (the label flips to **COPIED** briefly). Beautify/Minify re-serialise
  losslessly.
- **QUERY** — run JSONPath expressions, execute with Enter, see a match count
  and result list, copy each result's value and path, and reuse the last 10
  queries from local history.

### Search

Press **Ctrl/Cmd+F** inside an inspector to search keys and values: match count,
Next/Previous, automatic expansion of the matched node, highlighting, and
**Escape** to close.

### Node actions

Each node has an actions button (⋯) with: Copy value, Copy key, Copy object,
Copy JSONPath, Copy JSON Pointer, Expand subtree, Collapse subtree.

### JSONPath support

The bundled engine is dependency-free and **safe** (no `eval`/`Function`). It
supports `$`, member access (dot and bracket), array indices (including
negative), wildcards (`*` / `[*]`), recursive descent (`..`), unions (`[0,2]`,
`['a','b']`), slices (`[start:end:step]`), and filters (`[?(@.price < 10)]`)
with comparisons, `&&`/`||`, grouping and existence tests.

## Settings

- **Default view** — Tree / Raw / Query
- **Default expand depth**
- **Indent size** — 2 or 4 (used by Beautify)
- **Word wrap**
- **Show item counts**
- **Render standard ```json blocks as JSON Inspector** (off by default)
- **Maximum initial rendered nodes**
- **Remember query history**
- **Reset settings**

## Privacy & security

- No telemetry, no accounts, no network requests.
- No `eval` and no unsafe `innerHTML`; the DOM is built with safe APIs.
- All JSON is processed locally. Note content is never logged to the console.
- Note JSON is never stored in settings or `localStorage`. Only your preferences
  and (optionally) recent JSONPath query strings are persisted.

## Accessibility

ARIA labels on all buttons, proper tab semantics for the view tabs, full
keyboard navigation of the tree, visible focus states, and theme-driven
contrast.

## Manual installation

1. Build the plugin (or download a release): you need `main.js`,
   `manifest.json`, and `styles.css`.
2. In your vault, create the folder
   `<vault>/.obsidian/plugins/json-inspector/`.
3. Copy `main.js`, `manifest.json`, and `styles.css` into that folder.
4. In Obsidian: **Settings → Community plugins**, disable Restricted mode if
   needed, then enable **JSON Inspector**.

## Building from source

```bash
npm install
npm run build      # type-checks, then produces main.js (production)
npm test           # run the unit tests
npm run lint       # lint the source
npm run dev        # watch build for development
```

The production build (`npm run build`) emits `main.js`. Together with
`manifest.json` and `styles.css` (already in the repo root), these are the three
files Obsidian needs.

## Publishing to Obsidian Community Plugins

1. Ensure `manifest.json` has a unique `id`, a clear `name`/`description`, and a
   correct `minAppVersion`, and that `versions.json` maps your plugin version to
   the minimum app version.
2. Push the code to a public GitHub repository.
3. Create a GitHub **release** whose tag exactly equals the version in
   `manifest.json` (e.g. `1.0.0`, no `v` prefix), and attach `main.js`,
   `manifest.json`, and `styles.css` as individual release assets.
4. Fork [`obsidianmd/obsidian-releases`](https://github.com/obsidianmd/obsidian-releases)
   and add an entry for your plugin to `community-plugins.json`.
5. Open a pull request and follow the review checklist. Once merged, the plugin
   appears in the in-app Community Plugins browser.

See the official guide:
<https://docs.obsidian.md/Plugins/Releasing/Submit+your+plugin>.

## Development notes

- Parsing uses [`lossless-json`](https://github.com/josdejong/lossless-json);
  the native `JSON.parse` is intentionally **not** used for note content.
- Logic that needs testing (parser, path/format helpers, search, JSONPath) lives
  in `src/services` and `src/utils` and is free of Obsidian/DOM imports.
- UI components in `src/components` use Obsidian's safe DOM helpers and clean up
  their listeners through the `MarkdownRenderChild` lifecycle.

## License

[MIT](LICENSE)
