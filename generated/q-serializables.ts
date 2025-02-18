import { QSerializable, BufferS8, BufferS16, BufferArray } from '@q-serializable-decorators';

@QSerializable
export class Location {
  @BufferS8
  positionX: number;

  @BufferS16
  positionY: number;
  constructor(positionX: number, positionY: number) {
    this.positionX = positionX;
    this.positionY = positionY;
  }
}
@QSerializable
export class LocationTest {
  @BufferS8
  positionX: number;

  @BufferS16
  positionY: number;

  @BufferArray('buffer_u8')
  positions: Array<number>;
  constructor(positionX: number, positionY: number, positions: Array<number>) {
    this.positionX = positionX;
    this.positionY = positionY;
    this.positions = positions;
  }
}