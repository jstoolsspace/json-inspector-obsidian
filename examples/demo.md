# JSON Inspector — Demo

Switch this note to **Reading view** (or Live Preview with the cursor outside
the block) to see each code block turn into an interactive inspector.

## Basic object

```json-inspector
{
  "user": {
    "id": 42,
    "name": "Anton",
    "roles": ["admin", "developer"]
  }
}
```

## Lossless numbers

Large integers and high-precision decimals are preserved exactly — try copying
them from the RAW tab.

```json-inspector
{
  "bigInt": 123456789012345678901234567890,
  "highPrecision": 3.141592653589793238462643383279,
  "scientific": 6.022e23,
  "negativeZeroish": -0.00000000000000001
}
```

## Nested data for QUERY (JSONPath)

Open the **QUERY** tab and try:

- `$.store.book[*].author`
- `$.store.book[?(@.price < 20)].title`
- `$..price`
- `$.store.book[0,2].title`

```json-inspector
{
  "store": {
    "book": [
      { "category": "fiction", "title": "Dune", "author": "Herbert", "price": 12 },
      { "category": "tech", "title": "SICP", "author": "Abelson", "price": 30 },
      { "category": "tech", "title": "TAPL", "author": "Pierce", "price": 8 }
    ],
    "bicycle": { "color": "red", "price": 100 }
  }
}
```

## Search

Click inside any inspector and press **Ctrl/Cmd+F** to search keys and values.
Use Enter / Shift+Enter for Next / Previous. The matched node is auto-expanded.

```json-inspector
{
  "services": {
    "auth": { "status": "ok", "latencyMs": 12 },
    "billing": { "status": "degraded", "latencyMs": 240 },
    "search": { "status": "ok", "latencyMs": 35 }
  }
}
```

## Invalid JSON (error view)

This block has a trailing comma; the inspector shows the line, column, and a
snippet, and keeps the source copyable.

```json-inspector
{
  "a": 1,
  "b": 2,
}
```

## Inside a callout

> [!note] Embedded inspector
> ```json-inspector
> { "works": "inside callouts too", "items": [1, 2, 3] }
> ```
