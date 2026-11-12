import * as fs from 'fs';
import * as path from 'path';

/** A field type as written in GML: a buffer type, a struct name, an array of either, or something else. */
export type GmlType =
  | { kind: 'buffer'; name: string }
  | { kind: 'struct'; name: string }
  | { kind: 'array'; element: GmlType }
  | { kind: 'literal'; text: string };

export interface GmlParam {
  name: string;
  /** The default value expression, e.g. "buffer_u8" or "[TestVec]". */
  defaultText: string;
  type: GmlType;
}

export interface GmlConstructor {
  name: string;
  file: string;
  params: GmlParam[];
  /** Struct variables assigned from a parameter at the top level of the body: `x = _x;` */
  fields: { name: string; param: GmlParam }[];
  manual: boolean;
}

export interface GmlMessageList {
  file: string;
  names: string[];
}

export interface GmlProject {
  dir: string;
  constructors: Map<string, GmlConstructor>;
  messageLists: GmlMessageList[];
}

const BUFFER_TYPES = new Set([
  'buffer_u8',
  'buffer_s8',
  'buffer_u16',
  'buffer_s16',
  'buffer_u32',
  'buffer_s32',
  'buffer_u64',
  'buffer_f16',
  'buffer_f32',
  'buffer_f64',
  'buffer_bool',
  'buffer_string',
]);

/** Reads every .gml file under a GameMaker project folder (the one with the .yyp). */
export function parseGmlProject(dir: string): GmlProject {
  if (!fs.existsSync(dir) || !fs.readdirSync(dir).some((file) => file.endsWith('.yyp'))) {
    throw new Error(`${dir} is not a GameMaker project folder (no .yyp file found)`);
  }
  const project: GmlProject = { dir, constructors: new Map(), messageLists: [] };
  for (const file of findGmlFiles(dir)) {
    const source = fs.readFileSync(file, 'utf8');
    parseGmlSource(source, path.relative(dir, file).replace(/\\/g, '/'), project);
  }
  return project;
}

/** Parses one GML source file into the project model. Exposed for tests. */
export function parseGmlSource(source: string, file: string, project: GmlProject) {
  const clean = blankCommentsAndStrings(source);

  const functionPattern = /\bfunction\s+([A-Za-z_]\w*)\s*\(/g;
  let match: RegExpExecArray | null;
  while ((match = functionPattern.exec(clean)) !== null) {
    const name = match[1];
    const paramsStart = match.index + match[0].length;
    const paramsEnd = findClosing(clean, paramsStart - 1, '(', ')');
    if (paramsEnd < 0) continue;
    const after = clean.slice(paramsEnd + 1);
    const constructorMatch = /^\s*constructor\s*\{/.exec(after);
    if (!constructorMatch) continue;
    const bodyOpen = paramsEnd + 1 + constructorMatch[0].length - 1;
    const bodyClose = findClosing(clean, bodyOpen, '{', '}');
    if (bodyClose < 0) continue;

    const params = splitTopLevel(clean.slice(paramsStart, paramsEnd), ',')
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part): GmlParam => {
        const equals = part.indexOf('=');
        const paramName = (equals < 0 ? part : part.slice(0, equals)).trim();
        const defaultText = equals < 0 ? '' : part.slice(equals + 1).trim();
        return { name: paramName, defaultText, type: parseType(defaultText) };
      });

    const body = clean.slice(bodyOpen + 1, bodyClose);
    const topLevel = topLevelText(body);
    const fields: GmlConstructor['fields'] = [];
    const assignment = /(^|[;\n{}])\s*([A-Za-z_]\w*)\s*=\s*([A-Za-z_]\w*)\s*(?=;|\n|$)/g;
    let field: RegExpExecArray | null;
    while ((field = assignment.exec(topLevel)) !== null) {
      const param = params.find((p) => p.name === field![3]);
      if (param && !fields.some((f) => f.name === field![2])) fields.push({ name: field[2], param });
    }

    project.constructors.set(name, {
      name,
      file,
      params,
      fields,
      manual: /\bMANUAL_SERIALIZATION\b/.test(topLevel),
    });
  }

  const listPatterns = [/\bmessages\s*[:=]\s*\[([\w\s,]*)\]/g, /\bnew\s+QSerializer\s*\(\s*\[([\w\s,]*)\]/g];
  for (const pattern of listPatterns) {
    while ((match = pattern.exec(clean)) !== null) {
      const names = match[1]
        .split(',')
        .map((name) => name.trim())
        .filter(Boolean);
      if (names.length > 0) project.messageLists.push({ file, names });
    }
  }
}

function parseType(text: string): GmlType {
  const trimmed = text.trim();
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    return { kind: 'array', element: parseType(trimmed.slice(1, -1)) };
  }
  if (BUFFER_TYPES.has(trimmed)) return { kind: 'buffer', name: trimmed };
  if (/^[A-Za-z_]\w*$/.test(trimmed) && !/^(true|false|undefined|noone|infinity|pi)$/.test(trimmed)) {
    return { kind: 'struct', name: trimmed };
  }
  return { kind: 'literal', text: trimmed };
}

/** Replaces comments and string contents with spaces so braces and keywords inside them are ignored. */
export function blankCommentsAndStrings(source: string): string {
  const out = source.split('');
  let i = 0;
  const blank = (from: number, to: number) => {
    for (let k = from; k < to; k++) if (out[k] !== '\n') out[k] = ' ';
  };
  while (i < source.length) {
    const c = source[i];
    const next = source[i + 1];
    if (c === '/' && next === '/') {
      const end = source.indexOf('\n', i);
      const stop = end < 0 ? source.length : end;
      blank(i, stop);
      i = stop;
    } else if (c === '/' && next === '*') {
      const end = source.indexOf('*/', i + 2);
      const stop = end < 0 ? source.length : end + 2;
      blank(i, stop);
      i = stop;
    } else if (c === '@' && (next === '"' || next === "'")) {
      const end = source.indexOf(next, i + 2);
      const stop = end < 0 ? source.length : end + 1;
      blank(i + 2, stop - 1);
      i = stop;
    } else if (c === '"' || (c === '$' && next === '"')) {
      let k = c === '$' ? i + 2 : i + 1;
      while (k < source.length && source[k] !== '"' && source[k] !== '\n') k += source[k] === '\\' ? 2 : 1;
      blank(c === '$' ? i + 2 : i + 1, k);
      i = k + 1;
    } else {
      i++;
    }
  }
  return out.join('');
}

function findClosing(text: string, openIndex: number, open: string, close: string): number {
  let depth = 0;
  for (let i = openIndex; i < text.length; i++) {
    if (text[i] === open) depth++;
    else if (text[i] === close && --depth === 0) return i;
  }
  return -1;
}

function splitTopLevel(text: string, separator: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '(' || c === '[' || c === '{') depth++;
    else if (c === ')' || c === ']' || c === '}') depth--;
    else if (c === separator && depth === 0) {
      parts.push(text.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(text.slice(start));
  return parts;
}

/** The body with everything inside nested braces blanked, so only top-level statements remain. */
function topLevelText(body: string): string {
  let depth = 0;
  let out = '';
  for (const c of body) {
    if (c === '{') {
      depth++;
      out += depth === 1 ? '{' : ' ';
    } else if (c === '}') {
      out += depth === 1 ? '}' : ' ';
      depth--;
    } else {
      out += depth === 0 || c === '\n' ? c : ' ';
    }
  }
  return out;
}

function findGmlFiles(dir: string, found: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) findGmlFiles(full, found);
    else if (entry.name.endsWith('.gml')) found.push(full);
  }
  return found.sort();
}
