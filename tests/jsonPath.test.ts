import { describe, it, expect } from "vitest";
import { parseJson, JsonValue, primitiveToDisplay, isContainer } from "../src/services/jsonParser";
import { queryJsonPath } from "../src/services/jsonPath";

function parse(text: string): JsonValue {
  const r = parseJson(text);
  if (!r.ok) throw new Error("parse failed: " + r.message);
  return r.value;
}

const data = parse(`{
  "store": {
    "book": [
      { "category": "fiction", "author": "A", "price": 10 },
      { "category": "tech", "author": "B", "price": 25 },
      { "category": "tech", "author": "C", "price": 5 }
    ],
    "bicycle": { "color": "red", "price": 100 }
  },
  "active": true,
  "count": 3
}`);

function values(v: JsonValue, expr: string): string[] {
  const r = queryJsonPath(v, expr);
  if (!r.ok) throw new Error(r.message);
  return r.matches.map((m) =>
    isContainer(m.value)
      ? JSON.stringify(Object.keys(m.value as object))
      : primitiveToDisplay(m.value),
  );
}

describe("queryJsonPath", () => {
  it("resolves the root", () => {
    const r = queryJsonPath(data, "$");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.matches.length).toBe(1);
  });

  it("dot member access", () => {
    expect(values(data, "$.count")).toEqual(["3"]);
    expect(values(data, "$.store.bicycle.color")).toEqual(["red"]);
  });

  it("bracket member access", () => {
    expect(values(data, "$['count']")).toEqual(["3"]);
    expect(values(data, '$.store["bicycle"].color')).toEqual(["red"]);
  });

  it("array index, including negative", () => {
    expect(values(data, "$.store.book[0].author")).toEqual(["A"]);
    expect(values(data, "$.store.book[-1].author")).toEqual(["C"]);
  });

  it("wildcard over arrays and objects", () => {
    expect(values(data, "$.store.book[*].author")).toEqual(["A", "B", "C"]);
    const colors = values(data, "$.store.bicycle.*");
    expect(colors).toContain("red");
    expect(colors).toContain("100");
  });

  it("recursive descent", () => {
    const prices = values(data, "$..price");
    expect(prices.sort()).toEqual(["10", "100", "25", "5"].sort());
  });

  it("array slice", () => {
    expect(values(data, "$.store.book[0:2].author")).toEqual(["A", "B"]);
    expect(values(data, "$.store.book[1:].author")).toEqual(["B", "C"]);
  });

  it("union of indices and keys", () => {
    expect(values(data, "$.store.book[0,2].author")).toEqual(["A", "C"]);
  });

  it("filter by numeric comparison", () => {
    const authors = values(data, "$.store.book[?(@.price > 8)].author");
    expect(authors).toEqual(["A", "B"]);
  });

  it("filter by string equality", () => {
    const authors = values(data, "$.store.book[?(@.category == 'tech')].author");
    expect(authors).toEqual(["B", "C"]);
  });

  it("filter with logical operators", () => {
    const authors = values(data, "$.store.book[?(@.category == 'tech' && @.price < 10)].author");
    expect(authors).toEqual(["C"]);
  });

  it("filter existence test", () => {
    const r = queryJsonPath(data, "$.store.book[?(@.author)]");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.matches.length).toBe(3);
  });

  it("returns paths for results", () => {
    const r = queryJsonPath(data, "$.store.book[1].author");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.matches[0].path).toEqual(["store", "book", 1, "author"]);
  });

  it("preserves large numbers in filters and results", () => {
    const d = parse('{"items":[{"v": 99999999999999999999},{"v": 1}]}');
    const r = queryJsonPath(d, "$.items[?(@.v > 5)].v");
    expect(r.ok).toBe(true);
    if (r.ok) expect(String(r.matches[0].value)).toBe("99999999999999999999");
  });

  it("reports an error for invalid syntax", () => {
    const r = queryJsonPath(data, "$.store.book[?(@.price >)]");
    expect(r.ok).toBe(false);
  });

  it("returns no matches for missing paths (not an error)", () => {
    const r = queryJsonPath(data, "$.nope.missing");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.matches.length).toBe(0);
  });
});
