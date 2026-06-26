/**
 * Path segment utilities.
 *
 * A "path" in this plugin is an ordered list of segments from the document root
 * to a node. Each segment is either an object key (string) or an array index
 * (number). These helpers convert a segment list into the various textual
 * representations the user can copy.
 */

export type PathSegment = string | number;

/** Identifier-safe object keys can use dot notation in JSONPath. */
const IDENTIFIER_RE = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

/**
 * Build a JSONPath expression (e.g. `$.user.roles[0]`).
 * Non-identifier keys use bracket-quote notation: `$['weird key']`.
 */
export function toJsonPath(segments: PathSegment[]): string {
  let out = "$";
  for (const seg of segments) {
    if (typeof seg === "number") {
      out += `[${seg}]`;
    } else if (IDENTIFIER_RE.test(seg)) {
      out += `.${seg}`;
    } else {
      out += `['${escapeSingleQuoted(seg)}']`;
    }
  }
  return out;
}

/**
 * Build an RFC 6901 JSON Pointer (e.g. `/user/roles/0`).
 * `~` and `/` are escaped as `~0` and `~1` respectively.
 */
export function toJsonPointer(segments: PathSegment[]): string {
  if (segments.length === 0) return "";
  return (
    "/" +
    segments
      .map((seg) => escapePointerSegment(String(seg)))
      .join("/")
  );
}

/** Short, human-friendly label for a single segment (used in result lists). */
export function segmentLabel(seg: PathSegment): string {
  return typeof seg === "number" ? `[${seg}]` : seg;
}

function escapeSingleQuoted(key: string): string {
  return key.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function escapePointerSegment(seg: string): string {
  return seg.replace(/~/g, "~0").replace(/\//g, "~1");
}

/** Stable string key for a path, used as a node identity in the tree state. */
export function pathKey(segments: PathSegment[]): string {
  // JSON encoding guarantees uniqueness and a clean separator.
  return JSON.stringify(segments);
}
