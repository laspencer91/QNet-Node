import chalk from 'chalk';
import fs from 'fs';
import path from 'path';
import * as ConsoleMessage from './console-messages';
import { GameMakerBufferType, GMBufferType } from '@types';

type GMConstructorParam = { name: string; fieldType: string };
export type GMConstructor = { name: string; params: Array<GMConstructorParam> };

export class GMQSerializationParser {
  private readonly qSerializerVariableName = 'q_serializer';

  private readonly REGEX = {
    structsArray: new RegExp(/structs\s*:\s*\[\s*([\s\S]*?)\s*\]/),
    newQSerializer: new RegExp(`${this.qSerializerVariableName}\\s*\\s*=\\s*\\n*new\\s*QSerializer`, 'g'),
  };

  private readonly directoriesToCheck = ['objects', 'scripts'];

  private readonly omittedScriptFileNames = ['scr_q_serializer.gml'];

  private readonly gmProjectName: string;

  private readonly gmProjectPath: string;

  readonly scriptFilePaths: Array<string> = [];

  constructor(gmProjectPath: `${string}`) {
    this.gmProjectName = this.findGmProject(gmProjectPath);
    if (!this.gmProjectName) {
      throw new Error(`Could not find valid .yyp project file in directory: ${gmProjectPath}`);
    }
    this.gmProjectPath = gmProjectPath;
    ConsoleMessage.foundProjectNowLookingForScripts(this.gmProjectName); // Console Message

    const scripts = new Array<string>();
    this.gatherScriptFiles(this.gmProjectPath, scripts);
    const constructors = this.findConstructorFunctions(scripts);
    const structsArray = this.findStructsArray(scripts);
    if (!structsArray) {
      ConsoleMessage.noStructsArrayDetected(); // Console Message
      return;
    }
    for (const struct of structsArray) {
      const foundConstructor = constructors.find((constructor) => constructor.name === struct);
      if (!foundConstructor) {
        ConsoleMessage.definedStructNotFound(struct);
      } else {
        // Make sure the struct params are valid.
        let isValid = true;
        for (const param of foundConstructor.params) {
          if (this.isParamGMBufferType(param)) {
            console.log('Detected primitive buffer type:', param.fieldType);
          } else if (constructors.find((constructor) => constructor.name === param.name)) {
            console.log('Detected Struct Buffer Type:', param.fieldType);
          } else {
            isValid = false;
          }
        }
        if (isValid) {
          ConsoleMessage.definedStructFoundValid(struct);
        }
      }
    }
  }

  isParamGMBufferType(param: GMConstructorParam): param is { name: string; fieldType: GameMakerBufferType } {
    return GMBufferType[param.fieldType as GameMakerBufferType] != undefined;
  }

  findConstructorFunctions(scripts: Array<string>): Array<GMConstructor> {
    const constructorRegex = /function\s+(\w+)\s*\(([^)]*)\)\s*constructor\s*\{/g;
    const constructors: Array<GMConstructor> = [];
    for (const script of scripts) {
      const scriptContent = fs.readFileSync(script, { encoding: 'utf-8' });
      let match;
      while ((match = constructorRegex.exec(scriptContent)) !== null) {
        const constructorName = match[1];
        // Replace newlines with spaces
        const rawParams = match[2]
          .replace(/\n/g, ' ')
          .split(',')
          .map((param) => param.trim());
        // See if is valid for QSerialization. Must be in format: (paramName = buffer_u8, ...)
        const invalidFormat = rawParams.find((param) => !param.includes('='));
        if (invalidFormat) {
          continue;
        }
        const construct = {
          name: constructorName,
          params: rawParams.map((rawParam) => {
            const paramParts = rawParam.split('=');
            return { name: paramParts[0].trim(), fieldType: paramParts[1].trim() };
          }),
        };
        ConsoleMessage.detectedSerializable(construct); // Console Message
        constructors.push(construct);
      }
    }
    return constructors;
  }

  findGmProject(path: string) {
    if (!fs.existsSync(path)) {
      throw new Error(`The provided project path ${path} does not exist!`);
    }
    const projectFile = fs.readdirSync(path).find((file) => file.endsWith('.yyp'));
    if (projectFile?.endsWith('.yyp')) {
      return projectFile;
    }
    return '';
  }

  gatherScriptFiles(directory: string, fileList: Array<string>) {
    const files = fs.readdirSync(directory);

    files.forEach((file) => {
      const filePath = path.join(directory, file);
      const fileStat = fs.statSync(filePath);
      const splitDirParts = filePath.split('\\');
      const fileName = splitDirParts[splitDirParts.length - 1];

      if (fileStat.isDirectory()) {
        this.gatherScriptFiles(filePath, fileList);
      } else if (file.endsWith('.gml') && !this.omittedScriptFileNames.includes(fileName)) {
        console.log(chalk.green('Detected script: '), `${splitDirParts[splitDirParts.length - 2]}/${chalk.bold(file)}`);
        fileList.push(filePath);
      }
    });

    return fileList;
  }

  findStructsArray(filesToCheck: Array<string>): Array<string> | undefined {
    let serializableClassNames: Array<string> | undefined;
    for (const file of filesToCheck) {
      const fileData = fs.readFileSync(file, { encoding: 'utf-8' });
      const cleanedFileData = this.removeComments(fileData);
      const structsArray = cleanedFileData.match(this.REGEX.structsArray)?.[1].toString();
      const editedMatch = structsArray?.replace(/(?:\r\n|\r|\n|\t)/g, '').split(',');
      if (editedMatch) {
        if (serializableClassNames !== undefined) {
          ConsoleMessage.duplicateQSerializersDetected(file, editedMatch);
          break;
        }
        serializableClassNames = editedMatch;
        console.log(chalk.bold.cyanBright('FOUND STRUCTS ARRAY: '), editedMatch);
      }
    }
    return serializableClassNames;
  }

  // Function to remove comments from the file data
  removeComments(data: string) {
    return data
      .replace(/\/\/.*?\n|\r|\r\n/g, '')
      .replace(/\/\/\/.*?\n|\r|\r\n/g, '')
      .replace(/\/\*[\s\S]*?\*\//g, '');
  }
}
