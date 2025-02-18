import chalk from 'chalk';
import { GMConstructor } from './gm-qserializer-parser';

export function definedStructFoundValid(struct: string) {
  console.log(chalk.yellow(`${chalk.green(struct)} is valid for codegen...`));
}

export function definedStructNotFound(struct: string) {
  console.log(
    chalk.red.bold(`ERROR: Struct '${struct}' defined in QSerializer structs array was not detected in your project.`),
  );
  console.log(chalk.red('Make sure that your struct is a constructor, and its variables are defined properly'));
  console.log(chalk.yellow('HINT: QSerialzer requires the following format to be detected by codegen: '));
  console.log(
    chalk.bgBlackBright.bold('function ConstructorName(param1 = buffer_u8, param2 = buffer_string, ...) constructor {'),
  );
}

export function noStructsArrayDetected() {
  console.log(chalk.red.bold('ERROR: Could not identify structs array.'));
  console.log(
    chalk.red.dim('ASSERT: Did you correctly define q_serializer = new QSerializer({ structs: [Struct1, Struct2] }) ?'),
  );
  console.log(
    chalk.yellow(
      'HINT: Make sure you name your q_serializer variable correctly, and define the structs array like you see above.',
    ),
  );
}

export function foundProjectNowLookingForScripts(projectName: string) {
  console.log(chalk.green.bold(`Found project: ${projectName}`));
  console.log(chalk.yellow('------------------------------------------'));
  console.log(chalk.white(chalk.yellow('Looking for scripts....')));
}

export function detectedSerializable(constructor: GMConstructor) {
  console.log(
    chalk.yellow('Detected Serializable-like: '),
    `${chalk.bold.redBright(constructor.name)}(${constructor.params
      .map((p) => `${p.name}: ${chalk.red(p.fieldType)}`)
      .join(', ')})`,
  );
}

export function duplicateQSerializersDetected(fileName: string, duplicates: string[]) {
  console.log(chalk.bold.red('ERROR: Multiple QSerializer({ structs: [...]}) definitions detected. Cannot continue.'));
  console.log(chalk.red('Check your GameMaker project and ensure there is only ONE QSerializer instance.'));
  console.log(chalk.red(`Found additional QSerializer definition in file\n${fileName}: `), duplicates);
}
