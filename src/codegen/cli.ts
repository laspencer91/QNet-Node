#!/usr/bin/env node
import * as fs from 'fs';
import * as path from 'path';
import { generateTypeScript } from './generate';
import { parseGmlProject } from './gml-parser';

const usage = `Usage: qnet-generate <gamemaker-project-folder> <output.ts> [--list-from <file>] [--import <module>]

Reads the GameMaker project's messages list and message constructors, and writes matching
TypeScript classes for QNet-Node.

  --list-from <file>  Use the messages list in the .gml file whose path contains <file>
                      (needed when the project has several different lists).
  --import <module>   Module to import QNet from in the generated file. Default: qnet-node`;

function main(argv: string[]) {
  const positional: string[] = [];
  const flags: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) flags[argv[i].slice(2)] = argv[++i];
    else positional.push(argv[i]);
  }
  if (positional.length !== 2 || 'help' in flags) {
    console.log(usage);
    process.exit(positional.length === 2 ? 0 : 1);
  }

  const [projectDir, outFile] = positional;
  const project = parseGmlProject(path.resolve(projectDir));
  const result = generateTypeScript(project, {
    listFrom: flags['list-from'],
    importFrom: flags['import'],
    sourceLabel: path.basename(path.resolve(projectDir)),
  });
  for (const warning of result.warnings) console.warn(`warning: ${warning}`);

  fs.mkdirSync(path.dirname(path.resolve(outFile)), { recursive: true });
  fs.writeFileSync(outFile, result.source);
  console.log(`Wrote ${result.messageNames.length} messages to ${outFile}: ${result.messageNames.join(', ')}`);
}

try {
  main(process.argv.slice(2));
} catch (error) {
  console.error(`qnet-generate: ${(error as Error).message}`);
  process.exit(1);
}
