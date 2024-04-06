import 'reflect-metadata';
import { GameMakerBufferType } from './types/gm-buffers.types';

export class GmBufferInterface {
  static readData(msg: Buffer, offset: number, bufferType: GameMakerBufferType): any {
    switch (bufferType) {
    case 'buffer_u8':
      return msg.readUInt8(offset);
    case 'buffer_s8':
      return msg.readInt8(offset);
    case 'buffer_u16':
      return msg.readUInt16BE(offset);
    case 'buffer_s16':
      return msg.readInt16BE(offset);
    case 'buffer_u32':
      return msg.readUInt32BE(offset);
    case 'buffer_s32':
      return msg.readInt32BE(offset);
    case 'buffer_u64':
      return msg.readBigUInt64BE(offset);
    case 'buffer_f32':
      return msg.readFloatBE(offset);
    case 'buffer_f64':
      return msg.readDoubleBE(offset);
    case 'buffer_string':
      return msg.toString('utf8', offset);
    default:
      throw new Error(`Unsupported buffer type: ${bufferType}`);
    }
  }

  static writeData(value: any, bufferType: GameMakerBufferType): Buffer {
    const buffer = Buffer.allocUnsafe(GmBufferInterface.sizeOf(bufferType));
    switch (bufferType) {
    case 'buffer_u8':
      buffer.writeUInt8(value, 0);
      break;
    case 'buffer_s8':
      buffer.writeInt8(value, 0);
      break;
    case 'buffer_u16':
      buffer.writeUInt16BE(value, 0);
      break;
    case 'buffer_s16':
      buffer.writeInt16BE(value, 0);
      break;
    case 'buffer_u32':
      buffer.writeUInt32BE(value, 0);
      break;
    case 'buffer_s32':
      buffer.writeInt32BE(value, 0);
      break;
    case 'buffer_u64':
      buffer.writeBigUInt64BE(value, 0);
      break;
    case 'buffer_f32':
      buffer.writeFloatBE(value, 0);
      break;
    case 'buffer_f64':
      buffer.writeDoubleBE(value, 0);
      break;
    case 'buffer_string':
      buffer.write(value, 0, 'utf8');
      break;
    default:
      throw new Error(`Unsupported buffer type: ${bufferType}`);
    }
    return buffer;
  }

  // Get size of data based on the GameMaker buffer type
  static sizeOf(bufferType: GameMakerBufferType): number {
    switch (bufferType) {
    case 'buffer_u8':
    case 'buffer_s8':
      return 1;
    case 'buffer_u16':
    case 'buffer_s16':
      return 2;
    case 'buffer_u32':
    case 'buffer_s32':
    case 'buffer_f32':
      return 4;
    case 'buffer_u64':
    case 'buffer_f64':
      return 8;
      // Assuming string length is 1 byte per character
    case 'buffer_string':
      return 1;
    default:
      throw new Error(`Unsupported buffer type: ${bufferType}`);
    }
  }
}


export class _QSerializableContainer {
  private static _instance: _QSerializableContainer;

  public readonly bufferTypesMap = new Map();

  static get instance() {
    if (!this._instance) {
      this._instance = new _QSerializableContainer();
    }
    return this._instance;
  }
}