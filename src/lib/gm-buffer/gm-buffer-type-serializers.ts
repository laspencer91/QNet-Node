import { GameMakerBufferType } from './types/gm-buffers.types';

interface GMBufferTypeSerializer<T = any> {
  sizeOf: (data?: T) => number;
  writeFunction: (buffer: Buffer, value: T, tell: number) => number;
  readFunction: (buffer: Buffer, tell: number) => T;
}

// ----------------- Serializer Types ------------------------
//  Properties and functions for each type of GM buffer.
// -----------------------------------------------------------

const GMBufferU8: GMBufferTypeSerializer<number> = {
  sizeOf: () => 1,
  writeFunction: (buffer, value, tell) => buffer.writeUInt8(value, tell),
  readFunction: (buffer, tell) => buffer.readUInt8(tell),
};
const GMBufferS8: GMBufferTypeSerializer<number> = {
  sizeOf: () => 1,
  writeFunction: (buffer, value, tell) => buffer.writeInt8(value, tell),
  readFunction: (buffer, tell) => buffer.readInt8(tell),
};
const GMBufferU16: GMBufferTypeSerializer<number> = {
  sizeOf: () => 2,
  writeFunction: (buffer, value, tell) => buffer.writeUInt16LE(value, tell),
  readFunction: (buffer, tell) => buffer.readUInt16LE(tell),
};
const GMBufferS16: GMBufferTypeSerializer<number> = {
  sizeOf: () => 2,
  writeFunction: (buffer, value, tell) => buffer.writeInt16LE(value, tell),
  readFunction: (buffer, tell) => buffer.readInt16LE(tell),
};
const GMBufferU32: GMBufferTypeSerializer<number> = {
  sizeOf: () => 4,
  writeFunction: (buffer, value, tell) => buffer.writeUInt32LE(value, tell),
  readFunction: (buffer, tell) => buffer.readUInt32LE(tell),
};
const GMBufferU64: GMBufferTypeSerializer<bigint> = {
  sizeOf: () => 8,
  writeFunction: (buffer, value, tell) => buffer.writeBigUInt64LE(value, tell),
  readFunction: (buffer, tell) => buffer.readBigUInt64LE(tell),
};
const GMBufferS32: GMBufferTypeSerializer<number> = {
  sizeOf: () => 4,
  writeFunction: (buffer, value, tell) => buffer.writeInt32LE(value, tell),
  readFunction: (buffer, tell) => buffer.readInt32LE(tell),
};
const GMBufferF32: GMBufferTypeSerializer<number> = {
  sizeOf: () => 4,
  writeFunction: (buffer, value, tell) => buffer.writeFloatLE(value, tell),
  readFunction: (buffer, tell) => buffer.readFloatLE(tell),
};
const GMBufferF64: GMBufferTypeSerializer<number> = {
  sizeOf: () => 8,
  writeFunction: (buffer, value, tell) => buffer.writeDoubleLE(value, tell),
  readFunction: (buffer, tell) => buffer.readDoubleLE(tell),
};
const GMBufferBool: GMBufferTypeSerializer<boolean> = {
  sizeOf: () => 1,
  writeFunction: (buffer, value, tell) => buffer.writeUInt8(value ? 1 : 0, tell),
  readFunction: (buffer, tell) => Boolean(buffer.readUInt8(tell)),
};
const GMBufferString: GMBufferTypeSerializer<string> = {
  // We add 1 to the length of the data, because GameMaker adds a null terminator at the end of the string.
  sizeOf: (data) => data ? Buffer.byteLength(data, 'utf8') + 1 : 0,
  writeFunction: (buffer, value, tell) => tell + buffer.write(value + '\0', tell, 'utf8'),
  readFunction: (buffer, tell) => {
    // Find the index of the null terminator
    const nullIndex = buffer.indexOf('\0', tell);
    if (nullIndex < 0) throw new Error('Expect a null terminator while reading a buffer string, but did not find one.');
    // Extract the string up to the null terminator
    return buffer.toString('utf8', tell, nullIndex);
  },
};

export const GMBufferSerial: { [key in GameMakerBufferType]: GMBufferTypeSerializer} = {
  buffer_u8: GMBufferU8,
  buffer_s8: GMBufferS8,
  buffer_u16: GMBufferU16,
  buffer_s16: GMBufferS16,
  buffer_u32: GMBufferU32,
  buffer_s32: GMBufferS32,
  buffer_f32: GMBufferF32,
  buffer_u64: GMBufferU64,
  buffer_f64: GMBufferF64,
  buffer_bool: GMBufferBool,
  buffer_string: GMBufferString,
};