import { GMBufferSerial } from '.';
import { GameMakerBufferType } from '@types';

export class GMBuffer {
  private buffer: Buffer;
  private bufferTell = 0;

  private constructor(buffer?: Buffer, initialSize?: number) {
    if (!buffer) {
      if (!initialSize)
        throw new Error('Either a buffer or initial sized must be passed as an argument to create a GMBuffer');
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

  read<T extends GameMakerBufferType>(
    bufferType: T,
    // This does some magic to infer the return type of the function based on the input type
  ): T extends 'buffer_bool' ? boolean : T extends 'buffer_string' ? string : number {
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
}
