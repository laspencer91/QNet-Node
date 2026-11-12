import { BufferType, GMBuffer } from '../src';
import { floatToHalf, halfToFloat } from '../src/buffer/gm-buffer';

describe('GMBuffer', () => {
  const cases: [BufferType, unknown][] = [
    ['buffer_u8', 255],
    ['buffer_s8', -128],
    ['buffer_u16', 65535],
    ['buffer_s16', -32768],
    ['buffer_u32', 4294967295],
    ['buffer_s32', -2147483648],
    ['buffer_u64', 18446744073709551615n],
    ['buffer_f16', 1.5],
    ['buffer_f32', 0.5],
    ['buffer_f64', 1234.5678],
    ['buffer_bool', true],
    ['buffer_string', 'héllo wörld'],
    ['buffer_string', ''],
  ];

  test.each(cases)('%s round trips %p', (type, value) => {
    const buffer = GMBuffer.alloc(1);
    buffer.write(value as never, type);
    buffer.write(7, 'buffer_u8'); // sentinel proves the reader advanced exactly the right amount
    const reader = GMBuffer.from(buffer.toBuffer());
    expect(reader.read(type)).toEqual(value);
    expect(reader.read('buffer_u8')).toBe(7);
    expect(reader.remaining).toBe(0);
  });

  test('little-endian layout matches GameMaker', () => {
    const buffer = GMBuffer.alloc();
    buffer.write(0x514e, 'buffer_u16').write(-2, 'buffer_s16').write('hi', 'buffer_string').write(true, 'buffer_bool');
    expect(buffer.toBuffer().toString('hex')).toBe('4e51' + 'feff' + '686900' + '01');
  });

  test('reading past the end throws', () => {
    const reader = GMBuffer.from(Buffer.from([1]));
    expect(() => reader.read('buffer_u16')).toThrow(RangeError);
    expect(() => GMBuffer.from(Buffer.from('abc')).read('buffer_string')).toThrow(RangeError);
  });

  test('grows past its initial size', () => {
    const buffer = GMBuffer.alloc(1);
    for (let i = 0; i < 1000; i++) buffer.write(i, 'buffer_u32');
    expect(buffer.size).toBe(4000);
    expect(GMBuffer.from(buffer.toBuffer()).seek(3996).read('buffer_u32')).toBe(999);
  });

  test('half floats', () => {
    expect(floatToHalf(1)).toBe(0x3c00);
    expect(floatToHalf(-2)).toBe(0xc000);
    expect(floatToHalf(65504)).toBe(0x7bff);
    expect(floatToHalf(1e6)).toBe(0x7c00);
    expect(halfToFloat(0x3555)).toBeCloseTo(0.33325, 5);
    expect(halfToFloat(floatToHalf(6e-8))).toBeCloseTo(5.96e-8, 9); // subnormal
  });
});
