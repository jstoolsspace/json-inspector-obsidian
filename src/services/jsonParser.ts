/**
 * JSON parsing service.
 *
 * Uses the well-tested `lossless-json` library so that:
 *   - large integers are not silently truncated;
 *   - high-precision decimals keep every digit;
 *   - the original key order is preserved.
 *
 * We never call the native `JSON.parse` for note content because it would lose
 * numeric precision. The RAW view always shows the untouched source text.
 */
import {
  parse as losslessParse,
  LosslessNumber,
  isLosslessNumber,
} from "lossless-json";

export { LosslessNumber, isLosslessNumber };

export type JsonPrimitive = string | boolean | null | LosslessNumber;
export type JsonValue = JsonPrimitive | JsonObject | JsonArray;
export interface JsonObject {
  [key: string]: JsonValue;
}
export type JsonArray = JsonValue[];

export type JsonKind =
  | "object"
  | "array"
  | "string"
  | "number"
  | "boolean"
  | "null";

export interface ParseSuccess {
  ok: true;
  value: JsonValue;
}

export interface ParseError {
  ok: false;
  message: string;
  /** 1-based line number of the problem, when it can be determined. */
  line: number | null;
  /** 1-based column number of the problem, when it can be determined. */
  column: number | null;
  /** 0-based character offset of the problem, when it can be determined. */
  position: number | null;
}

export type ParseResult = ParseSuccess | ParseError;

/**
 * Parse JSON text without losing numeric precision.
 *
 * Numbers are kept as `LosslessNumber` instances; everything else maps to
 * native JS values. Object key order is preserved by lossless-json.
 */
/**
 * JSON only treats space, tab, CR and LF as whitespace. Pasted content often
 * contains other Unicode spaces (e.g. non-breaking space U+00A0) used for
 * indentation, which makes otherwise-fine JSON fail to parse. We replace such
 * characters with a regular space — but only OUTSIDE of string values, so the
 * actual data inside strings is never altered. The replacement is 1:1 in
 * length, so error positions still map onto the original text.
 */
const NON_JSON_WHITESPACE =
  /[\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000\u2028\u2029\uFEFF]/;

export function sanitizeJson(text: string): string {
  if (!NON_JSON_WHITESPACE.test(text)) return text;
  let out = "";
  let inString = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      out += ch;
      if (ch === "\\") {
        // copy the escaped character verbatim
        i++;
        if (i < text.length) out += text[i];
      } else if (ch === '"') {
        inString = false;
      }
    } else if (ch === '"') {
      inString = true;
      out += ch;
    } else if (NON_JSON_WHITESPACE.test(ch)) {
      out += " ";
    } else {
      out += ch;
    }
  }
  return out;
}

export function parseJson(text: string): ParseResult {
  try {
    const value = losslessParse(sanitizeJson(text)) as JsonValue;
    return { ok: true, value };
  } catch (err) {
    return toParseError(err, text);
  }
}

function toParseError(err: unknown, text: string): ParseError {
  const message =
    err instanceof Error ? err.message : "Invalid JSON: could not parse input.";

  // lossless-json errors expose a numeric character offset (`.position`) in the
  // thrown error object. Fall back to extracting it from the message text.
  let position: number | null = null;
  const maybe = err as { position?: unknown };
  if (typeof maybe.position === "number" && Number.isFinite(maybe.position)) {
    position = maybe.position;
  } else {
    const m = message.match(/position\s+(\d+)/i);
    if (m) position = Number(m[1]);
  }

  let line: number | null = null;
  let column: number | null = null;
  if (position !== null) {
    const loc = offsetToLineColumn(text, position);
    line = loc.line;
    column = loc.column;
  }

  return { ok: false, message, line, column, position };
}

export interface LineColumn {
  line: number;
  column: number;
}

/** Convert a 0-based character offset into 1-based line/column coordinates. */
export function offsetToLineColumn(text: string, offset: number): LineColumn {
  const clamped = Math.max(0, Math.min(offset, text.length));
  let line = 1;
  let lineStart = 0;
  for (let i = 0; i < clamped; i++) {
    if (text.charCodeAt(i) === 10 /* \n */) {
      line++;
      lineStart = i + 1;
    }
  }
  return { line, column: clamped - lineStart + 1 };
}

/**
 * Build a short, human-readable snippet around an error position so the user can
 * see exactly where parsing failed. Returns the offending line plus a caret
 * line pointing at the column.
 */
export function buildErrorSnippet(
  text: string,
  line: number | null,
  column: number | null,
): string | null {
  if (line === null || column === null) return null;
  const lines = text.split("\n");
  const idx = line - 1;
  if (idx < 0 || idx >= lines.length) return null;
  const target = lines[idx];
  const caret = " ".repeat(Math.max(0, column - 1)) + "^";
  return `${target}\n${caret}`;
}

/** Classify a parsed JSON value into one of the canonical JSON kinds. */
export function kindOf(value: JsonValue): JsonKind {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (isLosslessNumber(value)) return "number";
  const t = typeof value;
  if (t === "object") return "object";
  if (t === "string") return "string";
  if (t === "boolean") return "boolean";
  // Defensive: native numbers should not appear, but classify them anyway.
  if (t === "number") return "number";
  return "string";
}

export function isContainer(value: JsonValue): value is JsonObject | JsonArray {
  const k = kindOf(value);
  return k === "object" || k === "array";
}

/** Number of direct children of a container value. */
export function childCount(value: JsonValue): number {
  if (Array.isArray(value)) return value.length;
  if (value !== null && typeof value === "object" && !isLosslessNumber(value)) {
    return Object.keys(value as JsonObject).length;
  }
  return 0;
}

/** Render a primitive value to its display string (no surrounding quotes). */
export function primitiveToDisplay(value: JsonValue): string {
  if (value === null) return "null";
  if (isLosslessNumber(value)) return value.toString();
  if (typeof value === "boolean") return value ? "true" : "false";
  return String(value);
}
