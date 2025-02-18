import chalk from 'chalk';
import fs from 'fs';
import path from 'path';
import * as ConsoleMessage from './console-messages';
import { GameMakerBufferType, GMBufferType } from '@types';

type GMConstructorParam = {
  name: string;
  fieldType: string;
  isArray?: boolean;
  arrayDepth?: number;
};

export type GMConstructor = {
  name: string;
  params: Array<GMConstructorParam>;
  manualSerialization?: boolean;
  filePath?: string; // Track where the constructor was found
};

interface GMParserConfig {
  omittedScriptFileNames?: string[];
}

export class GMQSerializationParser {
  private readonly REGEX = {
    structsArray: /structs\s*:\s*\[\s*([\s\S]*?)\s*\]/,
    constructorDef: /function\s+(\w+)\s*\(([^)]*)\)\s*constructor\s*\{([^}]*)\}/g,
    manualSerialization: /MANUAL_SERIALIZATION/,
    arrayType: /\[(.*?)\]/g,
  };

  private readonly omittedScriptFileNames: string[];
  private readonly projectPath: string;
  private readonly constructors: Map<string, GMConstructor> = new Map();
  private readonly serializableNames: string[] = [];
  private readonly validatedTypes: Set<string> = new Set();

  constructor(gmProjectPath: string, config: GMParserConfig = {}) {
    this.projectPath = gmProjectPath;
    this.omittedScriptFileNames = config.omittedScriptFileNames ?? ['scr_q_serializer.gml'];
    this.validateAndInitialize();
  }

  private validateAndInitialize() {
    try {
      if (!fs.existsSync(this.projectPath)) {
        throw new Error(`Project path does not exist: ${this.projectPath}`);
      }

      const projectFile = this.findGmProject();
      if (!projectFile) {
        throw new Error('No GameMaker project file (.yyp) found');
      }

      ConsoleMessage.foundProjectNowLookingForScripts(projectFile);

      // Read project file to get proper folder structure
      const projectContent = fs.readFileSync(path.join(this.projectPath, projectFile), 'utf8');
      const project = JSON.parse(projectContent);

      // Get all script files from project structure
      const scripts = this.getScriptFilesFromProject(project);
      this.parseProject(scripts);
    } catch (error) {
      console.error(chalk.red('Failed to initialize parser:'), error);
      throw error;
    }
  }

  private getScriptFilesFromProject(project: any): string[] {
    const files: string[] = [];

    // Look for files in the project structure
    const resources = project.resources || [];
    for (const resource of resources) {
      if (resource.id?.path?.endsWith('.gml')) {
        const filePath = path.join(this.projectPath, resource.id.path);
        if (fs.existsSync(filePath) && !this.omittedScriptFileNames.includes(path.basename(filePath))) {
          files.push(filePath);
          console.log(chalk.green('Detected script:'), chalk.bold(resource.id.path));
        }
      }
    }

    return files;
  }

  private parseProject(scripts: string[]) {
    // First pass: gather all constructors
    for (const script of scripts) {
      this.parseConstructors(script);
    }

    // Second pass: find QSerializer definition and validate structs
    const structNames = this.findSerializableStructs(scripts);
    if (!structNames?.length) {
      ConsoleMessage.noStructsArrayDetected();
      return;
    }

    // Third pass: validate the structs
    this.validateSerializableStructs(structNames);
  }

  private parseConstructors(scriptPath: string): void {
    try {
      const content = fs.readFileSync(scriptPath, 'utf-8');
      const cleaned = this.removeComments(content);

      let match;
      while ((match = this.REGEX.constructorDef.exec(cleaned)) !== null) {
        const [, name, params, body] = match;

        // Parse parameters
        const parsedParams = this.parseConstructorParams(params);
        if (!parsedParams) {
          console.warn(chalk.yellow(`Invalid constructor params in ${name}`));
          continue;
        }

        const constructor: GMConstructor = {
          name,
          params: parsedParams,
          manualSerialization: this.REGEX.manualSerialization.test(body),
          filePath: scriptPath,
        };

        this.constructors.set(name, constructor);
        ConsoleMessage.detectedSerializable(constructor);
      }
    } catch (error) {
      console.error(chalk.red(`Error parsing file ${scriptPath}:`), error);
    }
  }

  private parseConstructorParams(paramsString: string): GMConstructorParam[] | null {
    try {
      const params = paramsString
        .split(',')
        .map((param) => param.trim())
        .filter((param) => param);

      const parsedParams: GMConstructorParam[] = [];

      for (const param of params) {
        const parts = param.split('=').map((p) => p.trim());
        if (parts.length !== 2) return null;

        const [name, typeStr] = parts;
        const { type, isArray, depth } = this.parseType(typeStr);

        parsedParams.push({
          name,
          fieldType: type,
          isArray,
          arrayDepth: depth,
        });
      }

      return parsedParams;
    } catch (error) {
      console.error(chalk.red('Error parsing constructor parameters:'), error);
      return null;
    }
  }

  private validateType(param: GMConstructorParam, seenTypes: Set<string> = new Set()): boolean {
    const baseType = param.fieldType;

    // Prevent infinite recursion
    if (seenTypes.has(baseType)) {
      console.warn(chalk.yellow(`Circular dependency detected for type: ${baseType}`));
      return false;
    }

    // Check if we've already validated this type
    if (this.validatedTypes.has(baseType)) {
      return true;
    }

    // Check if it's a primitive buffer type
    if (this.isParamGMBufferType(param)) {
      this.validatedTypes.add(baseType);
      return true;
    }

    // Check if it's a known constructor type
    const constructor = this.constructors.get(baseType);
    if (constructor) {
      seenTypes.add(baseType);
      const valid = constructor.params.every((p) => this.validateType(p, seenTypes));
      if (valid) {
        this.validatedTypes.add(baseType);
      }
      return valid;
    }

    console.warn(chalk.yellow(`Unknown type: ${baseType}`));
    return false;
  }

  getSerializables(): GMConstructor[] {
    return this.serializableNames.map((name) => {
      const constructor = this.constructors.get(name);
      if (!constructor) {
        throw new Error(`Constructor ${name} not found`);
      }
      return constructor;
    });
  }

  private isParamGMBufferType(param: GMConstructorParam): param is { name: string; fieldType: GameMakerBufferType } {
    return GMBufferType[param.fieldType as GameMakerBufferType] != undefined;
  }

  private parseType(typeStr: string): { type: string; isArray: boolean; depth: number } {
    let currentType = typeStr;
    let depth = 0;
    const matches = typeStr.match(this.REGEX.arrayType);

    if (matches) {
      depth = matches.length;
      matches.forEach(() => {
        currentType = currentType.replace(/\[(.*)\]/, '$1').trim();
      });
    }

    return {
      type: currentType, // The base type (e.g., "buffer_u8" from "[buffer_u8]")
      isArray: depth > 0, // True if it's an array type
      depth, // How deeply nested the array is (e.g., "[[buffer_u8]]" has depth 2)
    };
  }

  private findGmProject(): string | undefined {
    return fs.readdirSync(this.projectPath).find((file) => file.endsWith('.yyp'));
  }

  private validateSerializableStructs(structNames: string[]) {
    for (const structName of structNames) {
      try {
        const constructor = this.constructors.get(structName);

        if (!constructor) {
          ConsoleMessage.definedStructNotFound(structName);
          continue;
        }

        const invalidParams: GMConstructorParam[] = [];

        // Validate each parameter
        for (const param of constructor.params) {
          if (!this.validateType(param)) {
            invalidParams.push(param);
          }
        }

        if (invalidParams.length > 0) {
          console.error(
            chalk.red(
              `Invalid parameters in struct ${structName}:`,
              invalidParams.map((p) => `${p.name}: ${p.fieldType}`).join(', '),
            ),
          );

          if (constructor.filePath) {
            console.error(chalk.red(`Found in file: ${constructor.filePath}`));
          }
          continue;
        }

        ConsoleMessage.definedStructFoundValid(structName);
        this.serializableNames.push(structName);
      } catch (error) {
        console.error(
          chalk.red(`Error validating struct ${structName}:`, error instanceof Error ? error.message : 'Unknown error'),
        );
      }
    }

    // Report final validation results
    console.log(
      chalk.cyan(`\nValidation complete: ${this.serializableNames.length}/${structNames.length} structs valid`),
    );
  }

  private removeComments(data: string): string {
    const REGEX = {
      // Matches: // Comment
      SINGLE_LINE: /\/\/[^\n\r]*(?:\r?\n|$)/g,

      // Matches: /// JSDoc-style comment
      TRIPLE_SLASH: /\/\/\/[^\n\r]*(?:\r?\n|$)/g,

      // Matches: /* Multi-line
      //            comment
      //          */
      MULTI_LINE: /\/\*[\s\S]*?\*\//g,

      // Matches single-line comments that might end with \r\n on Windows
      WINDOWS_LINEBREAK: /\/\/.*?\r\n/g,
    };

    try {
      let cleaned = data;

      // Remove multi-line comments first
      cleaned = cleaned.replace(REGEX.MULTI_LINE, '');

      // Remove triple-slash comments (like JSDoc)
      cleaned = cleaned.replace(REGEX.TRIPLE_SLASH, '');

      // Remove single-line comments
      cleaned = cleaned.replace(REGEX.SINGLE_LINE, '\n');

      // Handle Windows-style line endings
      cleaned = cleaned.replace(REGEX.WINDOWS_LINEBREAK, '\n');

      // Remove any empty lines created by comment removal
      cleaned = cleaned
        .split('\n')
        .filter((line) => line.trim().length > 0)
        .join('\n');

      return cleaned;
    } catch (error) {
      console.error(chalk.red('Error removing comments:'), error);
      return data; // Return original data if cleaning fails
    }
  }

  private findSerializableStructs(filesToCheck: string[]): string[] | undefined {
    let foundIn: string | undefined;
    let serializableClassNames: string[] | undefined;

    try {
      for (const file of filesToCheck) {
        // Read and clean file content
        const fileData = fs.readFileSync(file, { encoding: 'utf-8' });
        const cleanedFileData = this.removeComments(fileData);

        // Look for QSerializer initialization with structs array
        const qSerializerMatch = cleanedFileData.match(this.REGEX.structsArray);

        if (!qSerializerMatch?.[1]) continue;

        // Parse the structs array
        const structsArrayText = qSerializerMatch[1].toString();
        const structNames = structsArrayText
          .replace(/(?:\r\n|\r|\n|\t|\s)/g, '') // Remove all whitespace
          .split(',')
          .filter((name) => name.length > 0); // Remove empty entries

        // If we already found a structs array elsewhere
        if (serializableClassNames) {
          ConsoleMessage.duplicateQSerializersDetected(file, structNames);
          console.error(chalk.red(`First QSerializer found in: ${foundIn}\n` + `Duplicate found in: ${file}`));
          return undefined;
        }

        foundIn = file;
        serializableClassNames = structNames;

        console.log(chalk.cyan('Found QSerializer structs array in:'), chalk.bold(file));
        console.log(chalk.cyan('Serializable structs:'));
        structNames.forEach((name, index) => {
          console.log(chalk.cyan(`  ${index + 1}. ${chalk.bold(name)}`));
        });
      }

      if (!serializableClassNames?.length) {
        console.warn(
          chalk.yellow('No QSerializer structs array found. Ensure you have initialized QSerializer with structs.'),
        );
        return undefined;
      }

      return serializableClassNames;
    } catch (error) {
      console.error(chalk.red('Error finding serializable structs:'), error);
      return undefined;
    }
  }
}
