/**
 * A Node client for the QNet GameMaker demo. Host in GameMaker (the first demo window hosts on
 * port 3000), then run this: a square circles around in the GameMaker window.
 *
 *   npm run demo:client                      (127.0.0.1:3000)
 *   npm run demo:client -- 192.168.1.20 3000
 *
 * Every 5 seconds it also sends 100 reliable counters and a chat line.
 */
import { QNetChannel, QNetwork, reasonToString } from '../src';
import './demo-manual';
import { ChatMessage, CounterMessage, messages, PlayerState } from './generated/demo-messages';

const ip = process.argv[2] ?? '127.0.0.1';
const port = Number(process.argv[3] ?? 3000);
const network = new QNetwork({ messages });
let counter = 0;
let timers: NodeJS.Timeout[] = [];

network.onConnected = () => {
  console.log(`joined as #${network.localId}`);
  const start = Date.now();
  timers = [
    setInterval(() => {
      const t = (Date.now() - start) / 1000;
      const state = new PlayerState(
        network.localId,
        Math.round(600 + Math.cos(t) * 200),
        Math.round(380 + Math.sin(t) * 200),
      );
      network.sendToAll(state, QNetChannel.Sequenced);
    }, 16),
    setInterval(() => {
      for (let i = 0; i < 100; i++) network.sendToAll(new CounterMessage(counter++));
      network.sendToAll(new ChatMessage(network.localId, `hello from Node, counters up to ${counter - 1}`));
    }, 5000),
  ];
};

network.onDisconnected = (_connection, reason) => {
  console.log(`disconnected: ${reasonToString(reason)}`);
  timers.forEach(clearInterval);
  process.exit(0);
};

network.onConnectFailed = (reason) => {
  console.log(`could not join ${ip}:${port}: ${reasonToString(reason)}`);
  process.exit(1);
};

network.on(ChatMessage, (chat) => console.log(`[chat] #${chat.from}: ${chat.text}`));
network.on(PlayerState, () => {}); // other players' positions; a real client would draw them
network.on(CounterMessage, () => {});

void network.join(ip, port);

process.on('SIGINT', async () => {
  await network.shutdown();
  process.exit(0);
});
