/**
 * Formatting helpers for the Raw view and labels.
 *
 * Re-serialisation uses lossless-json so that beautify/minify never alter the
 * underlying numbers or key order.
 */
import { parse as losslessParse, stringify as losslessStringify } from "lossless-json";
import { sanitizeJson } from "../services/jsonParser";

/**
 * Pretty-print JSON text with the given indent size, preserving numeric
 * precision and key order. Throws if the text is not valid JSON.
 */
export function beautify(text: string, indent: number): string {
  const parsed = losslessParse(sanitizeJson(text));
  const out = losslessStringify(parsed, undefined, indent);
  return out ?? text;
}

/**
 * Collapse JSON text to a single line, preserving numeric precision and key
 * order. Throws if the text is not valid JSON.
 */
export function minify(text: string): string {
  const parsed = losslessParse(sanitizeJson(text));
  const out = losslessStringify(parsed);
  return out ?? text;
}

/** Truncate a long string for inline display, keeping it on one visual line. */
export function truncateMiddle(value: string, max = 200): string {
  if (value.length <= max) return value;
  const head = Math.ceil((max - 1) / 2);
  const tail = Math.floor((max - 1) / 2);
  return value.slice(0, head) + "…" + value.slice(value.length - tail);
}

/** Pluralise an item count for the "n items" / "n keys" badges. */
export function countLabel(count: number, kind: "array" | "object"): string {
  const noun = kind === "array" ? "item" : "key";
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

/**
 * Quote a string the way it should appear inside JSON, escaping control
 * characters. Used for displaying string leaves with their quotes.
 */
export function quoteString(value: string): string {
  return JSON.stringify(value);
}
