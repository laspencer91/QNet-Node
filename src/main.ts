import * as dgram from 'dgram';
import { GMBuffer } from './lib/gm-buffer';


const PORT = 33333; // Choose any available port

// Create a UDP server
const server = dgram.createSocket('udp4');

// Event listener for when a message is received
server.on('message', (msg, rinfo) => {
  console.log(`Received message from ${rinfo.address}:${rinfo.port}: ${msg}`);
  
  const gmBuffer = GMBuffer.from(msg);
  const s16 = gmBuffer.read('buffer_s16');
  const u16 = gmBuffer.read('buffer_u16');
  const s8 = gmBuffer.read('buffer_s8');
  const s32 = gmBuffer.read('buffer_s32');
  const u32 = gmBuffer.read('buffer_u32');
  const f64 = gmBuffer.read('buffer_f64');
  const f32 = gmBuffer.read('buffer_f32');
  const u64 = gmBuffer.read('buffer_u64');
  const str = gmBuffer.read('buffer_string');
  const bool1 = gmBuffer.read('buffer_bool');
  const bool2 = gmBuffer.read('buffer_bool');
  console.log(s16);
  console.log(u16);
  console.log(s8);
  console.log(s32);
  console.log(u32);
  console.log(f64);
  console.log(f32);
  console.log(BigInt(u64));
  console.log(str);
  console.log(bool1);
  console.log(bool2);
});

// Event listener for when the server is listening
server.on('listening', () => {
  const address = server.address();
  console.log(`UDP server listening on ${address.address}:${address.port}`);
});

// Bind the server to the specified port and address
server.bind(PORT);