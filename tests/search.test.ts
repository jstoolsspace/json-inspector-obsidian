import { describe, it, expect } from "vitest";
import { parseJson, JsonValue } from "../src/services/jsonParser";
import { searchJson } from "../src/services/search";

function parse(text: string): JsonValue {
  const r = parseJson(text);
  if (!r.ok) throw new Error("parse failed: " + r.message);
  return r.value;
}

const sample = parse(`{
  "user": {
    "id": 42,
    "name": "Anton",
    "roles": ["admin", "developer"]
  },
  "active": true,
  "name": "root-name"
}`);

describe("searchJson", () => {
  it("returns empty for empty query", () => {
    expect(searchJson(sample, "")).toEqual([]);
  });

  it("matches keys", () => {
    const hits = searchJson(sample, "roles");
    expect(hits.length).toBe(1);
    expect(hits[0].path).toEqual(["user", "roles"]);
    expect(hits[0].on).toBe("key");
  });

  it("matches values", () => {
    const hits = searchJson(sample, "admin");
    expect(hits.length).toBe(1);
    expect(hits[0].path).toEqual(["user", "roles", 0]);
    expect(hits[0].on).toBe("value");
  });

  it("matches both key and value when applicable", () => {
    const hits = searchJson(sample, "name");
    // key "name" under user, value "Anton" doesn't contain name,
    // top-level key "name" matches key, and its value "root-name" matches value.
    const paths = hits.map((h) => h.path);
    expect(paths).toContainEqual(["user", "name"]);
    expect(paths).toContainEqual(["name"]);
    const rootName = hits.find((h) => h.path.length === 1 && h.path[0] === "name");
    expect(rootName?.on).toBe("both");
  });

  it("is case-insensitive by default", () => {
    expect(searchJson(sample, "ANTON").length).toBe(1);
    expect(searchJson(sample, "ANTON", { caseSensitive: true }).length).toBe(0);
  });

  it("returns hits in document order", () => {
    const hits = searchJson(sample, "a");
    // first hit should be the earliest in document order
    expect(hits.length).toBeGreaterThan(1);
    // "user" path appears before "active"
    const firstUser = hits.findIndex((h) => h.path[0] === "user");
    const firstActive = hits.findIndex((h) => h.path[0] === "active");
    expect(firstUser).toBeLessThan(firstActive);
  });

  it("can restrict to keys or values only", () => {
    expect(searchJson(sample, "admin", { keys: true, values: false }).length).toBe(0);
    expect(searchJson(sample, "roles", { keys: false, values: true }).length).toBe(0);
  });
});
