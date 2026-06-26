/**
 * Pure search model. Walks the parsed JSON value and returns every node whose
 * key or primitive value matches the query. Kept free of DOM/Obsidian imports
 * so it can be unit-tested and reused by the tree renderer.
 */
import {
  JsonValue,
  isLosslessNumber,
  primitiveToDisplay,
} from "./jsonParser";
import { PathSegment } from "../utils/paths";

export interface SearchHit {
  /** Path to the matched node. */
  path: PathSegment[];
  /** Whether the match was on the key, the value, or both. */
  on: "key" | "value" | "both";
}

export interface SearchOptions {
  caseSensitive?: boolean;
  /** When true, match keys. Default true. */
  keys?: boolean;
  /** When true, match primitive values. Default true. */
  values?: boolean;
}

/**
 * Find all matches for `query` within `root`. Hits are returned in document
 * order (depth-first, preserving key order), which is what the Next/Previous
 * navigation relies on.
 */
export function searchJson(
  root: JsonValue,
  query: string,
  options: SearchOptions = {},
): SearchHit[] {
  const q = query.trim();
  if (q.length === 0) return [];
  const caseSensitive = options.caseSensitive ?? false;
  const matchKeys = options.keys ?? true;
  const matchValues = options.values ?? true;
  const needle = caseSensitive ? q : q.toLowerCase();
  const hits: SearchHit[] = [];

  const contains = (hay: string): boolean =>
    (caseSensitive ? hay : hay.toLowerCase()).includes(needle);

  const walk = (value: JsonValue, path: PathSegment[], keyMatched: boolean): void => {
    if (Array.isArray(value)) {
      if (keyMatched) hits.push({ path, on: "key" });
      value.forEach((item, i) => walk(item, [...path, i], false));
      return;
    }
    if (isObject(value)) {
      if (keyMatched) hits.push({ path, on: "key" });
      for (const key of Object.keys(value)) {
        const childKeyMatch = matchKeys && contains(key);
        walk((value as Record<string, JsonValue>)[key], [...path, key], childKeyMatch);
      }
      return;
    }
    // primitive leaf
    const valueMatched = matchValues && contains(primitiveToDisplay(value));
    if (keyMatched && valueMatched) hits.push({ path, on: "both" });
    else if (keyMatched) hits.push({ path, on: "key" });
    else if (valueMatched) hits.push({ path, on: "value" });
  };

  // Root has no key; walk children directly.
  if (Array.isArray(root)) {
    root.forEach((item, i) => walk(item, [i], false));
  } else if (isObject(root)) {
    for (const key of Object.keys(root)) {
      const childKeyMatch = matchKeys && contains(key);
      walk((root as Record<string, JsonValue>)[key], [key], childKeyMatch);
    }
  } else {
    const valueMatched = matchValues && contains(primitiveToDisplay(root));
    if (valueMatched) hits.push({ path: [], on: "value" });
  }

  return hits;
}

function isObject(v: unknown): v is Record<string, JsonValue> {
  return (
    v !== null &&
    typeof v === "object" &&
    !Array.isArray(v) &&
    !isLosslessNumber(v as JsonValue)
  );
}
