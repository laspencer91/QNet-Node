import { AppMessageEmitter } from '../main';
import { Location } from '../serializables/location';

AppMessageEmitter.on(Location, (data) => {
  console.log('Received Location!', data);
});
