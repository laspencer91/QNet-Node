import { BufferType } from '../buffer/buffer-types';
import { GMBuffer } from '../buffer/gm-buffer';

/** Any class or constructor function, used as a map key. */
// eslint-disable-next-line @typescript-eslint/ban-types
export type AnyClass = Function;

/** Any class that can be a message. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type MessageClass<T extends object = any> = abstract new (...args: any[]) => T;

/** A deferred type, for structs that reference themselves or a class declared later. */
export interface LazyType {
  readonly lazy: () => FieldType;
}

/**
 * How a field is declared:
 *  - a buffer type: `buffer_u8`
 *  - a registered message class: `Vec2`
 *  - an array of any of these: `[buffer_u8]`, `[Vec2]`, `[[buffer_u8]]`
 *  - `lazy(() => TreeNode)` when the class is not defined yet
 */
export type FieldType = BufferType | MessageClass | LazyType | readonly [FieldType];

export interface FieldDefinition {
  name: string;
  type: FieldType;
}

/** Hand-written serialization for a message marked `manual`. */
export interface ManualCodec<T extends object = object> {
  write(buffer: GMBuffer, message: T): void;
  read(buffer: GMBuffer, message: T): void;
}

export interface MessageDefinition {
  /** Wire name. Must equal the GameMaker constructor name. */
  name: string;
  manual: boolean;
  fields: FieldDefinition[];
}

const pendingFields = new Map<AnyClass, FieldDefinition[]>();
const definitions = new Map<AnyClass, MessageDefinition>();
const manualCodecs = new Map<AnyClass, ManualCodec>();

export function lazy(resolve: () => FieldType): LazyType {
  return { lazy: resolve };
}

export function isLazyType(value: unknown): value is LazyType {
  return typeof value === 'object' && value !== null && typeof (value as LazyType).lazy === 'function';
}

/** @internal */
export function addField(ctor: AnyClass, name: string, type: FieldType) {
  const fields = pendingFields.get(ctor) ?? [];
  if (fields.some((field) => field.name === name)) throw new Error(`${ctor.name}.${name} is declared twice`);
  fields.push({ name, type });
  pendingFields.set(ctor, fields);
}

/** @internal */
export function defineMessage(ctor: AnyClass, options: { name?: string; manual?: boolean }) {
  const fields = pendingFields.get(ctor) ?? [];
  pendingFields.delete(ctor);
  definitions.set(ctor, { name: options.name ?? ctor.name, manual: options.manual ?? false, fields });
}

export function getMessageDefinition(ctor: AnyClass): MessageDefinition | undefined {
  return definitions.get(ctor);
}

/**
 * Provide Read/Write for a message that GameMaker serializes by hand (MANUAL_SERIALIZATION).
 * Generated classes call into this, so the generated file never needs editing.
 */
export function implementManual<T extends object>(type: MessageClass<T>, codec: ManualCodec<T>) {
  manualCodecs.set(type, codec as ManualCodec);
}

/** @internal */
export function getManualCodec(ctor: AnyClass): ManualCodec | undefined {
  return manualCodecs.get(ctor);
}
