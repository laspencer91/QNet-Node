/**
 * GameMaker buffer types. The names match GameMaker's constants so message classes read
 * the same on both sides: `@Field(buffer_s16) x = 0;` mirrors `_x = buffer_s16`.
 */
export const buffer_u8 = 'buffer_u8';
export const buffer_s8 = 'buffer_s8';
export const buffer_u16 = 'buffer_u16';
export const buffer_s16 = 'buffer_s16';
export const buffer_u32 = 'buffer_u32';
export const buffer_s32 = 'buffer_s32';
export const buffer_u64 = 'buffer_u64';
export const buffer_f16 = 'buffer_f16';
export const buffer_f32 = 'buffer_f32';
export const buffer_f64 = 'buffer_f64';
export const buffer_bool = 'buffer_bool';
export const buffer_string = 'buffer_string';

export const BUFFER_TYPES = [
  buffer_u8,
  buffer_s8,
  buffer_u16,
  buffer_s16,
  buffer_u32,
  buffer_s32,
  buffer_u64,
  buffer_f16,
  buffer_f32,
  buffer_f64,
  buffer_bool,
  buffer_string,
] as const;

export type BufferType = (typeof BUFFER_TYPES)[number];

/** The TypeScript value type each buffer type reads and writes. */
export type BufferValue<T extends BufferType> = T extends 'buffer_string'
  ? string
  : T extends 'buffer_bool'
    ? boolean
    : T extends 'buffer_u64'
      ? bigint
      : number;

export function isBufferType(value: unknown): value is BufferType {
  return typeof value === 'string' && (BUFFER_TYPES as readonly string[]).includes(value);
}

/** Short name used in the schema hash ("u8", "string", ...). See PROTOCOL.md. */
export function bufferTypeSchemaName(type: BufferType): string {
  return type.slice('buffer_'.length);
}
