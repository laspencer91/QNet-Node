import * as fs from 'fs';
import * as path from 'path';
import { generateTypeScript } from '../src/codegen/generate';
import { GmlProject, parseGmlProject, parseGmlSource } from '../src/codegen/gml-parser';

const fixture = path.join(__dirname, 'fixtures', 'gml-project');

const project = (source: string): GmlProject => {
  const p: GmlProject = { dir: '', constructors: new Map(), messageLists: [] };
  parseGmlSource(source, 'test.gml', p);
  return p;
};

describe('GML parser', () => {
  test('reads constructors, field assignments, manual messages and the messages list', () => {
    const parsed = parseGmlProject(fixture);
    const blob = parsed.constructors.get('TestBlob')!;
    expect(blob.fields.map((f) => f.name)).toEqual(['name', 'origin', 'points', 'grid', 'flag', 'big', 'neg']);
    expect(blob.fields[3].param.type).toEqual({
      kind: 'array',
      element: { kind: 'array', element: { kind: 'buffer', name: 'buffer_u8' } },
    });
    expect(parsed.constructors.get('TestManual')!.manual).toBe(true);
    // ChatMessage's OnReceive method body must not leak assignments into its fields.
    expect(parsed.constructors.get('ChatMessage')!.fields.map((f) => f.name)).toEqual(['from', 'text']);
    expect(parsed.messageLists.map((l) => l.names.length).sort()).toEqual([1, 6]);
  });

  test('ignores braces and keywords inside strings and comments', () => {
    const p = project(`
      // function Fake(_a = buffer_u8) constructor { a = _a; }
      function Real(_a = buffer_u8, _b = [buffer_string]) constructor
      {
        a = _a; /* b = _a; */
        log = "{ not a brace";
        b = _b;
        Helper = function(_x) { a = _x; }
      }
      net = new QNetwork({ messages: [Real] });
    `);
    expect([...p.constructors.keys()]).toEqual(['Real']);
    expect(p.constructors.get('Real')!.fields.map((f) => f.name)).toEqual(['a', 'b']);
    expect(p.messageLists).toEqual([{ file: 'test.gml', names: ['Real'] }]);
  });
});

describe('generator', () => {
  test('the committed demo classes are up to date with the fixture project', () => {
    const result = generateTypeScript(parseGmlProject(fixture), { importFrom: '../../src', sourceLabel: 'project' });
    const committed = fs.readFileSync(path.join(__dirname, '..', 'examples', 'generated', 'demo-messages.ts'), 'utf8');
    const strip = (s: string) => s.replace(/^\/\/ Messages list from: .*$/m, '');
    expect(strip(result.source)).toBe(strip(committed));
  });

  test('picks the longest list by default and warns when there are several', () => {
    const result = generateTypeScript(parseGmlProject(fixture));
    expect(result.messageNames).toHaveLength(6);
    expect(result.warnings.join()).toMatch(/2 different messages lists/);
  });

  test('declares nested types first and uses lazy() for self references', () => {
    const p = project(`
      function Tree(_kids = [Tree], _leaf = Leaf) constructor { kids = _kids; leaf = _leaf; }
      function Leaf(_v = buffer_u8) constructor { v = _v; }
      n = new QNetwork({ messages: [Tree, Leaf] });
    `);
    const { source } = generateTypeScript(p);
    expect(source.indexOf('class Leaf')).toBeLessThan(source.indexOf('class Tree'));
    expect(source).toContain('@Field([lazy(() => Tree)])');
    expect(source).toContain('@Field(Leaf)');
    expect(source).toContain('export const messages = [Tree, Leaf];');
  });

  test('explains what is wrong', () => {
    expect(() => generateTypeScript(project('n = new QNetwork({ messages: [Missing] });'))).toThrow(
      /no constructor named Missing/,
    );
    expect(() =>
      generateTypeScript(project('function A(_a = 0) constructor { a = _a; } n = new QNetwork({ messages: [A] });')),
    ).toThrow(/MANUAL_SERIALIZATION/);
    expect(() => generateTypeScript(project('x = 1;'))).toThrow(/No messages list found/);
  });
});
