import { describe, it, expect } from "vitest";
import {
  parseJson,
  offsetToLineColumn,
  buildErrorSnippet,
  kindOf,
  childCount,
  primitiveToDisplay,
  isLosslessNumber,
} from "../src/services/jsonParser";

describe("parseJson", () => {
  it("parses a simple object and preserves key order", () => {
    const r = parseJson('{"b":1,"a":2,"c":3}');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(Object.keys(r.value as object)).toEqual(["b", "a", "c"]);
    }
  });

  it("does not lose large integers", () => {
    const big = "123456789012345678901234567890";
    const r = parseJson(`{"n": ${big}}`);
    expect(r.ok).toBe(true);
    if (r.ok) {
      const n = (r.value as Record<string, unknown>).n;
      expect(isLosslessNumber(n as never)).toBe(true);
      expect(String(n)).toBe(big);
    }
  });

  it("does not round high-precision decimals", () => {
    const dec = "3.141592653589793238462643383279";
    const r = parseJson(`{"pi": ${dec}}`);
    expect(r.ok).toBe(true);
    if (r.ok) {
      const n = (r.value as Record<string, unknown>).pi;
      expect(String(n)).toBe(dec);
    }
  });

  it("reports line and column for invalid JSON", () => {
    const text = '{\n  "a": 1,\n  "b": ,\n}';
    const r = parseJson(text);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.line).not.toBeNull();
      expect(r.column).not.toBeNull();
      expect(r.line).toBeGreaterThanOrEqual(1);
    }
  });
});

describe("offsetToLineColumn", () => {
  it("maps offset 0 to line 1, column 1", () => {
    expect(offsetToLineColumn("abc", 0)).toEqual({ line: 1, column: 1 });
  });

  it("maps positions across newlines", () => {
    const text = "ab\ncd\nef";
    // offset of 'd' (index 4): line 2, col 2
    expect(offsetToLineColumn(text, 4)).toEqual({ line: 2, column: 2 });
  });
});

describe("buildErrorSnippet", () => {
  it("returns the offending line plus a caret", () => {
    const snippet = buildErrorSnippet("foo\nbar\nbaz", 2, 2);
    expect(snippet).toBe("bar\n ^");
  });

  it("returns null without coordinates", () => {
    expect(buildErrorSnippet("foo", null, null)).toBeNull();
  });
});

describe("kindOf / childCount / primitiveToDisplay", () => {
  it("classifies values", () => {
    const r = parseJson('{"s":"x","n":1,"b":true,"z":null,"a":[1,2],"o":{}}');
    if (!r.ok) throw new Error("parse failed");
    const v = r.value as Record<string, never>;
    expect(kindOf(v.s)).toBe("string");
    expect(kindOf(v.n)).toBe("number");
    expect(kindOf(v.b)).toBe("boolean");
    expect(kindOf(v.z)).toBe("null");
    expect(kindOf(v.a)).toBe("array");
    expect(kindOf(v.o)).toBe("object");
  });

  it("counts children", () => {
    const r = parseJson('{"a":[1,2,3],"o":{"x":1,"y":2}}');
    if (!r.ok) throw new Error("parse failed");
    const v = r.value as Record<string, never>;
    expect(childCount(v.a)).toBe(3);
    expect(childCount(v.o)).toBe(2);
  });

  it("renders primitives without quotes", () => {
    const r = parseJson('{"s":"hi","n":42,"b":false,"z":null}');
    if (!r.ok) throw new Error("parse failed");
    const v = r.value as Record<string, never>;
    expect(primitiveToDisplay(v.s)).toBe("hi");
    expect(primitiveToDisplay(v.n)).toBe("42");
    expect(primitiveToDisplay(v.b)).toBe("false");
    expect(primitiveToDisplay(v.z)).toBe("null");
  });
});
