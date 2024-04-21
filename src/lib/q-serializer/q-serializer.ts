import { GMBuffer } from '../gm-buffer';
import { _QSerializableContainer } from './system/q-serializable-container';
import { buffer_string, buffer_u16, Constructor, GameMakerBufferType, NestedArray } from '@types';

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

export class QSerializer<H extends Constructor | undefined = undefined> {
  readonly serializables: Constructor[];

  readonly header?: { serializableFields: SerializableField[]; constructor: H };

  readonly serializableConfigs: Map<SerializableNameId, SerializableEntity> = new Map();

  constructor(serializables: Constructor[], headerType?: H) {
    this.serializables = this.registerSerializableList(serializables);
    if (headerType) {
      this.header = this.initHeader(headerType);
    }
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

  private initHeader(header: NonNullable<H>) {
    const serializableName = Reflect.getMetadata('name', header);
    const fields = _QSerializableContainer.instance.bufferTypesMap.get(serializableName);
    if (!fields) {
      throw new Error(
        `No fields found for @QSerializable - ${header}. 
        Ensure this class includes the proper annotation @QSerializable.`,
      );
    }
    return {
      serializableFields: fields as SerializableField[],
      constructor: header,
    };
  }

  serialize(serializable: InstanceType<Constructor>, headerInstance?: InstanceType<NonNullable<H>>) {
    const serializableName = Reflect.getMetadata('name', serializable.constructor);
    const config = this.serializableConfigs.get(serializableName);

    if (!config) {
      console.debug(`${serializableName} is not recognized by this QSerializer. Was it registered?`);
      return;
    }

    const buffer = GMBuffer.new(64);
    if (headerInstance) {
      this.writeHeader(buffer, headerInstance);
    }
    buffer.write(config.serialId, 'buffer_u16');
    this.writeInstanceToBuffer(buffer, serializable);

    return buffer.toBuffer();
  }

  writeHeader(buffer: GMBuffer, headerInstance: InstanceType<NonNullable<H>>) {
    if (!this.header) {
      throw new Error(
        'Attempting to write a header, but no header type has been specified for this QSerializable instance.',
      );
    }

    for (const fieldConfig of this.header.serializableFields) {
      this.writeFieldToBuffer(buffer, headerInstance, fieldConfig);
    }
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

  private writeFieldToBuffer(
    buffer: GMBuffer,
    serializable: InstanceType<Constructor>,
    fieldConfig: SerializableField,
  ) {
    const dataType = fieldConfig.bufferType;
    const fieldName = fieldConfig.fieldName;
    const fieldValue = serializable[fieldName as keyof typeof serializable] as any;

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

  deserialize<T extends Constructor = Constructor>(buffer: Buffer): { instance: T | undefined; header?: H } {
    const gmBuffer = GMBuffer.from(buffer);
    const header = this.readHeader(gmBuffer);
    console.log('READ HEADER', header);
    const serialId = gmBuffer.read('buffer_u16');
    const config = this.getSerializableEntityPropsById(serialId);

    if (!config) {
      console.debug(`The serial id ${serialId} is not recognized by this QSerializer. Was it registered?`);
      return { instance: undefined, header: header };
    }

    const constructorProps = [];
    for (const serializableField of config.serializableFields) {
      const data = this.readFieldFromBuffer(gmBuffer, serializableField.bufferType);
      constructorProps.push(data);
    }

    return {
      header: header,
      instance: new config.constructor(...constructorProps) as T,
    };
  }

  readHeader(buffer: GMBuffer): H | undefined {
    if (!this.header) {
      return;
    }
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-expect-error
    return this.readInstanceFromBuffer(buffer, this.header.constructor) as H;
  }

  private readFieldFromBuffer(buffer: GMBuffer, dataType: SerializableType) {
    if (DataType.isArray(dataType)) {
      return this.readArrayFromBuffer(buffer, dataType[0]);
    } else if (DataType.isSerializable(dataType)) {
      return this.readInstanceFromBuffer(buffer, dataType);
    }

    return buffer.read(dataType as GameMakerBufferType);
  }

  private readArrayFromBuffer(buffer: GMBuffer, dataType: SerializableType) {
    const arrayLength = buffer.read(ARRAY_LENGTH_BUFFER_TYPE);
    const array = new Array<
      string | number | boolean | Constructor | NestedArray<string | number | boolean | Constructor>
    >();
    for (let i = 0; i < arrayLength; i++) {
      const fieldData = this.readFieldFromBuffer(buffer, dataType);
      array.push(fieldData);
    }
    return array;
  }

  private readInstanceFromBuffer(buffer: GMBuffer, dataType: Constructor): Constructor {
    if (this.header?.constructor && dataType.name === this.header.constructor.name) {
      const constructorProps = [];
      for (const serializableField of this.header.serializableFields) {
        const data = this.readFieldFromBuffer(buffer, serializableField.bufferType);
        constructorProps.push(data);
      }

      return new this.header.constructor(...constructorProps) as Constructor;
    } else {
      const serializableEntity = this.getSerializableEntityPropsByName(dataType.name);
      if (!serializableEntity) {
        throw new Error(`Type ${dataType.name} is not registered with QSerializer. Could not deserialize.`);
      }
      const constructorProps = [];
      for (const serializableField of serializableEntity.serializableFields) {
        const data = this.readFieldFromBuffer(buffer, serializableField.bufferType);
        constructorProps.push(data);
      }

      return new serializableEntity.constructor(...constructorProps) as Constructor;
    }
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
