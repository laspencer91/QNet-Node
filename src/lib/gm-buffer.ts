import { GameMakerBufferType } from './types/gm-buffers.types';
import { GMBufferSerial } from './gm-buffer-interface';

export class GMBuffer {
  private buffer: Buffer;
  private bufferTell = 0;
  
  private constructor(buffer?: Buffer, initialSize?: number) {
    if (!buffer) {
      if (!initialSize) throw new Error('Either a buffer or initial sized must be passed as an argument to create a GMBuffer');
      this.buffer = Buffer.alloc(initialSize);
    } else {
      this.buffer = buffer;
    }
  }

  write(data: any, bufferType: GameMakerBufferType) {
    const gmBufferUserProps = GMBufferSerial[bufferType];
    const sizeOfData = gmBufferUserProps.sizeOf(data);

    while (this.bufferTell + sizeOfData > this.buffer.length) {
      this.growBuffer();
    }
    
    this.bufferTell = gmBufferUserProps.writeFunction(this.buffer, data, this.bufferTell);
  }

  read(bufferType: GameMakerBufferType) {
    const gmBufferUserProps = GMBufferSerial[bufferType];
    const data = gmBufferUserProps.readFunction(this.buffer, this.bufferTell);
    this.bufferTell += gmBufferUserProps.sizeOf(data);
    return data;
  }

  seek(position: 'start' | 'end') {
    if (position === 'start') this.bufferTell = 0;
  }

  toBuffer() {
    return this.buffer.subarray(0, this.bufferTell);
  }

  static new(initialSize: number) {
    return new GMBuffer(undefined, initialSize);
  }

  static from(buffer: Buffer) {
    return new GMBuffer(buffer);
  }
  
  private growBuffer() {
    const newBuffer = Buffer.alloc(this.buffer.length * 2);
    this.buffer.copy(newBuffer, 0, 0, this.buffer.length);
    this.buffer = newBuffer;
  }

  // static writeData(buffer: Buffer, value: any, bufferType: GameMakerBufferType): Buffer {
  //   switch (bufferType) {
  //   case 'buffer_u8':
  //     buffer.writeUInt8(value, 0);
  //     break;
  //   case 'buffer_s8':
  //     buffer.writeInt8(value, 0);
  //     break;
  //   case 'buffer_u16':
  //     buffer.writeUInt16BE(value, 0);
  //     break;
  //   case 'buffer_s16':
  //     buffer.writeInt16BE(value, 0);
  //     break;
  //   case 'buffer_u32':
  //     buffer.writeUInt32BE(value, 0);
  //     break;
  //   case 'buffer_s32':
  //     buffer.writeInt32BE(value, 0);
  //     break;
  //   case 'buffer_u64':
  //     buffer.writeBigUInt64BE(value, 0);
  //     break;
  //   case 'buffer_f32':
  //     buffer.writeFloatBE(value, 0);
  //     break;
  //   case 'buffer_f64':
  //     buffer.writeDoubleBE(value, 0);
  //     break;
  //   case 'buffer_string':
  //     buffer.write(value, 0, 'utf8');
  //     break;
  //   default:
  //     throw new Error(`Unsupported buffer type: ${bufferType}`);
  //   }
  // }
}