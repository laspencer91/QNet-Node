/**
 * A Node host for the QNet GameMaker demo. Start it, then run the GameMaker demo: its windows
 * fail to host on port 3000 (taken by this process) and join it instead.
 *
 *   npm run demo:host            (port 3000)
 *   npm run demo:host -- 4000    (another port)
 *
 * It does what the GameMaker host does: relays positions with the host's authority over ids,
 * relays chat, and checks that each client's reliable counters arrive in order.
 */
import { QNetChannel, QNetwork, reasonToString } from '../src';
import './demo-manual';
import { ChatMessage, CounterMessage, messages, PlayerState } from './generated/demo-messages';

const port = Number(process.argv[2] ?? 3000);
const network = new QNetwork({ messages, maxClients: 7 });
const expected = new Map<number, number>();
let orderErrors = 0;

network.onConnected = (connection) => {
  console.log(`client #${connection.id} joined from ${connection.ip}:${connection.port}`);
  connection.send(new ChatMessage(0, `welcome #${connection.id}, this host runs on Node`));
};

network.onDisconnected = (connection, reason) => {
  console.log(`client #${connection.id} left: ${reasonToString(reason)}`);
  expected.delete(connection.id);
};

network.on(PlayerState, (state, from) => {
  state.player_id = from.id; // never trust the id a client claims
  network.sendToAll(state, QNetChannel.Sequenced, from);
});

network.on(ChatMessage, (chat, from) => {
  console.log(`[chat] #${from.id}: ${chat.text}`);
  network.sendToAll(chat, QNetChannel.Reliable, from);
});

network.on(CounterMessage, (counter, from) => {
  const want = expected.get(from.id) ?? counter.value;
  if (counter.value !== want) {
    orderErrors++;
    console.log(`ORDER ERROR from #${from.id}: got ${counter.value}, expected ${want}`);
  }
  expected.set(from.id, counter.value + 1);
  if ((counter.value + 1) % 100 === 0)
    console.log(`#${from.id} reliable counters up to ${counter.value}, order errors: ${orderErrors}`);
});

void network.host(port).then((ok) => {
  if (!ok) process.exit(1);
  setInterval(() => console.log(String(network)), 10000).unref();
});

process.on('SIGINT', async () => {
  await network.shutdown();
  process.exit(0);
});
