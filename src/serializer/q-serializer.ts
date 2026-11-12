import { createHash } from 'crypto';
import { BufferType, bufferTypeSchemaName, isBufferType } from '../buffer/buffer-types';
import { GMBuffer } from '../buffer/gm-buffer';
import { PROTOCOL_VERSION } from '../net/constants';
import {
  AnyClass,
  FieldType,
  getManualCodec,
  getMessageDefinition,
  isLazyType,
  MessageClass,
  MessageDefinition,
} from './metadata';

type Codec =
  | { kind: 'primitive'; type: BufferType }
  | { kind: 'array'; element: Codec }
  | { kind: 'struct'; message: MessageType };

interface MessageType {
  id: number;
  name: string;
  ctor: MessageClass;
  manual: boolean;
  /** Field names in wire order (sorted). */
  fields: string[];
  codecs: Codec[];
  declared: FieldType[];
}

/** Raised for programmer errors: unregistered messages, wrong field values, bad declarations. */
export class QSerializerError extends Error {
  override name = 'QSerializerError';
}

/** Plain character-code ordering, identical to GameMaker's array_sort on strings. */
export function compareFieldNames(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Turns registered message classes into bytes and back, byte-for-byte compatible with
 * QSerializer in GameMaker. A message's index in the list is its id on the wire, so every
 * peer must register the same classes in the same order.
 */
export class QSerializer {
  /** Hash of every registered type and field; peers with different hashes cannot talk. */
  readonly schemaHash: number;
  /** The exact string the hash is computed from. Handy when debugging a mismatch. */
  readonly schemaString: string;

  private readonly typesById: MessageType[] = [];
  private readonly typesByCtor = new Map<AnyClass, MessageType>();

  constructor(messages: readonly MessageClass[]) {
    if (!Array.isArray(messages)) throw new QSerializerError('QSerializer needs an array of message classes');
    if (messages.length > 256) throw new QSerializerError('QSerializer supports at most 256 message types');

    const names = new Set<string>();
    messages.forEach((ctor, id) => {
      const definition = getMessageDefinition(ctor);
      if (!definition) {
        throw new QSerializerError(`${ctor?.name ?? ctor} is not a message class. Add @QSerializable to it.`);
      }
      if (names.has(definition.name)) throw new QSerializerError(`${definition.name} is registered twice`);
      names.add(definition.name);
      const type = this.createType(id, ctor, definition);
      this.typesById.push(type);
      this.typesByCtor.set(ctor, type);
    });
    // Second pass so nested types can appear anywhere in the list.
    for (const type of this.typesById) {
      type.codecs = type.declared.map((declared, i) => this.compile(declared, type, type.fields[i]));
    }

    this.schemaString = this.buildSchemaString();
    this.schemaHash = parseInt(createHash('md5').update(this.schemaString, 'utf8').digest('hex').slice(0, 8), 16);
  }

  /** Writes a message (type id, then fields) at the buffer's position. */
  write(buffer: GMBuffer, message: object): void {
    const type = this.typeOf(message);
    buffer.write(type.id, 'buffer_u8');
    this.writeBody(buffer, type, message);
  }

  /**
   * Reads one message at the buffer's position. Returns undefined for an unknown type id;
   * throws if the data is malformed.
   */
  read(buffer: GMBuffer): object | undefined {
    const id = buffer.read('buffer_u8');
    const type = this.typesById[id];
    if (!type) return undefined;
    return this.readBody(buffer, type);
  }

  /** Serializes one message into new bytes. */
  serialize(message: object): Buffer {
    const buffer = GMBuffer.alloc(64);
    this.write(buffer, message);
    return Buffer.from(buffer.toBuffer());
  }

  /** Deserializes bytes produced by serialize() (or GameMaker). Undefined if they cannot be read. */
  deserialize(bytes: Buffer | Uint8Array): object | undefined {
    try {
      return this.read(GMBuffer.from(bytes));
    } catch {
      return undefined;
    }
  }

  isRegistered(type: MessageClass): boolean {
    return this.typesByCtor.has(type);
  }

  /** The wire name of a message instance's class. */
  nameOf(message: object): string {
    return this.typeOf(message).name;
  }

  // ---- Writing --------------------------------------------------------------------

  private typeOf(message: object): MessageType {
    if (typeof message !== 'object' || message === null) {
      throw new QSerializerError(`Tried to send ${String(message)}, which is not a message object`);
    }
    const type = this.typesByCtor.get(message.constructor);
    if (!type) {
      throw new QSerializerError(
        `${message.constructor.name} is not a registered message type. Add it to the messages list.`,
      );
    }
    return type;
  }

  private writeBody(buffer: GMBuffer, type: MessageType, message: object) {
    if (type.manual) {
      this.manualCodec(type, message).write(buffer, message);
      return;
    }
    const values = message as Record<string, unknown>;
    for (let i = 0; i < type.fields.length; i++) {
      this.writeValue(buffer, type.codecs[i], values[type.fields[i]], type, type.fields[i]);
    }
  }

  private writeValue(buffer: GMBuffer, codec: Codec, value: unknown, type: MessageType, field: string) {
    switch (codec.kind) {
      case 'primitive': {
        const t = codec.type;
        const ok =
          t === 'buffer_string'
            ? typeof value === 'string'
            : t === 'buffer_bool'
              ? typeof value === 'boolean' || typeof value === 'number'
              : t === 'buffer_u64'
                ? typeof value === 'bigint' || typeof value === 'number'
                : typeof value === 'number' || typeof value === 'boolean';
        if (!ok) this.fieldError(type, field, t, value);
        try {
          buffer.write(value as number, t);
        } catch (error) {
          throw new QSerializerError(`${type.name}.${field}: ${(error as Error).message}`);
        }
        return;
      }
      case 'array': {
        if (!Array.isArray(value)) this.fieldError(type, field, 'an array', value);
        const items = value as unknown[];
        if (items.length > 65535) this.fieldError(type, field, 'at most 65535 items', `${items.length} items`);
        buffer.write(items.length, 'buffer_u16');
        for (const item of items) this.writeValue(buffer, codec.element, item, type, field);
        return;
      }
      case 'struct':
        if (typeof value !== 'object' || value === null) this.fieldError(type, field, codec.message.name, value);
        this.writeBody(buffer, codec.message, value as object);
        return;
    }
  }

  private fieldError(type: MessageType, field: string, expected: string, value: unknown): never {
    throw new QSerializerError(`${type.name}.${field} should be ${expected}, got ${typeof value}: ${String(value)}`);
  }

  // ---- Reading --------------------------------------------------------------------

  private readBody(buffer: GMBuffer, type: MessageType): object {
    // Built without running the constructor, so constructors are free to require arguments.
    const message = Object.create(type.ctor.prototype) as Record<string, unknown>;
    if (type.manual) {
      this.manualCodec(type, message).read(buffer, message);
      return message;
    }
    for (let i = 0; i < type.fields.length; i++) {
      message[type.fields[i]] = this.readValue(buffer, type.codecs[i]);
    }
    return message;
  }

  private readValue(buffer: GMBuffer, codec: Codec): unknown {
    switch (codec.kind) {
      case 'primitive':
        return buffer.read(codec.type);
      case 'array': {
        const length = buffer.read('buffer_u16');
        if (length > buffer.remaining && !this.mayBeEmpty(codec.element)) {
          throw new RangeError('array length exceeds remaining data');
        }
        const items = new Array(length);
        for (let i = 0; i < length; i++) items[i] = this.readValue(buffer, codec.element);
        return items;
      }
      case 'struct':
        return this.readBody(buffer, codec.message);
    }
  }

  private mayBeEmpty(codec: Codec): boolean {
    return codec.kind === 'struct' && !codec.message.manual && codec.message.fields.length === 0;
  }

  private manualCodec(type: MessageType, message: object) {
    const codec = getManualCodec(type.ctor);
    if (codec) return codec;
    const self = message as { write?: unknown; read?: unknown };
    if (typeof self.write === 'function' && typeof self.read === 'function') {
      return {
        write: (buffer: GMBuffer, m: object) => (m as { write(b: GMBuffer): void }).write(buffer),
        read: (buffer: GMBuffer, m: object) => (m as { read(b: GMBuffer): void }).read(buffer),
      };
    }
    throw new QSerializerError(
      `${type.name} uses manual serialization but has no codec. ` +
        'Give the class write(buffer) and read(buffer) methods, ' +
        `or call implementManual(${type.name}, { write, read }).`,
    );
  }

  // ---- Registration ---------------------------------------------------------------

  private createType(id: number, ctor: MessageClass, definition: MessageDefinition): MessageType {
    const fields = [...definition.fields].sort((a, b) => compareFieldNames(a.name, b.name));
    return {
      id,
      name: definition.name,
      ctor,
      manual: definition.manual,
      fields: definition.manual ? [] : fields.map((field) => field.name),
      declared: definition.manual ? [] : fields.map((field) => field.type),
      codecs: [],
    };
  }

  private compile(declared: FieldType, type: MessageType, field: string): Codec {
    if (isLazyType(declared)) return this.compile(declared.lazy(), type, field);
    if (Array.isArray(declared)) {
      if (declared.length !== 1) {
        throw new QSerializerError(`${type.name}.${field}: an array type declares exactly one element type`);
      }
      return { kind: 'array', element: this.compile(declared[0], type, field) };
    }
    if (isBufferType(declared)) return { kind: 'primitive', type: declared };
    if (typeof declared === 'function') {
      const nested = this.typesByCtor.get(declared);
      if (nested) return { kind: 'struct', message: nested };
      throw new QSerializerError(
        `${type.name}.${field} uses ${declared.name}, which is not in the messages list. ` +
          'Nested types must be registered too.',
      );
    }
    throw new QSerializerError(`${type.name}.${field} has an unsupported type: ${String(declared)}`);
  }

  private codecString(codec: Codec): string {
    switch (codec.kind) {
      case 'primitive':
        return bufferTypeSchemaName(codec.type);
      case 'array':
        return `[${this.codecString(codec.element)}]`;
      case 'struct':
        return codec.message.name;
    }
  }

  private buildSchemaString(): string {
    let schema = `qnet${PROTOCOL_VERSION}`;
    for (const type of this.typesById) {
      schema += `|${type.name}:`;
      if (type.manual) {
        schema += 'manual';
        continue;
      }
      type.fields.forEach((field, i) => (schema += `${field}=${this.codecString(type.codecs[i])},`));
    }
    return schema;
  }
}
