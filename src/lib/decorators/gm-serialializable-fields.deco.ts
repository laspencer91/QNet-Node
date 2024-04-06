const buffer_u8 = 'buffer_u8';
const buffer_u16 = 'buffer_u16';

// Decorators to mark properties with buffer types
export function BufferU8(target: any, key: string) {
  Reflect.defineMetadata('bufferType', buffer_u8, target, key);
}

export function BufferU16(target: any, key: string) {
  Reflect.defineMetadata('bufferType', buffer_u16, target, key);
}