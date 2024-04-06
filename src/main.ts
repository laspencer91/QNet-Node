import { QSerializer } from './lib/q-serializer';

const serializer = new QSerializer([Location, Location]);





// const PORT = 33333; // Choose any available port
//
// // Create a UDP server
// const server = dgram.createSocket('udp4');
//
// // Event listener for when a message is received
// server.on('message', (msg, rinfo) => {
//   console.log(`Received message from ${rinfo.address}:${rinfo.port}: ${msg}`);
// });
//
// // Event listener for when the server is listening
// server.on('listening', () => {
//   const address = server.address();
//   console.log(`UDP server listening on ${address.address}:${address.port}`);
// });
//
// // Bind the server to the specified port and address
// server.bind(PORT);