interface BufferTypeMapping {
  buffer_u8: 'UInt8';
  buffer_s8: 'Int8';
  buffer_u16: 'UInt16BE'; // Big-endian
  buffer_s16: 'Int16BE'; // Big-endian
  buffer_u32: 'UInt32BE'; // Big-endian
  buffer_s32: 'Int32BE'; // Big-endian
  buffer_u64: 'BigUInt64BE'; // Big-endian
  buffer_f16: 'FloatBE'; // Big-endian
  buffer_f32: 'FloatBE'; // Big-endian
  buffer_f64: 'DoubleBE'; // Big-endian
  buffer_bool: 'UInt8';
  buffer_string: 'String';
  buffer_text: 'String';
}

type GameMakerBufferType = keyof BufferTypeMapping;

export class GamemakerBufferInterface {
  static readData(msg: Buffer, offset: number, bufferType: BufferTypeMapping[GameMakerBufferType]): any {
    switch (bufferType) {
      case 'UInt8':
        return msg.readUInt8(offset);
      case 'Int8':
        return msg.readInt8(offset);
      case 'UInt16BE':
        return msg.readUInt16BE(offset);
      case 'Int16BE':
        return msg.readInt16BE(offset);
      case 'UInt32BE':
        return msg.readUInt32BE(offset);
      case 'Int32BE':
        return msg.readInt32BE(offset);
      case 'BigUInt64BE':
        return msg.readBigUInt64BE(offset);
      case 'FloatBE':
        return msg.readFloatBE(offset);
      case 'DoubleBE':
        return msg.readDoubleBE(offset);
      case 'String':
        return msg.toString('utf8', offset);
      default:
        throw new Error(`Unsupported buffer type: ${bufferType}`);
    }
  }

  static writeData(value: any, bufferType: BufferTypeMapping[GameMakerBufferType]): Buffer {
    const buffer = Buffer.allocUnsafe(GamemakerBufferInterface.sizeOf(bufferType));
    switch (bufferType) {
      case 'UInt8':
        buffer.writeUInt8(value, 0);
        break;
      case 'Int8':
        buffer.writeInt8(value, 0);
        break;
      case 'UInt16BE':
        buffer.writeUInt16BE(value, 0);
        break;
      case 'Int16BE':
        buffer.writeInt16BE(value, 0);
        break;
      case 'UInt32BE':
        buffer.writeUInt32BE(value, 0);
        break;
      case 'Int32BE':
        buffer.writeInt32BE(value, 0);
        break;
      case 'BigUInt64BE':
        buffer.writeBigUInt64BE(value, 0);
        break;
      case 'FloatBE':
        buffer.writeFloatBE(value, 0);
        break;
      case 'DoubleBE':
        buffer.writeDoubleBE(value, 0);
        break;
      case 'String':
        buffer.write(value, 0, 'utf8');
        break;
      default:
        throw new Error(`Unsupported buffer type: ${bufferType}`);
    }
    return buffer;
  }

  // Get size of data based on the GameMaker buffer type
  static sizeOf(bufferType: BufferTypeMapping[GameMakerBufferType]): number {
    switch (bufferType) {
      case 'UInt8':
      case 'Int8':
        return 1;
      case 'UInt16BE':
      case 'Int16BE':
        return 2;
      case 'UInt32BE':
      case 'Int32BE':
      case 'FloatBE':
        return 4;
      case 'BigUInt64BE':
      case 'DoubleBE':
        return 8;
      // Assuming string length is 1 byte per character
      case 'String':
        return 1;
      default:
        throw new Error(`Unsupported buffer type: ${bufferType}`);
    }
  }
}

// Example usage:
const msg: Buffer = Buffer.from([0x12, 0x34, 0x56, 0x78]); // Example message
const offset = 0; // Example offset

const bufferType: BufferTypeMapping[GameMakerBufferType] = 'UInt16BE'; // Example buffer type

const data = GamemakerBufferInterface.readData(msg, offset, bufferType);
console.log('Read data:', data);