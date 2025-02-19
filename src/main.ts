import * as dgram from 'dgram';
import { Location, Test } from './serializables/location';
import { MessageEmitter, QSerializer } from './lib/q-serializer';
import { LocationTest } from '@generated/q-serializables';

const serializable = new QSerializer([Location, Test, LocationTest]);

export const AppMessageEmitter = new MessageEmitter();
// SERVER ----------------------------------------------------------------------------

const PORT = 33333; // Choose any available port
const server = dgram.createSocket('udp4');

server.on('message', (msg) => {
  const incomingMessage = serializable.deserialize(msg);
  if (incomingMessage) {
    AppMessageEmitter.emit(incomingMessage);
  }
});

server.on('listening', () => {
  const address = server.address();
  console.log(`UDP server listening on ${address.address}:${address.port}`);
});

server.bind(PORT);

// ----------------------------------------------------------------------------------
