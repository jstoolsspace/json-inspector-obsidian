import { describe, it, expect } from "vitest";
import {
  toJsonPath,
  toJsonPointer,
  segmentLabel,
  pathKey,
} from "../src/utils/paths";
import { beautify, minify, truncateMiddle, countLabel } from "../src/utils/formatting";

describe("toJsonPath", () => {
  it("uses dot notation for identifier keys", () => {
    expect(toJsonPath(["user", "name"])).toBe("$.user.name");
  });

  it("uses bracket notation for indices", () => {
    expect(toJsonPath(["roles", 0])).toBe("$.roles[0]");
  });

  it("quotes non-identifier keys", () => {
    expect(toJsonPath(["weird key"])).toBe("$['weird key']");
    expect(toJsonPath(["a.b"])).toBe("$['a.b']");
  });

  it("escapes single quotes in keys", () => {
    expect(toJsonPath(["it's"])).toBe("$['it\\'s']");
  });

  it("returns root for empty segments", () => {
    expect(toJsonPath([])).toBe("$");
  });
});

describe("toJsonPointer", () => {
  it("builds an RFC 6901 pointer", () => {
    expect(toJsonPointer(["user", "roles", 0])).toBe("/user/roles/0");
  });

  it("escapes ~ and /", () => {
    expect(toJsonPointer(["a/b", "c~d"])).toBe("/a~1b/c~0d");
  });

  it("returns empty string for root", () => {
    expect(toJsonPointer([])).toBe("");
  });
});

describe("segmentLabel / pathKey", () => {
  it("labels indices in brackets", () => {
    expect(segmentLabel(2)).toBe("[2]");
    expect(segmentLabel("name")).toBe("name");
  });

  it("produces stable unique keys", () => {
    expect(pathKey(["a", 0])).toBe(pathKey(["a", 0]));
    expect(pathKey(["a", 0])).not.toBe(pathKey(["a", "0"]));
  });
});

describe("formatting", () => {
  it("beautify keeps numbers and key order intact", () => {
    const src = '{"b":1000000000000000000000,"a":2}';
    const out = beautify(src, 2);
    expect(out).toContain("1000000000000000000000");
    expect(out.indexOf('"b"')).toBeLessThan(out.indexOf('"a"'));
    expect(out).toContain("\n");
  });

  it("minify collapses whitespace losslessly", () => {
    const src = '{\n  "a": 1,\n  "b": 2\n}';
    expect(minify(src)).toBe('{"a":1,"b":2}');
  });

  it("truncateMiddle shortens long strings", () => {
    const s = "x".repeat(500);
    const out = truncateMiddle(s, 100);
    expect(out.length).toBeLessThanOrEqual(101);
    expect(out).toContain("…");
  });

  it("countLabel pluralises", () => {
    expect(countLabel(1, "array")).toBe("1 item");
    expect(countLabel(3, "array")).toBe("3 items");
    expect(countLabel(1, "object")).toBe("1 key");
    expect(countLabel(0, "object")).toBe("0 keys");
  });
});
