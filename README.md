# QNet - Node

The Node.js side of [QNet](https://github.com/laspencer91/QNet). It speaks the same UDP protocol as QNet for GameMaker, so you can:

- run a **dedicated server in Node** that GameMaker games join, or
- join a **GameMaker host** from Node (bots, load tests, tools).

Reliable (exactly once, in order), sequenced and unreliable channels, packet acknowledgements, resends, a challenge handshake and a bad-network simulator all behave exactly as in GameMaker. The wire format is specified in [QNet's PROTOCOL.md](https://github.com/laspencer91/QNet/blob/main/docs/PROTOCOL.md).

## Quick start

GameMaker is the source of truth for your messages. Generate matching TypeScript classes from the project:

```bash
npx qnet-generate path/to/MyGame src/messages.ts
```

That reads `new QNetwork({ messages: [...] })` and each message constructor, and writes classes like:

```ts
@QSerializable
export class PlayerState {
  @Field(buffer_u8) player_id: number;
  @Field(buffer_s16) px: number;
  @Field(buffer_s16) py: number;
  constructor(player_id = 0, px = 0, py = 0) { ... }  // same parameters as the GML constructor
}

export const messages = [PlayerState, CounterMessage, ChatMessage, ...];  // same order as GameMaker
```

Then host:

```ts
import { QNetwork, QNetChannel } from 'qnet-node';
import { messages, PlayerState, ChatMessage } from './messages';

const network = new QNetwork({ messages, maxClients: 16 });

network.onConnected = (connection) => connection.send(new ChatMessage(0, 'welcome'));
network.onDisconnected = (connection, reason) => console.log(`#${connection.id} left`);

network.on(PlayerState, (state, from) => {
  state.player_id = from.id;                                   // the host decides who is who
  network.sendToAll(state, QNetChannel.Sequenced, from);       // relay to everyone else
});

await network.host(3000);
```

Or join a GameMaker host with `await network.join('192.168.1.20', 3000)`; the result arrives through `onConnected` or `onConnectFailed`.

## API

The API mirrors the GameMaker library, in camelCase.

| GameMaker | Node |
| --- | --- |
| `new QNetwork({ messages, max_clients })` | `new QNetwork({ messages, maxClients })` |
| `network.Host(port)` / `Join(ip, port)` | `await network.host(port)` / `await network.join(ip, port)` |
| `network.Shutdown()` | `await network.shutdown()` |
| `network.On(Type, fn)` | `network.on(Type, (message, from) => ...)` |
| `connection.Send(msg, QNET_CHANNEL.RELIABLE)` | `connection.send(msg, QNetChannel.Reliable)` |
| `network.SendToAll(msg, channel, except)` | `network.sendToAll(msg, channel, except)` |
| `OnConnected` / `OnDisconnected` / `OnConnectFailed` | `onConnected` / `onDisconnected` / `onConnectFailed` |
| `network.Simulate(latency, jitter, loss)` | `network.simulate(latency, jitter, loss)` |
| `connection.rtt`, `packet_loss`, `stats` | `connection.rtt`, `packetLoss`, `stats` |

Options: `messages`, `maxClients` (8), `timeout` (5 s), `connectTimeout` (5 s), `heartbeat` (0.5 s), `tickRate` (60), `log`.

The same guarantees hold: every successful `join()` ends in exactly one `onConnected` or `onConnectFailed`, and every `onConnected` is followed by exactly one `onDisconnected`, including on `shutdown()`.

### Writing message classes by hand

```ts
@QSerializable
class Spawn {
  @Field(buffer_string) kind = '';
  @Field(Vec2) position = new Vec2();     // nested registered struct
  @Field([buffer_u8]) tags: number[] = []; // arrays, and arrays of arrays: [[buffer_u8]]
}
```

- Property names are the wire names and must match the GameMaker struct variables. Fields are sent in alphabetical order, as in GameMaker.
- The class name must match the GameMaker constructor, or set it: `@QSerializable({ name: 'Spawn' })`.
- `lazy(() => TreeNode)` for a struct that contains itself.
- The shorthand decorators from 1.x still work: `@BufferU8`, `@BufferString`, `@BufferArray(Vec2)`, ...

### MANUAL_SERIALIZATION messages

Give the class `write(buffer)` / `read(buffer)` methods with `@QSerializable({ manual: true })`, or, for generated classes, supply the codec once without touching the generated file:

```ts
implementManual(Snapshot, {
  write(buffer, message) { buffer.write(message.tick, 'buffer_u32'); },
  read(buffer, message) { message.tick = buffer.read('buffer_u32'); },
});
```

`GMBuffer` reads and writes every GameMaker buffer type with GameMaker's layout (little-endian, null-terminated strings, IEEE half floats for `buffer_f16`, `bigint` for `buffer_u64`).

## Try it with the GameMaker demo

```bash
npm install
npm run demo:host      # Node hosts on 3000; GameMaker demo windows join it
npm run demo:client    # or: GameMaker hosts, Node joins and circles a square around
```

## Development

```bash
npm test          # buffer, serializer (byte-exact vectors), codegen, and real UDP tests under 20% loss
npm run typecheck
npm run build     # dist/
npm run generate -- <gm-project> <out.ts> [--list-from <file>] [--import <module>]
```

`examples/generated/demo-messages.ts` is generated from the QNet GameMaker demo; a test keeps it in sync with `tests/fixtures/gml-project`.
