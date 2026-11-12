import { implementManual } from '../src';
import { TestManual } from './generated/demo-messages';

// TestManual uses MANUAL_SERIALIZATION in GameMaker; this mirrors its Write()/Read().
implementManual(TestManual, {
  write(buffer, message) {
    buffer.write(message.count, 'buffer_u16');
    buffer.write(message.label, 'buffer_string');
  },
  read(buffer, message) {
    message.count = buffer.read('buffer_u16');
    message.label = buffer.read('buffer_string');
  },
});
