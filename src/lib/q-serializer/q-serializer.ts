import { GMBuffer } from '../gm-buffer';
import { Constructor } from './types';
import { _QSerializableContainer } from './system/q-serializable-container';
import { buffer_string, buffer_u16, GameMakerBufferType } from '../types';

type SerializableNameId = string;

type SerializableType = GameMakerBufferType | Constructor | GameMakerBufferType[] | Constructor[];

const ARRAY_LENGTH_BUFFER_TYPE = buffer_u16;

export type SerializableField = {
  fieldName: string;
  bufferType: SerializableType;
};

export type SerializableEntity = {
  serialId: number;
  name: SerializableNameId;
  serializableFields: SerializableField[];
  constructor: Constructor;
};

export class QSerializer {
  readonly serializables: Constructor[];

  readonly serializableConfigs: Map<SerializableNameId, SerializableEntity> = new Map();

  constructor(serializables: Constructor[]) {
    this.serializables = this.registerSerializableList(serializables);
  }

  private registerSerializableList(serializables: Constructor[]) {
    for (let i = 0; i < serializables.length; i++) {
      const qSerializable = serializables[i];
      const className = Reflect.getMetadata('name', qSerializable);

      const fields = _QSerializableContainer.instance.bufferTypesMap.get(className);
      if (!fields) {
        throw new Error(
          `No fields found for @QSerializable - ${className}. 
          Ensure this class includes the proper annotation @QSerializable.`,
        );
      }

      this.serializableConfigs.set(className, {
        serialId: i,
        name: className,
        serializableFields: fields as SerializableField[],
        constructor: serializables[i],
      });

      console.log(`Registering ${className} with buffers: `);
    }

    return serializables;
  }

  serialize(serializable: InstanceType<Constructor>) {
    const serializableName = Reflect.getMetadata('name', serializable.constructor);
    const config = this.serializableConfigs.get(serializableName);

    if (!config) {
      console.debug(`${serializableName} is not recognized by this QSerializer. Was it registered?`);
      return;
    }

    const buffer = GMBuffer.new(64);
    buffer.write(config.serialId, 'buffer_u16');

    this.writeInstanceToBuffer(buffer, serializable);

    return buffer.toBuffer();
  }

  writeInstanceToBuffer(buffer: GMBuffer, serializable: InstanceType<Constructor>) {
    const serializableId = Reflect.getMetadata('name', serializable.constructor);
    const serializationConfig = this.serializableConfigs.get(serializableId);

    if (!serializationConfig) {
      console.debug(`${serializableId} is not recognized by this QSerializer. Was it registered?`);
      return;
    }

    for (const fieldConfig of serializationConfig.serializableFields) {
      this.writeFieldToBuffer(buffer, serializable, fieldConfig);
    }
  }

  private writeFieldToBuffer(buffer: GMBuffer, serializable: any, fieldConfig: SerializableField) {
    const dataType = fieldConfig.bufferType;
    const fieldName = fieldConfig.fieldName;
    const fieldValue = serializable[fieldName];

    console.log(`Writing data type ${dataType} to buffer for field ${fieldName}.`);

    if (dataType === buffer_string && typeof fieldValue !== 'string') {
      console.log('Expected a string but received a different type.');
      return;
    }

    if (DataType.isArray(dataType)) {
      this.writeArrayToBuffer(buffer, fieldValue, dataType[0]);
    } else if (DataType.isSerializable(dataType)) {
      this.writeInstanceToBuffer(buffer, fieldValue);
    } else {
      buffer.write(fieldValue, dataType as GameMakerBufferType);
    }
  }

  private writeArrayToBuffer(buffer: GMBuffer, arrayValue: any[], dataType: Constructor) {
    const arrayLength = arrayValue.length;

    buffer.write(arrayLength, ARRAY_LENGTH_BUFFER_TYPE);

    if (DataType.isSerializable(dataType)) {
      arrayValue.forEach((item) => this.writeInstanceToBuffer(buffer, item));
    } else {
      arrayValue.forEach((item) => buffer.write(item, dataType));
    }
  }

  deserialize<T extends Constructor = Constructor>(buffer: Buffer): T | undefined {
    const gmBuffer = GMBuffer.from(buffer);
    const serialId = gmBuffer.read('buffer_u16');
    const config = this.getSerializableEntityPropsById(serialId);

    if (!config) {
      console.debug(`The serial id ${serialId} is not recognized by this QSerializer. Was it registered?`);
      return undefined;
    }

    const constructorProps = [];
    for (const serializableField of config.serializableFields) {
      const data = gmBuffer.read(serializableField.bufferType as GameMakerBufferType);
      constructorProps.push(data);
    }

    return new config.constructor(...constructorProps) as T;
  }

  getSerializableEntityPropsByName(entityName: string) {
    return this.serializableConfigs.get(entityName);
  }

  getSerializableEntityPropsById(id: number) {
    const name = this.getSerializableNameById(id);
    return this.getSerializableEntityPropsByName(name);
  }

  getSerializableNameById(id: number): string {
    const serializable = this.serializables[id];
    return Reflect.getMetadata('name', serializable);
  }
}

const DataType = {
  isArray: (dt: SerializableType): dt is Constructor[] => Array.isArray(dt),
  isSerializable: (dt: SerializableType): dt is Constructor => typeof dt === 'function',
};
