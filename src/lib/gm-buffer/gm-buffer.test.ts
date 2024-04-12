import { GMBuffer } from './gm-buffer';

describe('GMBuffer', () => {
  it('writes U8Int as expected', () => {
    const buffer = GMBuffer.new(2);
    buffer.write(3, 'buffer_u8');
    buffer.write(2, 'buffer_u8');
    buffer.write(1, 'buffer_u8');
    const finalBuffer = buffer.toBuffer();
    expect(finalBuffer.length).toEqual(3);
    expect(finalBuffer.readUInt8(0)).toEqual(3);
    expect(finalBuffer.readUInt8(1)).toEqual(2);
    expect(finalBuffer.readUInt8(2)).toEqual(1);
  });

  it('reads U8Int as expected', () => {
    const buffer = GMBuffer.from(Buffer.from([1, 2, 3]));
    expect(buffer.read('buffer_u8')).toEqual(1);
    expect(buffer.read('buffer_u8')).toEqual(2);
    expect(buffer.read('buffer_u8')).toEqual(3);
  });

  it('writes String as expected', () => {
    const string1 = 'This Is QSerializer...';
    const string2 = 'And It Is Awesome!';

    const buffer = GMBuffer.new(2);
    buffer.write(string1, 'buffer_string');
    buffer.write(string2, 'buffer_string');
    const finalBuffer = buffer.toBuffer();

    expect(finalBuffer.length).toEqual(string1.length + string2.length + 2);
  });

  it('reads String as expected', () => {
    const string1 = 'This Is QSerializer...';
    const string2 = 'And It Is Awesome!';

    // Add a null terminator to each string, mimicking a string from gamemaker.
    const buffArr1 = Buffer.from(string1 + '\0');
    const buffArr2 = Buffer.from(string2 + '\0');
    // Concat the arrays so we can test multiple string readings from a single buffer,
    // to ensure the null terminator is recognized.
    const buffer = GMBuffer.from(Buffer.concat([buffArr1, buffArr2]));

    const resultString1 = buffer.read('buffer_string');
    const resultString2 = buffer.read('buffer_string');

    expect(resultString1).toEqual(string1);
    expect(resultString2).toEqual(string2);
  });
});