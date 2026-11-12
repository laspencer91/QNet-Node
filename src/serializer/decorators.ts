import {
  buffer_bool,
  buffer_f16,
  buffer_f32,
  buffer_f64,
  buffer_s16,
  buffer_s32,
  buffer_s8,
  buffer_string,
  buffer_u16,
  buffer_u32,
  buffer_u64,
  buffer_u8,
} from '../buffer/buffer-types';
import { addField, defineMessage, FieldType, MessageClass } from './metadata';

export interface QSerializableOptions {
  /** Wire name, if the class name differs from the GameMaker constructor name. */
  name?: string;
  /**
   * The message serializes itself (GameMaker's MANUAL_SERIALIZATION). The class implements
   * `write(buffer)` and `read(buffer)`, or the codec is supplied with implementManual().
   */
  manual?: boolean;
}

/**
 * Marks a class as a QNet message.
 *
 * @example
 * @QSerializable
 * class PlayerMove {
 *   @Field(buffer_s16) x = 0;
 *   @Field(buffer_s16) y = 0;
 * }
 */
export function QSerializable(target: MessageClass): void;
export function QSerializable(options: QSerializableOptions): (target: MessageClass) => void;
export function QSerializable(arg: MessageClass | QSerializableOptions): void | ((target: MessageClass) => void) {
  if (typeof arg === 'function') {
    defineMessage(arg, {});
    return;
  }
  return (target: MessageClass) => defineMessage(target, arg);
}

/**
 * Declares a serialized field. The property name is the wire name and must match the
 * GameMaker struct variable.
 *
 * @example
 * @Field(buffer_u8) hp = 0;
 * @Field([Vec2]) path: Vec2[] = [];
 * @Field([[buffer_u8]]) grid: number[][] = [];
 */
export function Field(type: FieldType) {
  return (target: object, propertyKey: string | symbol) => {
    if (typeof propertyKey !== 'string') throw new Error('QNet fields must have string names');
    addField(target.constructor, propertyKey, type);
  };
}

// Shorthands, kept from QNet-Node 1.x.
export const BufferU8 = Field(buffer_u8);
export const BufferS8 = Field(buffer_s8);
export const BufferU16 = Field(buffer_u16);
export const BufferS16 = Field(buffer_s16);
export const BufferU32 = Field(buffer_u32);
export const BufferS32 = Field(buffer_s32);
export const BufferU64 = Field(buffer_u64);
export const BufferF16 = Field(buffer_f16);
export const BufferF32 = Field(buffer_f32);
export const BufferF64 = Field(buffer_f64);
export const BufferBool = Field(buffer_bool);
export const BufferString = Field(buffer_string);
export const BufferObject = (type: MessageClass) => Field(type);
export const BufferArray = (element: FieldType) => Field([element]);
