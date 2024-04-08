import { QSerializable } from './types/q-serializable.interface';
import { GameMakerBufferType } from './types/gm-buffers.types';
import { GMBuffer } from './gm-buffer';
import { _QSerializableContainer } from './system/q-serializable-container';
import { Constructor } from './types/constructor.type';

type SerializableNameId = string;


export type SerializableField<RecognizedSerializables extends Array<Constructor> = Array<Constructor>> = {
  fieldName: string,
  bufferType: GameMakerBufferType | RecognizedSerializables[number]
};

export type SerializableEntityProps<RecognizedSerializables extends Array<Constructor>> = {
  serialId: number;
  name: SerializableNameId;
  // We pass in the serializable array to generate type hinting for the bufferType. May not be needed?
  serializableFields: Array<SerializableField<RecognizedSerializables>>;
  constructor: Constructor
};

export class QSerializer<RecognizedSerializables extends Array<Constructor>> {
  readonly serializables: RecognizedSerializables;

  readonly serializableConfigs: Map<SerializableNameId, SerializableEntityProps<RecognizedSerializables>> = new Map();

  constructor(serializables: RecognizedSerializables) {
    this.serializables = this.registerSerializables(serializables);
  }

  private registerSerializables(serializables: RecognizedSerializables) {
    for (let i = 0; i < serializables.length; i++) {
      const qSerializable = serializables[i];
      const className = Reflect.getMetadata('name', qSerializable);

      const fields = _QSerializableContainer.instance.bufferTypesMap.get(className);
      if (fields === undefined) {
        throw new Error(`No fields found for @QSerializable - ${className}`);
      }

      this.serializableConfigs.set(className, {
        serialId: i,
        name: className,
        serializableFields: fields as SerializableField<RecognizedSerializables>[],
        constructor: serializables[i]
      });

      console.log(`Registering ${className} with buffers: `, );
    }

    return serializables;
  }

  getSerializableTypeById<ID extends number>(id: ID): typeof this.serializables[ID] {
    return this.serializables[id];
  }

  getSerializableNameById<ID extends number>(id: ID): string {
    const serializable = this.serializables[id];
    return Reflect.getMetadata('name', serializable);
  }

  serialize<T extends InstanceType<RecognizedSerializables[number]>>(serializable: T) {
    const incomingSerializableNameIdentifier = Reflect.getMetadata('name', serializable.constructor);
    const config = this.serializableConfigs.get(incomingSerializableNameIdentifier);

    if (!config) {
      console.debug(`${incomingSerializableNameIdentifier} is not recognized by this QSerializer. Was it registered?`);
      return;
    }

    const buffer = GMBuffer.new(64);
    buffer.write(config.serialId, 'buffer_u16'); // <--- Packet ID
    // Write Buffer Now, using the mappings.
    for (const serializableField of config.serializableFields) {
      const data = serializable[serializableField.fieldName as keyof typeof serializable];
      // TODO: Remove 'as' here when GMBufferTypes are supported.
      buffer.write(data, serializableField.bufferType as GameMakerBufferType);
    }

    return buffer.toBuffer();
  }

  deserialize(buffer: Buffer): QSerializable | undefined {
    const gmBuffer = GMBuffer.from(buffer);
    const serialId = gmBuffer.read('buffer_u16') as number;
    const config = this.getSerializableEntityPropsById(serialId);

    if (!config) {
      console.debug(`The serial id ${serialId} is not recognized by this QSerializer. Was it registered?`);
      return undefined;
    }

    const constructorProps = [];
    // Read Buffer Now, using the mappings.
    for (const serializableField of config.serializableFields) {
      const data = gmBuffer.read(serializableField.bufferType as GameMakerBufferType);
      constructorProps.push(data);
    }

    return new config.constructor(...constructorProps);
  }

  getSerializableEntityPropsByName(entityName: string) {
    return this.serializableConfigs.get(entityName);
  }

  getSerializableEntityPropsById(id: number) {
    const name = this.getSerializableNameById(id);
    return this.getSerializableEntityPropsByName(name);
  }
}