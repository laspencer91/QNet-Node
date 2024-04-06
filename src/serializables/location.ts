import { BufferU16, BufferU8 } from '../lib/decorators/gm-serialializable-fields.deco';
import { QSerializable } from '../lib/decorators/q-serializable.deco';

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