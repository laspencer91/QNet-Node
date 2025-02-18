# QNet Node Library

_STATUS:_ In Progress


A Node.js library for interfacing with GameMaker's QNet networking system. This library enables seamless communication between GameMaker Studio 2 games and Node.js servers by providing matching serialization/deserialization capabilities.

## Features

- ✅ Complete buffer compatibility with GameMaker Studio 2
- ✅ Type-safe serialization using decorators
- ✅ Support for nested objects and arrays
- ✅ Automatic TypeScript class generation from GameMaker projects
- ✅ Built-in connection management
- ✅ Robust message handling system

## Installation

```bash
npm install qnet-node
# or
yarn add qnet-node
```

## Quick Start

1. First, define your message types:

```typescript
import { QSerializable, BufferU8, BufferString } from 'qnet-node';

@QSerializable
export class ChatMessage {
    @BufferString
    message: string;

    @BufferU8
    roomId: number;

    constructor(message: string, roomId: number) {
        this.message = message;
        this.roomId = roomId;
    }
}
```

2. Create a QNet server:

```typescript
import { QNetworkManager } from 'qnet-node';

const manager = new QNetworkManager(10, [ChatMessage]); // Max 10 connections
await manager.start(3000); // Start listening on port 3000
```

3. Handle messages:

```typescript
manager.onMessage(ChatMessage, (message, connection) => {
    console.log(`Got message from room ${message.roomId}: ${message.message}`);
});
```

## Type Generation

QNet can automatically generate TypeScript classes from your GameMaker project:

```bash
npx qnet-generate /path/to/gamemaker/project
```

This will:
1. Scan your GameMaker project for QNet serializable structs
2. Generate matching TypeScript classes with proper decorators
3. Create type definitions for your message types

## Buffer Types

QNet supports all GameMaker buffer types:

- `@BufferU8` - 8-bit unsigned integer
- `@BufferS8` - 8-bit signed integer
- `@BufferU16` - 16-bit unsigned integer
- `@BufferS16` - 16-bit signed integer
- `@BufferU32` - 32-bit unsigned integer
- `@BufferS32` - 32-bit signed integer
- `@BufferF32` - 32-bit float
- `@BufferF64` - 64-bit float
- `@BufferString` - Null-terminated string
- `@BufferBool` - Boolean

## Examples

### Handling Nested Objects

```typescript
@QSerializable
class Position {
    @BufferU16
    x: number;
    
    @BufferU16
    y: number;
}

@QSerializable
class Player {
    @BufferString
    name: string;
    
    @BufferObject(Position)
    position: Position;
}
```

### Array Support

```typescript
@QSerializable
class Inventory {
    @BufferArray(Item)
    items: Item[];
    
    @BufferArray('buffer_u8')
    quantities: number[];
}
```

### Manual Serialization

```typescript
@QSerializable
class CustomMessage {
    MANUAL_SERIALIZATION;
    
    Write(buffer: Buffer) {
        // Custom write logic
    }
    
    Read(buffer: Buffer) {
        // Custom read logic
    }
}
```

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Support

If you have any questions or issues:
1. Open an issue
2. Contact `laspencer@live.com`

---
