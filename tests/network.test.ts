import { QNetChannel, QNetConnection, QNetReason, QNetwork, QNetworkOptions } from '../src';
import '../examples/demo-manual';
import { CounterMessage, messages, PlayerState } from '../examples/generated/demo-messages';

// Real UDP sockets on localhost; the simulator supplies loss, latency and reordering.
jest.setTimeout(60000);

const quiet = { log: () => {} };
const networks: QNetwork[] = [];
const make = (options: Partial<QNetworkOptions> = {}) => {
  const network = new QNetwork({ messages, ...quiet, ...options });
  networks.push(network);
  return network;
};
const until = async (condition: () => boolean, timeoutMs: number, what: string) => {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > timeoutMs) throw new Error(`timed out waiting for ${what}`);
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
};
let nextPort = 37000 + Math.floor(Math.random() * 2000);
const hostOn = async (network: QNetwork) => {
  while (!(await network.host(nextPort++)));
  return network.port;
};

afterEach(async () => {
  await Promise.all(networks.splice(0).map((network) => network.shutdown()));
});

// Let the OS finish releasing the closed sockets before Jest checks for open handles.
afterAll(() => new Promise((resolve) => setTimeout(resolve, 100)));

test('under 20% loss and reordering: reliable arrives once and in order, sequenced never goes back', async () => {
  const count = 500;
  const host = make({ maxClients: 1, timeout: 5 });
  const client = make({ timeout: 5 });
  const port = await hostOn(host);
  host.simulate(60, 30, 0.2);
  client.simulate(60, 30, 0.2);

  const received = { host: [] as number[], client: [] as number[] };
  let sequencedLast = -1;
  let sequencedBackwards = 0;
  let clientConnection: QNetConnection | undefined;

  host.onConnected = (connection) => {
    for (let i = 0; i < count; i++) connection.send(new CounterMessage(i));
  };
  client.onConnected = (connection) => {
    clientConnection = connection;
    for (let i = 0; i < count; i++) connection.send(new CounterMessage(i));
  };
  host.on(CounterMessage, (message) => received.host.push(message.value));
  client.on(CounterMessage, (message) => received.client.push(message.value));
  host.on(PlayerState, (message) => {
    if (message.px <= sequencedLast) sequencedBackwards++;
    sequencedLast = message.px;
  });

  await client.join('127.0.0.1', port);
  let px = 0;
  const stream = setInterval(() => {
    if (client.connectionCount > 0) client.sendToAll(new PlayerState(0, px++, 0), QNetChannel.Sequenced);
  }, 16);

  try {
    await until(() => received.host.length >= count && received.client.length >= count, 40000, 'all reliable messages');
  } finally {
    clearInterval(stream);
  }

  const expected = Array.from({ length: count }, (_, i) => i);
  expect(received.host).toEqual(expected);
  expect(received.client).toEqual(expected);
  expect(sequencedBackwards).toBe(0);
  expect(clientConnection!.stats.resends).toBeGreaterThan(0); // proves the loss path ran
  expect(client.localId).toBe(1);
});

test('a full host denies with ServerFull', async () => {
  const host = make({ maxClients: 1 });
  const port = await hostOn(host);
  const first = make();
  let connected = false;
  first.onConnected = () => (connected = true);
  await first.join('127.0.0.1', port);
  await until(() => connected, 3000, 'first client');

  const second = make();
  let reason: QNetReason | undefined;
  second.onConnectFailed = (r) => (reason = r);
  await second.join('127.0.0.1', port);
  await until(() => reason !== undefined, 3000, 'denial');
  expect(reason).toBe(QNetReason.ServerFull);
  expect(second.isOnline).toBe(false);
});

test('a different message list is denied with SchemaMismatch', async () => {
  const host = make();
  const port = await hostOn(host);
  const client = make({ messages: [CounterMessage] });
  let reason: QNetReason | undefined;
  client.onConnectFailed = (r) => (reason = r);
  await client.join('127.0.0.1', port);
  await until(() => reason !== undefined, 3000, 'denial');
  expect(reason).toBe(QNetReason.SchemaMismatch);
});

test('joining nothing fails with ConnectTimeout', async () => {
  const client = make({ connectTimeout: 0.5 });
  let reason: QNetReason | undefined;
  client.onConnectFailed = (r) => (reason = r);
  await client.join('127.0.0.1', nextPort++);
  await until(() => reason !== undefined, 3000, 'timeout');
  expect(reason).toBe(QNetReason.ConnectTimeout);
});

test('shutdown fires Local here and Remote on the host; a silent peer times out', async () => {
  const host = make({ timeout: 1 });
  const port = await hostOn(host);
  const hostReasons: QNetReason[] = [];
  host.onDisconnected = (_c, reason) => hostReasons.push(reason);

  const leaver = make();
  let leaverReason: QNetReason | undefined;
  let connected = false;
  leaver.onConnected = () => (connected = true);
  leaver.onDisconnected = (_c, reason) => (leaverReason = reason);
  await leaver.join('127.0.0.1', port);
  await until(() => connected, 3000, 'leaver');
  leaver.shutdown();
  expect(leaverReason).toBe(QNetReason.Local);
  await until(() => hostReasons.length === 1, 3000, 'host to see the leave');
  expect(hostReasons[0]).toBe(QNetReason.Remote);

  const silent = make();
  connected = false;
  silent.onConnected = () => {
    connected = true;
    silent.simulate(0, 0, 1); // drop everything from now on
  };
  await silent.join('127.0.0.1', port);
  await until(() => connected, 3000, 'silent client');
  await until(() => hostReasons.length === 2, 4000, 'timeout');
  expect(hostReasons[1]).toBe(QNetReason.Timeout);
});

test('every join ends in exactly one callback, and callbacks may rejoin', async () => {
  const host = make();
  const port = await hostOn(host);
  const client = make();
  const events: string[] = [];
  client.onConnected = () => events.push('connected');
  client.onDisconnected = (_c, reason) => {
    events.push(`disconnected:${reason}`);
    if (events.length === 2) void client.join('127.0.0.1', port); // rejoin from inside the callback
  };
  await client.join('127.0.0.1', port);
  await until(() => events.length === 1, 3000, 'first connect');
  client.shutdown();
  await until(() => events.length === 3, 3000, 'rejoin');
  expect(events).toEqual(['connected', `disconnected:${QNetReason.Local}`, 'connected']);
});
