import { GMBufferSerial } from './gm-buffer-type-serializers';

describe('GMBufferString', () => {
  const TEST_STRING = 'My Name Is Logan';
  const TEST_BYTE_ARRAY = [77, 121, 32, 78, 97, 109, 101, 32, 73, 115, 32, 76, 111, 103, 97, 110, 0];

  it('reads properly', () => {
    const testBuffer = Buffer.from(TEST_BYTE_ARRAY.concat(TEST_BYTE_ARRAY));
    const decodedValue = GMBufferSerial.buffer_string.readFunction(testBuffer, 0);
    expect(decodedValue).toEqual(TEST_STRING);
  });

  it('writes properly', () => {
    const testBuffer = Buffer.alloc(TEST_BYTE_ARRAY.length * 2, 0);
    let tell = 0;
    tell = GMBufferSerial.buffer_string.writeFunction(testBuffer, TEST_STRING, tell);
    tell = GMBufferSerial.buffer_string.writeFunction(testBuffer, TEST_STRING, tell);
    expect(Array.from(testBuffer)).toEqual(TEST_BYTE_ARRAY.concat(TEST_BYTE_ARRAY));
    expect(tell).toEqual(TEST_BYTE_ARRAY.length * 2);
  });
});

describe('GMBufferU8', () => {
  it('reads properly', () => {
    const testBuffer = Buffer.from([1, 2, 3, 128, 256]);
    let tell = 0;
    const firstValue = GMBufferSerial.buffer_u8.readFunction(testBuffer, tell++);
    const secondValue = GMBufferSerial.buffer_u8.readFunction(testBuffer, tell++);
    const thirdValue = GMBufferSerial.buffer_u8.readFunction(testBuffer, tell++);
    const fourthValue = GMBufferSerial.buffer_u8.readFunction(testBuffer, tell++);
    const fifth = GMBufferSerial.buffer_u8.readFunction(testBuffer, tell++);

    expect(firstValue).toEqual(1);
    expect(secondValue).toEqual(2);
    expect(thirdValue).toEqual(3);
    expect(fourthValue).toEqual(128);
    // Should only write up to 255, and so 0 should be the result when 256 was attempted to be written.
    expect(fifth).toEqual(0);

  });

  it('writes properly', () => {
    const testBuffer = Buffer.alloc(5);

    let tell = 0;
    tell = GMBufferSerial.buffer_u8.writeFunction(testBuffer, 1, tell);
    tell = GMBufferSerial.buffer_u8.writeFunction(testBuffer, 2, tell);
    tell = GMBufferSerial.buffer_u8.writeFunction(testBuffer, 3, tell);
    tell = GMBufferSerial.buffer_u8.writeFunction(testBuffer, 128, tell);
    GMBufferSerial.buffer_u8.writeFunction(testBuffer, 255, tell);

    expect(Array.from(testBuffer)).toEqual([1, 2, 3, 128, 255]);
  });
});

describe('GMBufferS8', () => {
  it('reads properly', () => {
    const testBuffer = Buffer.from([-1, -2, 0, 1, 127]);
    let tell = 0;
    const firstValue = GMBufferSerial.buffer_s8.readFunction(testBuffer, tell++);
    const secondValue = GMBufferSerial.buffer_s8.readFunction(testBuffer, tell++);
    const thirdValue = GMBufferSerial.buffer_s8.readFunction(testBuffer, tell++);
    const fourthValue = GMBufferSerial.buffer_s8.readFunction(testBuffer, tell++);
    const fifthValue = GMBufferSerial.buffer_s8.readFunction(testBuffer, tell++);

    expect(firstValue).toEqual(-1);
    expect(secondValue).toEqual(-2);
    expect(thirdValue).toEqual(0);
    expect(fourthValue).toEqual(1);
    expect(fifthValue).toEqual(127);
  });

  it('writes properly', () => {
    const testBuffer = Buffer.alloc(5);

    let tell = 0;
    tell = GMBufferSerial.buffer_s8.writeFunction(testBuffer, -1, tell);
    tell = GMBufferSerial.buffer_s8.writeFunction(testBuffer, -2, tell);
    tell = GMBufferSerial.buffer_s8.writeFunction(testBuffer, 0, tell);
    tell = GMBufferSerial.buffer_s8.writeFunction(testBuffer, 1, tell);
    GMBufferSerial.buffer_s8.writeFunction(testBuffer, 127, tell);

    expect(testBuffer.readInt8(0)).toEqual(-1);
    expect(testBuffer.readInt8(1)).toEqual(-2);
    expect(testBuffer.readInt8(2)).toEqual(0);
    expect(testBuffer.readInt8(3)).toEqual(1);
    expect(testBuffer.readInt8(4)).toEqual(127);
  });
});

describe('GMBufferU16', () => {
  it('reads properly', () => {
    const testBuffer = Buffer.from([0xFF, 0xFF, 0x00, 0x00, 0xAB, 0xCD]);
    const tell = 0;
    const firstValue = GMBufferSerial.buffer_u16.readFunction(testBuffer, tell);
    const secondValue = GMBufferSerial.buffer_u16.readFunction(testBuffer, tell + 2);
    const thirdValue = GMBufferSerial.buffer_u16.readFunction(testBuffer, tell + 4);

    expect(firstValue).toEqual(65535); // 0xFFFF
    expect(secondValue).toEqual(0);     // 0x0000
    expect(thirdValue).toEqual(0xCDAB); // 0xABCD
  });

  it('writes properly', () => {
    const testBuffer = Buffer.alloc(6);

    let tell = 0;
    tell = GMBufferSerial.buffer_u16.writeFunction(testBuffer, 65535, tell);
    tell = GMBufferSerial.buffer_u16.writeFunction(testBuffer, 0, tell);
    GMBufferSerial.buffer_u16.writeFunction(testBuffer, 0xCDAB, tell);

    expect(testBuffer.readUInt16LE(0)).toEqual(65535);
    expect(testBuffer.readUInt16LE(2)).toEqual(0);
    expect(testBuffer.readUInt16LE(4)).toEqual(0xCDAB);
  });
});

describe('GMBufferS16', () => {
  it('reads properly', () => {
    const testBuffer = Buffer.from('FFFF000095F7', 'hex');
    const tell = 0;
    const firstValue = GMBufferSerial.buffer_s16.readFunction(testBuffer, tell);
    const secondValue = GMBufferSerial.buffer_s16.readFunction(testBuffer, tell + 2);
    const thirdValue = GMBufferSerial.buffer_s16.readFunction(testBuffer, tell + 4);

    expect(firstValue).toEqual(-1);    // 0xFFFF
    expect(secondValue).toEqual(0);     // 0x0000
    expect(thirdValue).toEqual(-2155); // 0xABCD
  });

  it('writes properly', () => {
    const testBuffer = Buffer.alloc(6);

    let tell = 0;
    tell = GMBufferSerial.buffer_s16.writeFunction(testBuffer, -1, tell);
    tell = GMBufferSerial.buffer_s16.writeFunction(testBuffer, 0, tell);
    GMBufferSerial.buffer_s16.writeFunction(testBuffer, -12413, tell);

    expect(testBuffer.readInt16LE(0)).toEqual(-1);
    expect(testBuffer.readInt16LE(2)).toEqual(0);
    expect(testBuffer.readInt16LE(4)).toEqual(-12413);
  });
});