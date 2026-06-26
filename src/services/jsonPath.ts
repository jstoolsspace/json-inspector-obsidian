/**
 * A small, dependency-free, **safe** JSONPath engine.
 *
 * It is intentionally implemented without `eval`, `Function`, or any dynamic
 * code execution, so it satisfies the plugin's security requirements. Filter
 * expressions are parsed by a hand-written recursive-descent parser and
 * evaluated against an explicit AST.
 *
 * Supported syntax:
 *   $                      root
 *   .key / ['key'] / ["k"] child member
 *   [0] / [-1]             array index (negative counts from the end)
 *   *  / [*]               wildcard (all children)
 *   ..                     recursive descent
 *   [a,b]                  union of children
 *   [start:end:step]       array slice
 *   [?(<expr>)]            filter expression
 *
 * Filter expressions support: @, @.key, @['key'], literals (number, string,
 * true, false, null), comparisons (==, !=, <, <=, >, >=), logical && and ||,
 * grouping with parentheses, and bare existence tests (e.g. [?(@.active)]).
 */
import {
  JsonValue,
  isLosslessNumber,
  kindOf,
} from "./jsonParser";
import { PathSegment } from "../utils/paths";

export interface JsonPathMatch {
  value: JsonValue;
  path: PathSegment[];
}

export interface JsonPathSuccess {
  ok: true;
  matches: JsonPathMatch[];
}

export interface JsonPathFailure {
  ok: false;
  message: string;
}

export type JsonPathResult = JsonPathSuccess | JsonPathFailure;

/** Evaluate a JSONPath expression against a parsed JSON value. */
export function queryJsonPath(root: JsonValue, expr: string): JsonPathResult {
  try {
    const steps = parsePath(expr);
    let current: JsonPathMatch[] = [{ value: root, path: [] }];
    for (const step of steps) {
      const next: JsonPathMatch[] = [];
      for (const m of current) applyStep(step, m, next);
      current = next;
    }
    return { ok: true, matches: current };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Invalid JSONPath query.",
    };
  }
}

// --------------------------------------------------------------------------
// Path AST
// --------------------------------------------------------------------------

type Step =
  | { type: "member"; name: string }
  | { type: "index"; index: number }
  | { type: "wildcard" }
  | { type: "recursive" }
  | { type: "union"; members: (string | number)[] }
  | { type: "slice"; start: number | null; end: number | null; step: number | null }
  | { type: "filter"; expr: FilterNode };

function applyStep(step: Step, m: JsonPathMatch, out: JsonPathMatch[]): void {
  const { value, path } = m;
  switch (step.type) {
    case "member": {
      if (isObject(value) && Object.prototype.hasOwnProperty.call(value, step.name)) {
        out.push({ value: (value as Record<string, JsonValue>)[step.name], path: [...path, step.name] });
      }
      break;
    }
    case "index": {
      if (Array.isArray(value)) {
        const i = step.index < 0 ? value.length + step.index : step.index;
        if (i >= 0 && i < value.length) out.push({ value: value[i], path: [...path, i] });
      }
      break;
    }
    case "wildcard": {
      pushChildren(value, path, out);
      break;
    }
    case "recursive": {
      // Recursive descent yields the node itself plus every descendant.
      collectDescendants(value, path, out);
      break;
    }
    case "union": {
      for (const member of step.members) {
        if (typeof member === "number") {
          applyStep({ type: "index", index: member }, m, out);
        } else {
          applyStep({ type: "member", name: member }, m, out);
        }
      }
      break;
    }
    case "slice": {
      if (Array.isArray(value)) applySlice(step, value, path, out);
      break;
    }
    case "filter": {
      if (Array.isArray(value)) {
        value.forEach((item, i) => {
          if (truthy(evalFilter(step.expr, item))) out.push({ value: item, path: [...path, i] });
        });
      } else if (isObject(value)) {
        for (const key of Object.keys(value)) {
          const item = (value as Record<string, JsonValue>)[key];
          if (truthy(evalFilter(step.expr, item))) out.push({ value: item, path: [...path, key] });
        }
      }
      break;
    }
  }
}

function pushChildren(value: JsonValue, path: PathSegment[], out: JsonPathMatch[]): void {
  if (Array.isArray(value)) {
    value.forEach((v, i) => out.push({ value: v, path: [...path, i] }));
  } else if (isObject(value)) {
    for (const key of Object.keys(value)) {
      out.push({ value: (value as Record<string, JsonValue>)[key], path: [...path, key] });
    }
  }
}

function collectDescendants(value: JsonValue, path: PathSegment[], out: JsonPathMatch[]): void {
  out.push({ value, path });
  if (Array.isArray(value)) {
    value.forEach((v, i) => collectDescendants(v, [...path, i], out));
  } else if (isObject(value)) {
    for (const key of Object.keys(value)) {
      collectDescendants((value as Record<string, JsonValue>)[key], [...path, key], out);
    }
  }
}

function applySlice(
  step: { start: number | null; end: number | null; step: number | null },
  arr: JsonValue[],
  path: PathSegment[],
  out: JsonPathMatch[],
): void {
  const len = arr.length;
  const stepN = step.step ?? 1;
  if (stepN === 0) throw new Error("Slice step cannot be 0.");
  const norm = (v: number | null, fallback: number): number => {
    if (v === null) return fallback;
    return v < 0 ? Math.max(len + v, 0) : Math.min(v, len);
  };
  if (stepN > 0) {
    const start = norm(step.start, 0);
    const end = norm(step.end, len);
    for (let i = start; i < end; i += stepN) out.push({ value: arr[i], path: [...path, i] });
  } else {
    const start = step.start === null ? len - 1 : step.start < 0 ? len + step.start : Math.min(step.start, len - 1);
    const end = step.end === null ? -1 : step.end < 0 ? len + step.end : step.end;
    for (let i = start; i > end; i += stepN) {
      if (i >= 0 && i < len) out.push({ value: arr[i], path: [...path, i] });
    }
  }
}

// --------------------------------------------------------------------------
// Path parser
// --------------------------------------------------------------------------

function parsePath(expr: string): Step[] {
  const src = expr.trim();
  if (src.length === 0) throw new Error("Empty query.");
  let i = 0;
  const steps: Step[] = [];

  // Leading root is optional but recommended.
  if (src[i] === "$") {
    i++;
  }

  while (i < src.length) {
    const ch = src[i];
    if (ch === ".") {
      if (src[i + 1] === ".") {
        steps.push({ type: "recursive" });
        i += 2;
        // `..` may be followed directly by a member, wildcard or bracket.
        if (src[i] === "*") {
          steps.push({ type: "wildcard" });
          i++;
        } else if (src[i] !== "[" && src[i] !== "." && i < src.length) {
          const name = readMemberName(src, i);
          steps.push({ type: "member", name: name.text });
          i = name.next;
        }
      } else {
        i++;
        if (src[i] === "*") {
          steps.push({ type: "wildcard" });
          i++;
        } else {
          const name = readMemberName(src, i);
          if (name.text.length === 0) throw new Error("Expected a member name after '.'");
          steps.push({ type: "member", name: name.text });
          i = name.next;
        }
      }
    } else if (ch === "[") {
      const parsed = parseBracket(src, i);
      steps.push(parsed.step);
      i = parsed.next;
    } else if (ch === "*") {
      steps.push({ type: "wildcard" });
      i++;
    } else if (ch === " ") {
      i++;
    } else {
      // Allow a leading bare member name (e.g. "user.id").
      const name = readMemberName(src, i);
      if (name.text.length === 0) throw new Error(`Unexpected character '${ch}' in query.`);
      steps.push({ type: "member", name: name.text });
      i = name.next;
    }
  }
  return steps;
}

function readMemberName(src: string, start: number): { text: string; next: number } {
  let i = start;
  while (i < src.length && /[A-Za-z0-9_$-]/.test(src[i])) i++;
  return { text: src.slice(start, i), next: i };
}

function parseBracket(src: string, start: number): { step: Step; next: number } {
  let i = start + 1; // skip '['
  skipWs(src, i);
  i = skipWs(src, i);

  // Filter expression: [?( ... )]
  if (src[i] === "?") {
    i++;
    if (src[i] !== "(") throw new Error("Expected '(' after '?' in filter.");
    const { node, next } = parseFilterFrom(src, i + 1);
    i = skipWs(src, next);
    if (src[i] !== ")") throw new Error("Unterminated filter expression.");
    i++;
    i = skipWs(src, i);
    if (src[i] !== "]") throw new Error("Expected ']' after filter.");
    return { step: { type: "filter", expr: node }, next: i + 1 };
  }

  // Wildcard: [*]
  if (src[i] === "*") {
    i++;
    i = skipWs(src, i);
    if (src[i] !== "]") throw new Error("Expected ']' after '*'.");
    return { step: { type: "wildcard" }, next: i + 1 };
  }

  // Read the raw bracket body up to the matching ']'.
  const bodyStart = i;
  let depth = 1;
  let inString: string | null = null;
  while (i < src.length && depth > 0) {
    const c = src[i];
    if (inString) {
      if (c === "\\") i++;
      else if (c === inString) inString = null;
    } else if (c === "'" || c === '"') {
      inString = c;
    } else if (c === "[") depth++;
    else if (c === "]") depth--;
    if (depth > 0) i++;
  }
  if (depth !== 0) throw new Error("Unterminated '[' in query.");
  const body = src.slice(bodyStart, i);
  const next = i + 1; // skip ']'

  // Quoted member(s) and unions of quoted names: ['a'] or ['a','b']
  if (/['"]/.test(body)) {
    const names = splitTopLevel(body).map((part) => parseQuoted(part.trim()));
    if (names.length === 1) return { step: { type: "member", name: names[0] }, next };
    return { step: { type: "union", members: names }, next };
  }

  // Slice: start:end:step
  if (body.includes(":")) {
    const parts = body.split(":");
    if (parts.length > 3) throw new Error("Invalid slice syntax.");
    const num = (s: string): number | null => {
      const t = s.trim();
      if (t === "") return null;
      const n = Number(t);
      if (!Number.isInteger(n)) throw new Error(`Invalid slice value '${t}'.`);
      return n;
    };
    return {
      step: { type: "slice", start: num(parts[0]), end: num(parts[1] ?? ""), step: num(parts[2] ?? "") },
      next,
    };
  }

  // Union of indices: [0,2,4]
  if (body.includes(",")) {
    const members = splitTopLevel(body).map((p) => {
      const n = Number(p.trim());
      if (!Number.isInteger(n)) throw new Error(`Invalid index '${p.trim()}'.`);
      return n;
    });
    return { step: { type: "union", members }, next };
  }

  // Single numeric index.
  const n = Number(body.trim());
  if (!Number.isInteger(n)) throw new Error(`Invalid index '${body.trim()}'.`);
  return { step: { type: "index", index: n }, next };
}

function parseQuoted(token: string): string {
  const quote = token[0];
  if ((quote !== "'" && quote !== '"') || token[token.length - 1] !== quote) {
    throw new Error(`Invalid quoted key: ${token}`);
  }
  return token.slice(1, -1).replace(/\\(['"\\])/g, "$1");
}

function splitTopLevel(body: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let inString: string | null = null;
  let cur = "";
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (inString) {
      cur += c;
      if (c === "\\" && i + 1 < body.length) {
        cur += body[++i];
      } else if (c === inString) inString = null;
      continue;
    }
    if (c === "'" || c === '"') {
      inString = c;
      cur += c;
    } else if (c === "(" || c === "[") {
      depth++;
      cur += c;
    } else if (c === ")" || c === "]") {
      depth--;
      cur += c;
    } else if (c === "," && depth === 0) {
      parts.push(cur);
      cur = "";
    } else {
      cur += c;
    }
  }
  parts.push(cur);
  return parts;
}

function skipWs(src: string, i: number): number {
  while (i < src.length && /\s/.test(src[i])) i++;
  return i;
}

// --------------------------------------------------------------------------
// Filter expression parser + evaluator (no eval)
// --------------------------------------------------------------------------

type FilterNode =
  | { type: "or"; left: FilterNode; right: FilterNode }
  | { type: "and"; left: FilterNode; right: FilterNode }
  | { type: "not"; operand: FilterNode }
  | { type: "compare"; op: string; left: FilterNode; right: FilterNode }
  | { type: "current" }
  | { type: "path"; segments: string[] }
  | { type: "literal"; value: string | number | boolean | null };

interface PState {
  src: string;
  i: number;
}

function parseFilterFrom(src: string, start: number): { node: FilterNode; next: number } {
  const st: PState = { src, i: start };
  const node = parseOr(st);
  return { node, next: st.i };
}

function parseOr(st: PState): FilterNode {
  let left = parseAnd(st);
  for (;;) {
    skip(st);
    if (st.src.startsWith("||", st.i)) {
      st.i += 2;
      const right = parseAnd(st);
      left = { type: "or", left, right };
    } else break;
  }
  return left;
}

function parseAnd(st: PState): FilterNode {
  let left = parseUnary(st);
  for (;;) {
    skip(st);
    if (st.src.startsWith("&&", st.i)) {
      st.i += 2;
      const right = parseUnary(st);
      left = { type: "and", left, right };
    } else break;
  }
  return left;
}

function parseUnary(st: PState): FilterNode {
  skip(st);
  if (st.src[st.i] === "!") {
    st.i++;
    return { type: "not", operand: parseUnary(st) };
  }
  return parseComparison(st);
}

const COMPARATORS = ["==", "!=", "<=", ">=", "<", ">"];

function parseComparison(st: PState): FilterNode {
  const left = parsePrimary(st);
  skip(st);
  for (const op of COMPARATORS) {
    if (st.src.startsWith(op, st.i)) {
      st.i += op.length;
      const right = parsePrimary(st);
      return { type: "compare", op, left, right };
    }
  }
  return left;
}

function parsePrimary(st: PState): FilterNode {
  skip(st);
  const c = st.src[st.i];
  if (c === "(") {
    st.i++;
    const node = parseOr(st);
    skip(st);
    if (st.src[st.i] !== ")") throw new Error("Expected ')' in filter expression.");
    st.i++;
    return node;
  }
  if (c === "@") {
    st.i++;
    const segments: string[] = [];
    for (;;) {
      if (st.src[st.i] === ".") {
        st.i++;
        const name = readMemberName(st.src, st.i);
        if (!name.text) throw new Error("Expected property name after '.' in filter.");
        segments.push(name.text);
        st.i = name.next;
      } else if (st.src[st.i] === "[") {
        const end = st.src.indexOf("]", st.i);
        if (end === -1) throw new Error("Unterminated '[' in filter path.");
        const inner = st.src.slice(st.i + 1, end).trim();
        segments.push(/['"]/.test(inner) ? parseQuoted(inner) : inner);
        st.i = end + 1;
      } else break;
    }
    return segments.length === 0 ? { type: "current" } : { type: "path", segments };
  }
  if (c === "'" || c === '"') {
    let j = st.i + 1;
    let out = "";
    while (j < st.src.length && st.src[j] !== c) {
      if (st.src[j] === "\\") {
        out += st.src[j + 1];
        j += 2;
      } else {
        out += st.src[j];
        j++;
      }
    }
    st.i = j + 1;
    return { type: "literal", value: out };
  }
  // Keywords and numbers.
  if (st.src.startsWith("true", st.i)) {
    st.i += 4;
    return { type: "literal", value: true };
  }
  if (st.src.startsWith("false", st.i)) {
    st.i += 5;
    return { type: "literal", value: false };
  }
  if (st.src.startsWith("null", st.i)) {
    st.i += 4;
    return { type: "literal", value: null };
  }
  const numMatch = st.src.slice(st.i).match(/^-?\d+(\.\d+)?([eE][+-]?\d+)?/);
  if (numMatch) {
    st.i += numMatch[0].length;
    return { type: "literal", value: Number(numMatch[0]) };
  }
  throw new Error(`Unexpected token in filter near '${st.src.slice(st.i, st.i + 8)}'.`);
}

function skip(st: PState): void {
  while (st.i < st.src.length && /\s/.test(st.src[st.i])) st.i++;
}

type FilterValue = string | number | boolean | null | undefined | JsonValue;

function evalFilter(node: FilterNode, current: JsonValue): FilterValue {
  switch (node.type) {
    case "or":
      return truthy(evalFilter(node.left, current)) || truthy(evalFilter(node.right, current));
    case "and":
      return truthy(evalFilter(node.left, current)) && truthy(evalFilter(node.right, current));
    case "not":
      return !truthy(evalFilter(node.operand, current));
    case "current":
      return current;
    case "literal":
      return node.value;
    case "path": {
      let v: JsonValue | undefined = current;
      for (const seg of node.segments) {
        if (Array.isArray(v)) {
          const idx = Number(seg);
          v = Number.isInteger(idx) ? v[idx] : undefined;
        } else if (isObject(v)) {
          v = (v as Record<string, JsonValue>)[seg];
        } else {
          v = undefined;
        }
        if (v === undefined) break;
      }
      return v;
    }
    case "compare":
      return compare(node.op, evalFilter(node.left, current), evalFilter(node.right, current));
  }
}

function compare(op: string, a: FilterValue, b: FilterValue): boolean {
  const av = scalar(a);
  const bv = scalar(b);
  switch (op) {
    case "==":
      return av === bv;
    case "!=":
      return av !== bv;
    case "<":
      return (av as number) < (bv as number);
    case "<=":
      return (av as number) <= (bv as number);
    case ">":
      return (av as number) > (bv as number);
    case ">=":
      return (av as number) >= (bv as number);
    default:
      return false;
  }
}

/** Reduce a JSON value to a comparable JS scalar. */
function scalar(v: FilterValue): string | number | boolean | null | undefined {
  if (v === null || v === undefined) return v;
  if (isLosslessNumber(v)) return Number(v.toString());
  const t = typeof v;
  if (t === "string" || t === "number" || t === "boolean") return v as string | number | boolean;
  return undefined; // containers are not directly comparable
}

function truthy(v: FilterValue): boolean {
  if (v === undefined || v === null || v === false) return false;
  if (v === "" ) return false;
  if (isLosslessNumber(v)) return Number(v.toString()) !== 0;
  if (typeof v === "number") return v !== 0;
  if (Array.isArray(v)) return true;
  if (kindOf(v as JsonValue) === "object") return true;
  return Boolean(v);
}

function isObject(v: unknown): v is Record<string, JsonValue> {
  return (
    v !== null &&
    typeof v === "object" &&
    !Array.isArray(v) &&
    !isLosslessNumber(v as JsonValue)
  );
}
