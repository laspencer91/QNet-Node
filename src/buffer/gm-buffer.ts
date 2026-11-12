import { BufferType, BufferValue } from './buffer-types';

/**
 * A growable, little-endian byte buffer that reads and writes GameMaker buffer types exactly
 * as GameMaker's buffer_read / buffer_write do.
 *
 * Reading past the end throws a RangeError.
 */
export class GMBuffer {
  private data: Buffer;
  private position = 0;
  /** Bytes in use: the highest position written, or the full size of a buffer being read. */
  private used: number;

  private constructor(data: Buffer, used: number) {
    this.data = data;
    this.used = used;
  }

  /** An empty buffer for writing. It grows as needed. */
  static alloc(initialSize = 64): GMBuffer {
    return new GMBuffer(Buffer.alloc(Math.max(1, initialSize)), 0);
  }

  /** Wrap existing bytes for reading. The bytes are not copied. */
  static from(data: Buffer | Uint8Array): GMBuffer {
    const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data.buffer, data.byteOffset, data.byteLength);
    return new GMBuffer(buffer, buffer.length);
  }

  /** Current read/write position. */
  get tell(): number {
    return this.position;
  }

  /** Number of bytes in use. */
  get size(): number {
    return this.used;
  }

  /** Bytes left to read. */
  get remaining(): number {
    return this.used - this.position;
  }

  seek(position: number): this {
    if (position < 0 || position > this.used) throw new RangeError(`seek(${position}) is outside 0..${this.used}`);
    this.position = position;
    return this;
  }

  /** The bytes in use, without copying. */
  toBuffer(): Buffer {
    return this.data.subarray(0, this.used);
  }

  write<T extends BufferType>(value: BufferValue<T> | number, type: T): this {
    switch (type) {
      case 'buffer_u8':
        this.ensure(1);
        this.data.writeUInt8(value as number, this.position);
        return this.advance(1);
      case 'buffer_s8':
        this.ensure(1);
        this.data.writeInt8(value as number, this.position);
        return this.advance(1);
      case 'buffer_u16':
        this.ensure(2);
        this.data.writeUInt16LE(value as number, this.position);
        return this.advance(2);
      case 'buffer_s16':
        this.ensure(2);
        this.data.writeInt16LE(value as number, this.position);
        return this.advance(2);
      case 'buffer_u32':
        this.ensure(4);
        this.data.writeUInt32LE(value as number, this.position);
        return this.advance(4);
      case 'buffer_s32':
        this.ensure(4);
        this.data.writeInt32LE(value as number, this.position);
        return this.advance(4);
      case 'buffer_u64':
        this.ensure(8);
        this.data.writeBigUInt64LE(BigInt(value as number | bigint), this.position);
        return this.advance(8);
      case 'buffer_f16':
        this.ensure(2);
        this.data.writeUInt16LE(floatToHalf(value as number), this.position);
        return this.advance(2);
      case 'buffer_f32':
        this.ensure(4);
        this.data.writeFloatLE(value as number, this.position);
        return this.advance(4);
      case 'buffer_f64':
        this.ensure(8);
        this.data.writeDoubleLE(value as number, this.position);
        return this.advance(8);
      case 'buffer_bool':
        this.ensure(1);
        this.data.writeUInt8(value ? 1 : 0, this.position);
        return this.advance(1);
      case 'buffer_string': {
        const text = String(value);
        const length = Buffer.byteLength(text, 'utf8');
        this.ensure(length + 1);
        this.data.write(text, this.position, 'utf8');
        this.data.writeUInt8(0, this.position + length);
        return this.advance(length + 1);
      }
    }
    throw new TypeError(`Unknown buffer type: ${type}`);
  }

  read<T extends BufferType>(type: T): BufferValue<T> {
    return this.readAny(type) as BufferValue<T>;
  }

  /** Copy raw bytes in. */
  writeBytes(bytes: Buffer | Uint8Array): this {
    this.ensure(bytes.length);
    this.data.set(bytes, this.position);
    return this.advance(bytes.length);
  }

  /** Raw bytes out, as a view (not a copy). */
  readBytes(length: number): Buffer {
    this.require(length);
    const bytes = this.data.subarray(this.position, this.position + length);
    this.position += length;
    return bytes;
  }

  private readAny(type: BufferType): number | bigint | boolean | string {
    const at = this.position;
    switch (type) {
      case 'buffer_u8':
        this.require(1);
        this.position += 1;
        return this.data.readUInt8(at);
      case 'buffer_s8':
        this.require(1);
        this.position += 1;
        return this.data.readInt8(at);
      case 'buffer_u16':
        this.require(2);
        this.position += 2;
        return this.data.readUInt16LE(at);
      case 'buffer_s16':
        this.require(2);
        this.position += 2;
        return this.data.readInt16LE(at);
      case 'buffer_u32':
        this.require(4);
        this.position += 4;
        return this.data.readUInt32LE(at);
      case 'buffer_s32':
        this.require(4);
        this.position += 4;
        return this.data.readInt32LE(at);
      case 'buffer_u64':
        this.require(8);
        this.position += 8;
        return this.data.readBigUInt64LE(at);
      case 'buffer_f16':
        this.require(2);
        this.position += 2;
        return halfToFloat(this.data.readUInt16LE(at));
      case 'buffer_f32':
        this.require(4);
        this.position += 4;
        return this.data.readFloatLE(at);
      case 'buffer_f64':
        this.require(8);
        this.position += 8;
        return this.data.readDoubleLE(at);
      case 'buffer_bool':
        this.require(1);
        this.position += 1;
        return this.data.readUInt8(at) !== 0;
      case 'buffer_string': {
        const end = this.data.indexOf(0, at);
        if (end < 0 || end >= this.used) throw new RangeError('buffer_string has no null terminator');
        this.position = end + 1;
        return this.data.toString('utf8', at, end);
      }
    }
    throw new TypeError(`Unknown buffer type: ${type}`);
  }

  private require(bytes: number) {
    if (this.position + bytes > this.used) {
      throw new RangeError(`Read of ${bytes} bytes at ${this.position} runs past the end (${this.used})`);
    }
  }

  private ensure(bytes: number) {
    const needed = this.position + bytes;
    if (needed <= this.data.length) return;
    let capacity = this.data.length * 2;
    while (capacity < needed) capacity *= 2;
    const grown = Buffer.alloc(capacity);
    this.data.copy(grown, 0, 0, this.used);
    this.data = grown;
  }

  private advance(bytes: number): this {
    this.position += bytes;
    if (this.position > this.used) this.used = this.position;
    return this;
  }
}

// ---- IEEE 754 half precision ---------------------------------------------------------

const f32 = new Float32Array(1);
const u32 = new Uint32Array(f32.buffer);

/** Float to half-precision bits, rounding to nearest even. */
export function floatToHalf(value: number): number {
  f32[0] = value;
  const bits = u32[0];
  const sign = (bits >>> 16) & 0x8000;
  const exponent = (bits >>> 23) & 0xff;
  let mantissa = bits & 0x7fffff;

  if (exponent === 0xff) return sign | 0x7c00 | (mantissa ? 0x200 : 0); // Inf / NaN
  const halfExponent = exponent - 127 + 15;
  if (halfExponent >= 0x1f) return sign | 0x7c00; // overflow to Inf
  if (halfExponent <= 0) {
    if (halfExponent < -10) return sign; // underflow to zero
    mantissa |= 0x800000;
    const shift = 14 - halfExponent;
    let half = mantissa >> shift;
    const remainder = mantissa & ((1 << shift) - 1);
    const halfway = 1 << (shift - 1);
    if (remainder > halfway || (remainder === halfway && half & 1)) half++;
    return sign | half;
  }
  let half = sign | (halfExponent << 10) | (mantissa >> 13);
  const remainder = mantissa & 0x1fff;
  if (remainder > 0x1000 || (remainder === 0x1000 && half & 1)) half++;
  return half;
}

export function halfToFloat(half: number): number {
  const sign = half & 0x8000 ? -1 : 1;
  const exponent = (half >> 10) & 0x1f;
  const mantissa = half & 0x3ff;
  if (exponent === 0) return sign * Math.pow(2, -14) * (mantissa / 1024);
  if (exponent === 0x1f) return mantissa ? NaN : sign * Infinity;
  return sign * Math.pow(2, exponent - 15) * (1 + mantissa / 1024);
}
