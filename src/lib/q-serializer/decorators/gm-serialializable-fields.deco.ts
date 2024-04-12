const buffer_u8 = 'buffer_u8';
const buffer_u16 = 'buffer_u16';
const buffer_string = 'buffer_string';

// Decorators to mark properties with buffer types
export function BufferU8(target: any, key: string) {
  Reflect.defineMetadata('bufferType', buffer_u8, target, key);
}

export function BufferU16(target: any, key: string) {
  Reflect.defineMetadata('bufferType', buffer_u16, target, key);
}

export function BufferString(target: any, key: string) {
  Reflect.defineMetadata('bufferType', buffer_string, target, key);
}