import { randomInt } from 'crypto';
import * as dgram from 'dgram';
import { performance } from 'perf_hooks';
import { GMBuffer } from '../buffer/gm-buffer';
import { AnyClass, MessageClass } from '../serializer/metadata';
import { QSerializer } from '../serializer/q-serializer';
import {
  MAX_PACKET_SIZE,
  MAX_PENDING,
  PacketType,
  PROTOCOL_ID,
  QNetChannel,
  QNetReason,
  QNetRole,
  QNetState,
  reasonToString,
} from './constants';
import { checkChannel, QNetConnection } from './q-connection';

export interface QNetworkOptions {
  /** Message classes. Every peer (GameMaker or Node) must use the same list in the same order. */
  messages: readonly MessageClass[];
  /** Host only. Clients allowed at once. Default 8. */
  maxClients?: number;
  /** Seconds of silence before a connection is dropped. Default 5. */
  timeout?: number;
  /** Seconds join() keeps trying. Default 5. */
  connectTimeout?: number;
  /** Seconds between keep-alives when idle. Default 0.5. */
  heartbeat?: number;
  /** Updates per second (flushes, timeouts, resends). Default 60, like a GameMaker game. */
  tickRate?: number;
  /** Where log lines go. Default console.log; pass () => {} to silence. */
  log?: (message: string) => void;
}

type Handler<T> = (message: T, from: QNetConnection) => void;

interface Pending {
  clientSalt: number;
  serverSalt: number;
  time: number;
}

/**
 * UDP networking, wire-compatible with QNet for GameMaker. A Node host can serve GameMaker
 * clients, and a Node client can join a GameMaker host.
 *
 * @example
 * const network = new QNetwork({ messages: [PlayerMove, ChatMessage] });
 * network.onConnected = (connection) => connection.send(new ChatMessage('welcome'));
 * network.on(ChatMessage, (message, from) => console.log(from.id, message.text));
 * await network.host(3000);
 */
export class QNetwork {
  role = QNetRole.Offline;
  /** Our id: 0 when hosting, assigned by the host after joining, -1 otherwise. */
  localId = -1;
  /** Local UDP port, or -1. */
  port = -1;

  /** A peer is connected. On a host: a client joined. On a client: the host accepted us. */
  onConnected: (connection: QNetConnection) => void = (connection) => this.log(`Connected: ${connection}`);
  /** A connected peer is gone. */
  onDisconnected: (connection: QNetConnection, reason: QNetReason) => void = (connection, reason) =>
    this.log(`Disconnected: #${connection.id} (${reasonToString(reason)})`);
  /** Client only: join() did not succeed. */
  onConnectFailed: (reason: QNetReason) => void = (reason) => this.log(`Join failed: ${reasonToString(reason)}`);

  readonly serializer: QSerializer;

  private readonly maxClients: number;
  private readonly timeoutMs: number;
  private readonly connectTimeoutMs: number;
  private readonly heartbeatMs: number;
  private readonly tickMs: number;
  private readonly log: (message: string) => void;

  private socket: SocketHandle | undefined;
  /** Resolves when the most recently used socket has fully closed. */
  private lastClose: Promise<void> = Promise.resolve();
  private timer: NodeJS.Timeout | undefined;
  private connections: (QNetConnection | undefined)[] = [];
  private addressLookup = new Map<string, QNetConnection>();
  private pending = new Map<string, Pending>();
  private lastPendingSweep = 0;
  private readonly handlers = new Map<AnyClass, Handler<any>>();
  private readonly warned = new Set<string>();

  private simLatency = 0;
  private simJitter = 0;
  private simLoss = 0;
  private simQueue: { time: number; ip: string; port: number; data: Buffer }[] = [];

  constructor(options: QNetworkOptions) {
    if (!options || !Array.isArray(options.messages)) {
      throw new TypeError('QNetwork needs { messages: [...] }, the same list the GameMaker game registers');
    }
    this.serializer = new QSerializer(options.messages);
    this.maxClients = Math.max(1, Math.floor(options.maxClients ?? 8));
    this.timeoutMs = (options.timeout ?? 5) * 1000;
    this.connectTimeoutMs = (options.connectTimeout ?? 5) * 1000;
    this.heartbeatMs = (options.heartbeat ?? 0.5) * 1000;
    this.tickMs = 1000 / (options.tickRate ?? 60);
    this.log = options.log ?? ((message) => console.log(`[QNET] ${message}`));
  }

  get isHost() {
    return this.role === QNetRole.Host;
  }
  get isClient() {
    return this.role === QNetRole.Client;
  }
  get isOnline() {
    return this.role !== QNetRole.Offline;
  }

  // ---- Starting and stopping ------------------------------------------------------

  /** Start hosting on `port`. Resolves false if already online or the port is taken. */
  async host(port: number, address = '0.0.0.0'): Promise<boolean> {
    if (this.role !== QNetRole.Offline) {
      this.log('host() ignored: already online. Call shutdown() first.');
      return false;
    }
    const socket = await this.openSocket(port, address);
    if (!socket) {
      this.log(`host() could not open UDP port ${port}.`);
      return false;
    }
    this.socket = socket;
    this.port = port;
    this.role = QNetRole.Host;
    this.localId = 0;
    this.connections = new Array(this.maxClients + 1).fill(undefined); // slot 0 is the host itself
    this.startTicking();
    this.log(`Hosting on port ${port} for up to ${this.maxClients} clients.`);
    return true;
  }

  /**
   * Join a host. The result arrives later through onConnected or onConnectFailed.
   * Resolves false if already online or no local port could be opened (no callback fires).
   */
  async join(ip: string, port: number, localPort = 0): Promise<boolean> {
    if (this.role !== QNetRole.Offline) {
      this.log('join() ignored: already online. Call shutdown() first.');
      return false;
    }
    const socket = await this.openSocket(localPort, '0.0.0.0');
    if (!socket) {
      this.log('join() could not open a local UDP port.');
      return false;
    }
    if (ip === 'localhost') ip = '127.0.0.1';
    this.socket = socket;
    this.port = socket.port;
    this.role = QNetRole.Client;
    this.localId = -1;
    const connection = new QNetConnection(this, 0, ip, port);
    this.connections = [connection];
    connection.beginConnect(performance.now(), randomU32());
    this.startTicking();
    this.log(`Joining ${ip}:${port} from local port ${this.port}.`);
    return true;
  }

  /**
   * Disconnect everyone and close the socket. Callbacks fire for every open connection, after
   * the network is already offline, so host() or join() can be called again from inside them.
   * The returned promise resolves once the socket is fully closed; awaiting it is optional.
   */
  shutdown(): Promise<void> {
    if (this.role === QNetRole.Offline) return this.lastClose;
    const wasClient = this.role === QNetRole.Client;
    const closed: { connection: QNetConnection; wasConnected: boolean }[] = [];
    for (const connection of this.connections) {
      if (!connection) continue;
      const wasConnected = connection.state === QNetState.Connected;
      if (wasConnected) this.sendDisconnect(connection);
      connection.destroy();
      closed.push({ connection, wasConnected });
    }
    const socketClosed = this.closeSocket();
    this.log('Network shut down.');
    for (const { connection, wasConnected } of closed) {
      this.fireClosed(connection, wasConnected, wasClient, QNetReason.Local);
    }
    return socketClosed;
  }

  // ---- Messages ---------------------------------------------------------------------

  /**
   * Handle every received message of one type. Replaces an earlier handler for that type and
   * takes priority over an `onReceive(from)` method on the message class.
   */
  on<T extends object>(type: MessageClass<T>, handler: Handler<T>): this {
    if (!this.serializer.isRegistered(type)) {
      throw new TypeError(`on(${type.name}): not in this network's messages list`);
    }
    this.handlers.set(type, handler);
    return this;
  }

  off(type: MessageClass): this {
    this.handlers.delete(type);
    return this;
  }

  /**
   * Send to every connected peer (on a client, that is the host).
   * @param except skip this connection, e.g. when relaying what it sent.
   * @returns how many peers it was queued for.
   */
  sendToAll(message: object, channel: QNetChannel = QNetChannel.Reliable, except?: QNetConnection): number {
    checkChannel(channel);
    if (this.role === QNetRole.Offline) return 0;
    const body = this.encodeMessage(message);
    let count = 0;
    for (const connection of this.connections) {
      if (!connection || connection === except || connection.state !== QNetState.Connected) continue;
      connection.enqueue(body, channel); // bodies are never mutated, so sharing is safe
      count++;
    }
    return count;
  }

  /** Send everything queued now instead of on the next tick. */
  flush(): void {
    if (this.role === QNetRole.Offline) return;
    const now = performance.now();
    for (const connection of this.connections) connection?.flush(now, this.heartbeatMs);
  }

  // ---- Queries ----------------------------------------------------------------------

  /** The connection to the peer with this id. On a client, the host is id 0. */
  getConnection(id: number): QNetConnection | undefined {
    return this.connections[id];
  }

  /** Every connected peer. */
  getConnections(): QNetConnection[] {
    return this.connections.filter((c): c is QNetConnection => c !== undefined && c.state === QNetState.Connected);
  }

  get connectionCount(): number {
    return this.getConnections().length;
  }

  /**
   * Simulate a bad network on packets this peer sends: added latency, +/- jitter (which reorders
   * packets), and a loss chance 0..1. Call with no arguments to turn it off.
   */
  simulate(latencyMs = 0, jitterMs = 0, loss = 0): void {
    this.simLatency = Math.max(0, latencyMs);
    this.simJitter = Math.max(0, jitterMs);
    this.simLoss = Math.min(1, Math.max(0, loss));
  }

  toString(): string {
    const roles = ['OFFLINE', 'HOST', 'CLIENT'];
    let text = `QNetwork ${roles[this.role]} port ${this.port} local id ${this.localId}`;
    if (this.simulating) {
      text += `  [simulating ${this.simLatency}ms +/-${this.simJitter}ms, ${Math.round(this.simLoss * 100)}% loss]`;
    }
    for (const connection of this.connections) if (connection) text += `\n  ${connection}`;
    return text;
  }

  // ---- Receiving --------------------------------------------------------------------

  private handleDatagram(data: Buffer, ip: string, port: number) {
    if (data.length < 3) return;
    const packet = GMBuffer.from(data);
    if (packet.read('buffer_u16') !== PROTOCOL_ID) return;
    const type = packet.read('buffer_u8') as PacketType;
    const now = performance.now();
    if (this.role === QNetRole.Host) this.hostReceive(type, packet, ip, port, now);
    else if (this.role === QNetRole.Client) this.clientReceive(type, packet, ip, port, now);
  }

  private hostReceive(type: PacketType, packet: GMBuffer, ip: string, port: number, now: number) {
    const key = `${ip}:${port}`;
    const connection = this.addressLookup.get(key);
    const size = packet.size;

    switch (type) {
      case PacketType.ConnectRequest: {
        if (size < 11 || connection) return;
        const schema = packet.read('buffer_u32');
        const clientSalt = packet.read('buffer_u32');
        if (schema !== this.serializer.schemaHash) {
          this.sendDenied(ip, port, clientSalt, QNetReason.SchemaMismatch);
          return;
        }
        if (this.freeSlot() < 0) {
          this.sendDenied(ip, port, clientSalt, QNetReason.ServerFull);
          return;
        }
        let pending = this.pending.get(key);
        if (!pending || pending.clientSalt !== clientSalt) {
          if (!pending && this.pending.size >= MAX_PENDING) return;
          pending = { clientSalt, serverSalt: randomU32(), time: now };
          this.pending.set(key, pending);
        }
        pending.time = now;
        this.sendChallenge(ip, port, pending.clientSalt, pending.serverSalt);
        return;
      }
      case PacketType.ChallengeResponse: {
        if (size < 7) return;
        const session = packet.read('buffer_u32');
        if (connection) {
          if (connection.session === session) {
            connection.lastReceiveTime = now;
            this.sendAccepted(connection); // our ACCEPTED was lost
          }
          return;
        }
        const pending = this.pending.get(key);
        if (!pending || (pending.clientSalt ^ pending.serverSalt) >>> 0 !== session) return;
        this.pending.delete(key);
        const slot = this.freeSlot();
        if (slot < 0) {
          this.sendDenied(ip, port, pending.clientSalt, QNetReason.ServerFull);
          return;
        }
        const created = new QNetConnection(this, slot, ip, port);
        created.accept(session, now);
        this.connections[slot] = created;
        this.addressLookup.set(key, created);
        this.sendAccepted(created);
        this.onConnected(created);
        return;
      }
      case PacketType.Payload:
        if (!connection || size < 15) return;
        if (packet.read('buffer_u32') !== connection.session) return;
        connection.receivePayload(packet, now);
        return;
      case PacketType.Disconnect:
        if (!connection || size < 7) return;
        if (packet.read('buffer_u32') !== connection.session) return;
        this.drop(connection, QNetReason.Remote, false);
        return;
    }
  }

  private clientReceive(type: PacketType, packet: GMBuffer, ip: string, port: number, now: number) {
    const connection = this.connections[0];
    // The address is not compared (join() may have used a hostname); salts and the session authenticate.
    if (!connection || port !== connection.port) return;
    const size = packet.size;

    switch (type) {
      case PacketType.Challenge: {
        if (size < 11 || connection.state !== QNetState.Connecting) return;
        const clientSalt = packet.read('buffer_u32');
        const serverSalt = packet.read('buffer_u32');
        if (clientSalt !== connection.clientSalt) return;
        connection.onChallenge(serverSalt, ip, now);
        this.sendChallengeResponse(connection);
        return;
      }
      case PacketType.Accepted: {
        if (size < 9 || connection.state !== QNetState.Challenged) return;
        const session = packet.read('buffer_u32');
        const assignedId = packet.read('buffer_u16');
        if (session !== connection.session) return;
        connection.accept(session, now);
        this.localId = assignedId;
        this.onConnected(connection);
        return;
      }
      case PacketType.Denied: {
        if (size < 8) return;
        if (connection.state !== QNetState.Connecting && connection.state !== QNetState.Challenged) return;
        const salt = packet.read('buffer_u32');
        let reason = packet.read('buffer_u8') as QNetReason;
        if (salt !== connection.clientSalt) return;
        if (reason !== QNetReason.ServerFull && reason !== QNetReason.SchemaMismatch) reason = QNetReason.None;
        this.drop(connection, reason, false);
        return;
      }
      case PacketType.Payload:
        if (size < 15 || connection.state !== QNetState.Connected) return;
        if (packet.read('buffer_u32') !== connection.session) return;
        connection.receivePayload(packet, now);
        return;
      case PacketType.Disconnect:
        if (size < 7 || connection.state !== QNetState.Connected) return;
        if (packet.read('buffer_u32') !== connection.session) return;
        this.drop(connection, QNetReason.Remote, false);
        return;
    }
  }

  /** @internal */
  decodeMessage(body: Buffer): object | undefined {
    const buffer = GMBuffer.from(body);
    try {
      const message = this.serializer.read(buffer);
      if (message === undefined || buffer.remaining !== 0) {
        this.warnOnce(
          'decode-size',
          'Dropped a message whose size did not match its type (manual Read/Write mismatch?)',
        );
        return undefined;
      }
      return message;
    } catch (error) {
      this.log(`Dropped a message that could not be decoded: ${(error as Error).message}`);
      return undefined;
    }
  }

  /** @internal */
  dispatch(message: object, from: QNetConnection) {
    const handler = this.handlers.get(message.constructor);
    if (handler) {
      handler(message, from);
      return;
    }
    const onReceive = (message as { onReceive?: (from: QNetConnection) => void }).onReceive;
    if (typeof onReceive === 'function') {
      onReceive.call(message, from);
      return;
    }
    const name = this.serializer.nameOf(message);
    this.warnOnce(`unhandled-${name}`, `Received ${name} but nothing handles it. Use network.on(${name}, handler).`);
  }

  // ---- Sending (internal) ------------------------------------------------------------

  /** @internal */
  encodeMessage(message: object): Buffer {
    const body = this.serializer.serialize(message);
    if (body.length > 65535)
      throw new RangeError(`${message.constructor.name} is ${body.length} bytes; the limit is 65535`);
    if (body.length + 20 > MAX_PACKET_SIZE) {
      this.warnOnce(
        `large-${message.constructor.name}`,
        `${message.constructor.name} is ${body.length} bytes and will be sent alone.`,
      );
    }
    return body;
  }

  /** @internal Starts a packet: u16 protocol id, u8 type. */
  beginPacket(type: PacketType): GMBuffer {
    const packet = GMBuffer.alloc(MAX_PACKET_SIZE);
    packet.write(PROTOCOL_ID, 'buffer_u16');
    packet.write(type, 'buffer_u8');
    return packet;
  }

  /** @internal */
  sendRaw(ip: string, port: number, data: Buffer, bypassSimulator: boolean) {
    if (!this.socket) return;
    if (this.simulating && !bypassSimulator) {
      if (Math.random() < this.simLoss) return;
      const delay = Math.max(0, this.simLatency + (Math.random() * 2 - 1) * this.simJitter);
      this.simQueue.push({ time: performance.now() + delay, ip, port, data });
      return;
    }
    this.socket.send(data, port, ip);
  }

  /** @internal */
  sendConnectRequest(connection: QNetConnection) {
    const packet = this.beginPacket(PacketType.ConnectRequest);
    packet.write(this.serializer.schemaHash, 'buffer_u32');
    packet.write(connection.clientSalt, 'buffer_u32');
    this.sendRaw(connection.ip, connection.port, packet.toBuffer(), false);
  }

  private sendChallenge(ip: string, port: number, clientSalt: number, serverSalt: number) {
    const packet = this.beginPacket(PacketType.Challenge);
    packet.write(clientSalt, 'buffer_u32');
    packet.write(serverSalt, 'buffer_u32');
    this.sendRaw(ip, port, packet.toBuffer(), false);
  }

  /** @internal */
  sendChallengeResponse(connection: QNetConnection) {
    const packet = this.beginPacket(PacketType.ChallengeResponse);
    packet.write(connection.session, 'buffer_u32');
    this.sendRaw(connection.ip, connection.port, packet.toBuffer(), false);
  }

  private sendAccepted(connection: QNetConnection) {
    const packet = this.beginPacket(PacketType.Accepted);
    packet.write(connection.session, 'buffer_u32');
    packet.write(connection.id, 'buffer_u16');
    this.sendRaw(connection.ip, connection.port, packet.toBuffer(), false);
  }

  private sendDenied(ip: string, port: number, clientSalt: number, reason: QNetReason) {
    const packet = this.beginPacket(PacketType.Denied);
    packet.write(clientSalt, 'buffer_u32');
    packet.write(reason, 'buffer_u8');
    this.sendRaw(ip, port, packet.toBuffer(), false);
  }

  /** Sent three times, skipping the simulator, because the socket may close right after. */
  private sendDisconnect(connection: QNetConnection) {
    const packet = this.beginPacket(PacketType.Disconnect);
    packet.write(connection.session, 'buffer_u32');
    const data = packet.toBuffer();
    for (let i = 0; i < 3; i++) this.sendRaw(connection.ip, connection.port, data, true);
  }

  // ---- Bookkeeping (internal) ----------------------------------------------------------

  private get simulating() {
    return this.simLatency > 0 || this.simJitter > 0 || this.simLoss > 0;
  }

  private freeSlot(): number {
    for (let i = 1; i < this.connections.length; i++) if (!this.connections[i]) return i;
    return -1;
  }

  /** @internal Ends one connection. A client's only connection is the host, so a client goes offline. */
  drop(connection: QNetConnection, reason: QNetReason, notifyPeer: boolean) {
    if (connection.state === QNetState.Disconnected) return;
    const wasConnected = connection.state === QNetState.Connected;
    const wasClient = this.role === QNetRole.Client;
    if (notifyPeer && wasConnected) this.sendDisconnect(connection);
    connection.destroy();
    if (wasClient) {
      this.closeSocket();
    } else {
      if (this.connections[connection.id] === connection) this.connections[connection.id] = undefined;
      this.addressLookup.delete(`${connection.ip}:${connection.port}`);
    }
    this.fireClosed(connection, wasConnected, wasClient, reason);
  }

  private fireClosed(connection: QNetConnection, wasConnected: boolean, wasClient: boolean, reason: QNetReason) {
    if (wasConnected) this.onDisconnected(connection, reason);
    else if (wasClient) this.onConnectFailed(reason);
  }

  private closeSocket(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    // Delayed simulator packets are dropped with the socket.
    this.simQueue = [];
    const closed = this.socket?.close() ?? Promise.resolve(); // waits for sends in flight, like DISCONNECT
    this.lastClose = closed;
    this.socket = undefined;
    this.role = QNetRole.Offline;
    this.localId = -1;
    this.port = -1;
    this.connections = [];
    this.addressLookup.clear();
    this.pending.clear();
    return closed;
  }

  private openSocket(port: number, address: string): Promise<SocketHandle | undefined> {
    return new Promise((resolve) => {
      const socket = dgram.createSocket('udp4');
      const onError = () => {
        socket.close();
        resolve(undefined);
      };
      socket.once('error', onError);
      socket.bind(port, address, () => {
        socket.off('error', onError);
        const handle = new SocketHandle(
          socket,
          (data, ip, port) => this.handleDatagram(data, ip, port),
          (message) => this.log(message),
        );
        resolve(handle);
      });
    });
  }

  private startTicking() {
    this.timer = setInterval(() => this.tick(), this.tickMs);
  }

  private tick() {
    if (this.role === QNetRole.Offline) return;
    const now = performance.now();

    if (this.simQueue.length > 0 && this.socket) {
      const waiting = [];
      for (const item of this.simQueue) {
        if (item.time <= now) this.socket.send(item.data, item.port, item.ip);
        else waiting.push(item);
      }
      this.simQueue = waiting;
    }

    for (let i = 0; i < this.connections.length; i++) {
      const connection = this.connections[i];
      if (!connection) continue;
      if (connection.state === QNetState.Connected) {
        if (now - connection.lastReceiveTime > this.timeoutMs) {
          this.drop(connection, QNetReason.Timeout, false);
          continue;
        }
        connection.flush(now, this.heartbeatMs);
      } else {
        connection.handshakeTick(now, this.connectTimeoutMs);
      }
    }

    if (this.role === QNetRole.Host && now - this.lastPendingSweep >= 1000) {
      this.lastPendingSweep = now;
      for (const [key, pending] of this.pending) {
        if (now - pending.time > this.connectTimeoutMs) this.pending.delete(key);
      }
    }
  }

  private warnOnce(key: string, message: string) {
    if (this.warned.has(key)) return;
    this.warned.add(key);
    this.log(`WARNING: ${message}`);
  }
}

/**
 * A bound UDP socket. close() stops delivering datagrams at once, but only closes the socket after
 * sends already handed to the OS have completed; closing earlier would cancel them.
 */
class SocketHandle {
  private inFlight = 0;
  private closing = false;
  private readonly closed: Promise<void>;

  constructor(
    private readonly socket: dgram.Socket,
    onDatagram: (data: Buffer, ip: string, port: number) => void,
    log: (message: string) => void,
  ) {
    this.closed = new Promise((resolve) => socket.once('close', () => resolve()));
    socket.on('error', (error) => log(`Socket error: ${error.message}`));
    socket.on('message', (data, info) => {
      if (!this.closing) onDatagram(data, info.address, info.port);
    });
  }

  get port(): number {
    return this.socket.address().port;
  }

  send(data: Buffer, port: number, ip: string) {
    if (this.closing) return;
    this.inFlight++;
    this.socket.send(data, port, ip, () => {
      this.inFlight--;
      if (this.closing && this.inFlight === 0) this.socket.close();
    });
  }

  close(): Promise<void> {
    if (!this.closing) {
      this.closing = true;
      if (this.inFlight === 0) this.socket.close();
    }
    return this.closed;
  }
}

function randomU32(): number {
  return randomInt(0, 0xffffffff) >>> 0;
}
