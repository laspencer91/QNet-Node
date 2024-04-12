import { AppMessageEmitter } from '../main';
import { Location } from '../serializables/location';

AppMessageEmitter.on(Location, (data) => {
  console.log('Recieved Location!', data);
});