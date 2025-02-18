import * as fs from 'fs';
import { BufferTypeDecoratorName } from '@q-serializable-decorators';
import { SerializableType } from './src/lib/q-serializer';
import { DataType } from './src/lib/q-serializer/utils/data-type.util';
import { onlyUnique } from './src/lib/q-serializer/utils/only-unique-filter';
import { buffer_u8 } from '@types';
import chalk from 'chalk';
import * as path from 'path';
import { GMQSerializationParser } from './src/lib/gm-parser';

const generatedDir = './generated';

type ClassFieldDefinition = { decoratorName: string; fieldWithType: string };

class ClassDefinitionWriter {
  buildClassString(className: string, fields: { name: string; type: SerializableType }[]) {
    const classHeader = `@QSerializable\nexport class ${className} {`;

    const fieldsParts = new Array<ClassFieldDefinition>(fields.length);
    for (let i = 0; i < fields.length; i++) {
      const field = fields[i];
      fieldsParts[i] = this.getFieldDefinition(field);
    }

    const definitions = new Array<string>(fieldsParts.length);
    for (let i = 0; i < fieldsParts.length; i++) {
      const parts = fieldsParts[i];
      definitions[i] = `${parts.decoratorName}\n  ${parts.fieldWithType};`;
    }
    const classFieldsDefinition = definitions.join('\n\n  ');

    const constructor = this.buildConstructorString(fieldsParts);

    const importFields = fieldsParts
      .map((part) => {
        if (part.decoratorName.startsWith('@BufferObject')) {
          return 'BufferObject';
        }
        if (part.decoratorName.startsWith('@BufferArray')) {
          return 'BufferArray';
        }
        return part.decoratorName.replace('@', '');
      })
      .filter(onlyUnique);

    return {
      imports: importFields,
      classString: `${classHeader}\n  ${classFieldsDefinition}\n  ${constructor}\n}`,
    };
  }

  getFieldDefinition(field: { name: string; type: SerializableType }, isArray?: boolean): ClassFieldDefinition {
    if (DataType.isArray(field.type)) {
      return this.getFieldDefinition({ name: field.name, type: field.type[0] }, true);
    }
    if (DataType.isSerializable(field.type)) {
      const decoratorName = BufferTypeDecoratorName.buffer_object.decoName;
      return {
        decoratorName: isArray ? `@BufferArray(${field.type.name})` : `${decoratorName}(${field.type.name})`,
        fieldWithType: isArray ? `${field.name}: Array<${field.type.name}>` : `${field.name}: ${field.type.name}`,
      };
    }
    const decoratorName = BufferTypeDecoratorName[field.type].decoName;
    return {
      decoratorName: isArray ? `@BufferArray('${field.type}')` : decoratorName,
      fieldWithType: isArray
        ? `${field.name}: Array<${BufferTypeDecoratorName[field.type].tsType}>`
        : `${field.name}: ${BufferTypeDecoratorName[field.type].tsType}`,
    };
  }

  buildConstructorString(fields: Array<ClassFieldDefinition>) {
    const params = fields.map((field) => field.fieldWithType).join(', ');
    const constructorLine1 = `constructor(${params}) {\n`;
    const constructorFieldAssignments = Array<string>(fields.length);
    fields.forEach((field, i) => {
      const fieldName = field.fieldWithType.split(':')[0];
      constructorFieldAssignments[i] = `    this.${fieldName} = ${fieldName};`;
    });

    return `${constructorLine1}${constructorFieldAssignments.join('\n')}\n  }`;
  }
}

// Re-init Directory
if (fs.existsSync(generatedDir)) {
  fs.rmSync(generatedDir, { recursive: true });
}
fs.mkdirSync(generatedDir);

// Read GameMaker Directory. Find ALL functions, save definitions.
// Look for QSerializer Instance.
// Read the Serializable Structs
// Transform each of them into { className, [{fieldName, type}]
// EZPZ

const projectPath = 'C:/Users/laspe/OneDrive/Documents/GameMakerStudio2/Sandbox/';
const parser = new GMQSerializationParser(projectPath);

const writer = new ClassDefinitionWriter();
const content = writer.buildClassString('Location', [
  { name: 'positionX', type: 'buffer_s8' },
  { name: 'positionY', type: 'buffer_s16' },
]);
const content2 = writer.buildClassString('LocationTest', [
  { name: 'positionX', type: 'buffer_s8' },
  { name: 'positionY', type: 'buffer_s16' },
  { name: 'positions', type: [buffer_u8] },
]);

const importFields = content.imports.concat(content2.imports).filter(onlyUnique).join(', ');
const importStatement = `import { QSerializable, ${importFields} } from '@q-serializable-decorators';`;
const allClasses = [content.classString, content2.classString].join('\n');
const finalOutput = `${importStatement}\n\n${allClasses}`;
// Save file
fs.writeFileSync(`${generatedDir}/q-serializables.ts`, finalOutput);
