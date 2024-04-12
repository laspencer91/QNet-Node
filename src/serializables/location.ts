import { BufferU16, BufferU8, QSerializable } from '../lib/q-serializer/decorators';


@QSerializable
export class Location {
  @BufferU8 
    locationX: number;
  
  @BufferU16 
    locationY: number;

  constructor(locationX: number, locationY: number) {
    this.locationX = locationX;
    this.locationY = locationY;
  }
}