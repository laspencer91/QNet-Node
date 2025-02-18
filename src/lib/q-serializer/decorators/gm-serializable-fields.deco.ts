import 'reflect-metadata';
// Decorators to mark properties with buffer types
import {
  buffer_bool,
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
  Constructor,
  GameMakerBufferType,
} from '@types';

export function BufferBool(target: any, key: string) {
  Reflect.defineMetadata('bufferType', buffer_bool, target, key);
}

export function BufferU8(target: any, key: string) {
  Reflect.defineMetadata('bufferType', buffer_u8, target, key);
}

export function BufferU8Array(target: any, key: string) {
  Reflect.defineMetadata('bufferType', [buffer_u8], target, key);
}

export function BufferU16(target: any, key: string) {
  Reflect.defineMetadata('bufferType', buffer_u16, target, key);
}

export function BufferU32(target: any, key: string) {
  Reflect.defineMetadata('bufferType', buffer_u32, target, key);
}

export function BufferU64(target: any, key: string) {
  Reflect.defineMetadata('bufferType', buffer_u64, target, key);
}

export function BufferS8(target: any, key: string) {
  Reflect.defineMetadata('bufferType', buffer_s8, target, key);
}

export function BufferS16(target: any, key: string) {
  Reflect.defineMetadata('bufferType', buffer_s16, target, key);
}

export function BufferS32(target: any, key: string) {
  Reflect.defineMetadata('bufferType', buffer_s32, target, key);
}

export function BufferF32(target: any, key: string) {
  Reflect.defineMetadata('bufferType', buffer_f32, target, key);
}

export function BufferF64(target: any, key: string) {
  Reflect.defineMetadata('bufferType', buffer_f64, target, key);
}

export function BufferString(target: any, key: string) {
  Reflect.defineMetadata('bufferType', buffer_string, target, key);
}

export function BufferObject(type: Constructor) {
  return function (target: any, propertyKey: string) {
    Reflect.defineMetadata('design:type', type, target, propertyKey);
    const propertyType = Reflect.getMetadata('design:type', target, propertyKey);
    Reflect.defineMetadata('bufferType', type, target, propertyKey);
    console.log(`Type of ${type.name} is ${propertyType}`);
  };
}

export function BufferArray(type: Constructor | GameMakerBufferType) {
  return function (target: any, propertyKey: string) {
    Reflect.defineMetadata('bufferType', [type], target, propertyKey);
  };
}

export const BufferTypeDecoratorName = {
  buffer_u8: {
    decoName: '@BufferU8',
    tsType: 'number',
  },
  buffer_u16: {
    decoName: '@BufferU16',
    tsType: 'number',
  },
  buffer_s8: {
    decoName: '@BufferS8',
    tsType: 'number',
  },
  buffer_string: {
    decoName: '@BufferString',
    tsType: 'string',
  },
  buffer_bool: {
    decoName: '@BufferBool',
    tsType: 'boolean',
  },
  buffer_s16: {
    decoName: '@BufferS16',
    tsType: 'number',
  },
  buffer_u32: {
    decoName: '@BufferU32',
    tsType: 'number',
  },
  buffer_s32: {
    decoName: '@BufferS32',
    tsType: 'number',
  },
  buffer_u64: {
    decoName: '@BufferU64',
    tsType: 'bigint',
  },
  buffer_f32: {
    decoName: '@BufferF32',
    tsType: 'number',
  },
  buffer_f64: {
    decoName: '@BufferF64',
    tsType: 'bigint',
  },
  buffer_object: {
    decoName: '@BufferObject',
    tsType: null,
  },
} as const satisfies {
  [key in GameMakerBufferType | 'buffer_object']: {
    decoName: string;
    tsType: 'bigint' | 'number' | 'string' | 'boolean' | null;
  };
};
