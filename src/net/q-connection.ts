import { GMBuffer } from '../buffer/gm-buffer';
import {
  ACK_DELAY_MS,
  HANDSHAKE_RETRY_MS,
  MAX_PACKET_SIZE,
  MIN_RESEND_MS,
  QNetChannel,
  QNetReason,
  QNetState,
  RELIABLE_WINDOW,
  SEQUENCE_RING,
  seqDiff,
  seqGreater,
  seqNext,
  PacketType,
} from './constants';
import type { QNetwork } from './q-network';

interface Outgoing {
  channel: QNetChannel;
  seq: number;
  body: Buffer;
}

interface ReliableEntry {
  id: number;
  body: Buffer;
  lastSent: number;
}

export interface QConnectionStats {
  packetsSent: number;
  packetsReceived: number;
  packetsLost: number;
  bytesSent: number;
  bytesReceived: number;
  /** Reliable messages written again because their first packet was not acknowledged. */
  resends: number;
}

/**
 * One remote peer. QNetwork creates these; you get them from callbacks and handlers.
 *
 * Reliability works the same way as in the GameMaker library (see __qnet_connection.gml):
 * every packet acknowledges the last 33 packets from the other side, and reliable messages
 * stay in a 256-message window until a packet carrying them is acknowledged, being resent
 * after max(100ms, rtt * 1.5). The receiver releases reliable messages strictly in order.
 */
export class QNetConnection {
  /** Remote peer id: 0 is the host, clients are 1..maxClients. */
  readonly id: number;
  ip: string;
  readonly port: number;
  state = QNetState.Disconnected;
  /** Smoothed round-trip time in milliseconds. */
  rtt = 0;
  /** Smoothed fraction (0..1) of our packets that were never acknowledged. */
  packetLoss = 0;
  readonly stats: QConnectionStats = {
    packetsSent: 0,
    packetsReceived: 0,
    packetsLost: 0,
    bytesSent: 0,
    bytesReceived: 0,
    resends: 0,
  };

  /** @internal */ session = 0;
  /** @internal */ clientSalt = 0;
  /** @internal */ lastReceiveTime = 0;
  private handshakeStarted = 0;
  private lastHandshakeSend = -Infinity;
  private lastSendTime = 0;

  private sendSeq = 0;
  private readonly sentSeq = new Int32Array(SEQUENCE_RING).fill(-1);
  private readonly sentTime = new Float64Array(SEQUENCE_RING);
  private readonly sentAcked = new Array<boolean>(SEQUENCE_RING).fill(true);
  private readonly sentReliable = new Array<number[] | undefined>(SEQUENCE_RING);
  private recvLatest = -1;
  private readonly recvSeqs = new Int32Array(SEQUENCE_RING).fill(-1);
  private ackPending = false;
  private rttSampled = false;

  private outgoing: Outgoing[] = [];
  private sequencedSend = 0;
  private sequencedRecvLatest = -1;

  private relNextId = 0;
  private relOldest = 0;
  private relWindow = new Array<ReliableEntry | undefined>(RELIABLE_WINDOW);
  private relBacklog: Buffer[] = [];
  private relRecvNext = 0;
  private relRecvWindow = new Array<{ id: number; message: object | undefined } | undefined>(RELIABLE_WINDOW);

  /** @internal */
  constructor(
    readonly network: QNetwork,
    id: number,
    ip: string,
    port: number,
  ) {
    this.id = id;
    this.ip = ip;
    this.port = port;
  }

  get isConnected(): boolean {
    return this.state === QNetState.Connected;
  }

  /**
   * Queue a message for this peer. It goes out on the next update, packed with anything else queued.
   * @returns false if not connected.
   */
  send(message: object, channel: QNetChannel = QNetChannel.Reliable): boolean {
    checkChannel(channel);
    if (this.state !== QNetState.Connected) return false;
    this.enqueue(this.network.encodeMessage(message), channel);
    return true;
  }

  /** Close this connection: kicks a client (host) or leaves the host (client). */
  disconnect(): void {
    this.network.drop(this, QNetReason.Local, true);
  }

  toString(): string {
    const states = ['disconnected', 'connecting', 'challenged', 'connected'];
    return `#${this.id} ${this.ip}:${this.port} ${states[this.state]} rtt ${Math.round(this.rtt)}ms loss ${Math.round(
      this.packetLoss * 100,
    )}%`;
  }

  // ---- Lifecycle (internal) ---------------------------------------------------------

  /** @internal */
  beginConnect(now: number, clientSalt: number) {
    this.state = QNetState.Connecting;
    this.clientSalt = clientSalt;
    this.handshakeStarted = now;
    this.lastHandshakeSend = -Infinity;
  }

  /** @internal */
  onChallenge(serverSalt: number, observedIp: string, now: number) {
    this.session = (this.clientSalt ^ serverSalt) >>> 0;
    this.ip = observedIp;
    this.state = QNetState.Challenged;
    this.lastHandshakeSend = now;
  }

  /** @internal */
  accept(session: number, now: number) {
    this.session = session;
    this.state = QNetState.Connected;
    this.lastReceiveTime = now;
    this.lastSendTime = now;
  }

  /** @internal */
  handshakeTick(now: number, connectTimeoutMs: number) {
    if (now - this.handshakeStarted >= connectTimeoutMs) {
      this.network.drop(this, QNetReason.ConnectTimeout, false);
      return;
    }
    if (now - this.lastHandshakeSend < HANDSHAKE_RETRY_MS) return;
    this.lastHandshakeSend = now;
    if (this.state === QNetState.Connecting) this.network.sendConnectRequest(this);
    else if (this.state === QNetState.Challenged) this.network.sendChallengeResponse(this);
  }

  /** @internal */
  destroy() {
    this.state = QNetState.Disconnected;
    this.outgoing = [];
    this.relBacklog = [];
    this.relWindow = new Array(RELIABLE_WINDOW);
    this.relRecvWindow = new Array(RELIABLE_WINDOW);
  }

  // ---- Sending (internal) -----------------------------------------------------------

  /** @internal Takes ownership of body. */
  enqueue(body: Buffer, channel: QNetChannel) {
    if (channel === QNetChannel.Reliable) {
      if (this.relBacklog.length > 0 || seqDiff(this.relNextId, this.relOldest) >= RELIABLE_WINDOW) {
        this.relBacklog.push(body);
      } else {
        this.addToWindow(body);
      }
    } else if (channel === QNetChannel.Sequenced) {
      this.outgoing.push({ channel, seq: this.sequencedSend, body });
      this.sequencedSend = seqNext(this.sequencedSend);
    } else {
      this.outgoing.push({ channel: QNetChannel.Unreliable, seq: 0, body });
    }
  }

  private addToWindow(body: Buffer) {
    this.relWindow[this.relNextId % RELIABLE_WINDOW] = { id: this.relNextId, body, lastSent: -1 };
    this.relNextId = seqNext(this.relNextId);
  }

  private pumpBacklog() {
    let moved = 0;
    while (moved < this.relBacklog.length && seqDiff(this.relNextId, this.relOldest) < RELIABLE_WINDOW) {
      this.addToWindow(this.relBacklog[moved++]);
    }
    if (moved > 0) this.relBacklog.splice(0, moved);
  }

  /** @internal Packs everything due into as few packets as possible and sends them. */
  flush(now: number, heartbeatMs: number) {
    if (this.state !== QNetState.Connected) return;

    let packet: GMBuffer | undefined;
    let count = 0;
    let ids: number[] = [];
    const resendMs = Math.max(MIN_RESEND_MS, this.rtt * 1.5);

    const room = (size: number) => packet !== undefined && count > 0 && packet.tell + 5 + size > MAX_PACKET_SIZE;
    const ensurePacket = () => {
      if (packet === undefined) {
        packet = this.beginPayload();
        count = 0;
        ids = [];
      }
      return packet;
    };

    for (let id = this.relOldest; id !== this.relNextId; id = seqNext(id)) {
      const entry = this.relWindow[id % RELIABLE_WINDOW];
      if (!entry || (entry.lastSent >= 0 && now - entry.lastSent < resendMs)) continue;
      if (room(entry.body.length)) {
        this.finishPayload(packet!, ids, now);
        packet = undefined;
      }
      if (entry.lastSent >= 0) this.stats.resends++;
      writeMessage(ensurePacket(), QNetChannel.Reliable, entry.id, entry.body);
      ids.push(entry.id);
      entry.lastSent = now;
      count++;
    }

    for (const out of this.outgoing) {
      if (room(out.body.length)) {
        this.finishPayload(packet!, ids, now);
        packet = undefined;
      }
      writeMessage(ensurePacket(), out.channel, out.seq, out.body);
      count++;
    }
    this.outgoing = [];

    if (packet === undefined) {
      const idle = now - this.lastSendTime;
      if ((this.ackPending && idle >= ACK_DELAY_MS) || idle >= heartbeatMs) ensurePacket();
    }
    if (packet !== undefined) this.finishPayload(packet, ids, now);
  }

  private beginPayload(): GMBuffer {
    const packet = this.network.beginPacket(PacketType.Payload);
    packet.write(this.session, 'buffer_u32');
    packet.write(this.sendSeq, 'buffer_u16');
    // Before anything is received, 65535 with no bits acknowledges nothing.
    packet.write(this.recvLatest < 0 ? 65535 : this.recvLatest, 'buffer_u16');
    packet.write(this.recvLatest < 0 ? 0 : this.ackBits(), 'buffer_u32');
    return packet;
  }

  private ackBits(): number {
    let bits = 0;
    for (let i = 1; i <= 32; i++) {
      const seq = (this.recvLatest - i + 65536) % 65536;
      if (this.recvSeqs[seq % SEQUENCE_RING] === seq) bits = (bits | (1 << (i - 1))) >>> 0;
    }
    return bits;
  }

  private finishPayload(packet: GMBuffer, reliableIds: number[], now: number) {
    // A packet 64 sends ago that is still unacknowledged has fallen out of every possible ack mask.
    const oldSeq = (this.sendSeq - 64 + 65536) % 65536;
    const oldSlot = oldSeq % SEQUENCE_RING;
    if (this.sentSeq[oldSlot] === oldSeq && !this.sentAcked[oldSlot]) {
      this.sentAcked[oldSlot] = true;
      this.sentReliable[oldSlot] = undefined;
      this.stats.packetsLost++;
      this.packetLoss += (1 - this.packetLoss) * 0.05;
    }

    const slot = this.sendSeq % SEQUENCE_RING;
    this.sentSeq[slot] = this.sendSeq;
    this.sentTime[slot] = now;
    this.sentAcked[slot] = false;
    this.sentReliable[slot] = reliableIds.length > 0 ? reliableIds : undefined;
    this.sendSeq = seqNext(this.sendSeq);

    this.lastSendTime = now;
    this.ackPending = false;
    this.stats.packetsSent++;
    this.stats.bytesSent += packet.size;
    this.network.sendRaw(this.ip, this.port, packet.toBuffer(), false);
  }

  // ---- Receiving (internal) ---------------------------------------------------------

  /** @internal `packet` is positioned right after the session field. */
  receivePayload(packet: GMBuffer, now: number) {
    const seq = packet.read('buffer_u16');
    const ack = packet.read('buffer_u16');
    const ackBits = packet.read('buffer_u32');

    const slot = seq % SEQUENCE_RING;
    if (this.recvSeqs[slot] === seq) return;
    if (this.recvLatest >= 0 && seqGreater(this.recvLatest, seq) && seqDiff(this.recvLatest, seq) >= SEQUENCE_RING) {
      return;
    }

    this.recvSeqs[slot] = seq;
    if (this.recvLatest < 0 || seqGreater(seq, this.recvLatest)) this.recvLatest = seq;
    this.ackPending = true;
    this.lastReceiveTime = now;
    this.stats.packetsReceived++;
    this.stats.bytesReceived += packet.size;

    this.processAck(ack, now);
    for (let i = 1; i <= 32; i++) {
      if ((ackBits & (1 << (i - 1))) !== 0) this.processAck((ack - i + 65536) % 65536, now);
    }

    while (packet.remaining > 0) {
      if (this.state !== QNetState.Connected) return; // a handler disconnected us
      if (packet.remaining < 3) return;
      const channel = packet.read('buffer_u8') as QNetChannel;
      let channelSeq = 0;
      if (channel === QNetChannel.Sequenced || channel === QNetChannel.Reliable) {
        if (packet.remaining < 4) return;
        channelSeq = packet.read('buffer_u16');
      } else if (channel !== QNetChannel.Unreliable) {
        return; // malformed
      }
      const length = packet.read('buffer_u16');
      if (length > packet.remaining) return; // malformed
      const body = packet.readBytes(length);

      if (channel === QNetChannel.Unreliable) {
        this.deliver(body);
      } else if (channel === QNetChannel.Sequenced) {
        if (this.sequencedRecvLatest < 0 || seqGreater(channelSeq, this.sequencedRecvLatest)) {
          this.sequencedRecvLatest = channelSeq;
          this.deliver(body);
        }
      } else {
        this.receiveReliable(body, channelSeq);
      }
    }
  }

  private deliver(body: Buffer) {
    const message = this.network.decodeMessage(body);
    if (message !== undefined) this.network.dispatch(message, this);
  }

  private receiveReliable(body: Buffer, id: number) {
    if (seqDiff(id, this.relRecvNext) < RELIABLE_WINDOW) {
      const slot = id % RELIABLE_WINDOW;
      // Decoded now: the incoming datagram buffer is not ours to keep.
      if (!this.relRecvWindow[slot]) this.relRecvWindow[slot] = { id, message: this.network.decodeMessage(body) };
    }
    for (;;) {
      const slot = this.relRecvNext % RELIABLE_WINDOW;
      const entry = this.relRecvWindow[slot];
      if (!entry || entry.id !== this.relRecvNext) break;
      this.relRecvWindow[slot] = undefined;
      this.relRecvNext = seqNext(this.relRecvNext);
      if (entry.message !== undefined) this.network.dispatch(entry.message, this);
      if (this.state !== QNetState.Connected) return;
    }
  }

  private processAck(seq: number, now: number) {
    const slot = seq % SEQUENCE_RING;
    if (this.sentSeq[slot] !== seq || this.sentAcked[slot]) return;
    this.sentAcked[slot] = true;

    const sample = now - this.sentTime[slot];
    this.rtt = this.rttSampled ? this.rtt + (sample - this.rtt) * 0.1 : sample;
    this.rttSampled = true;
    this.packetLoss += (0 - this.packetLoss) * 0.05;

    const ids = this.sentReliable[slot];
    this.sentReliable[slot] = undefined;
    if (!ids) return;
    for (const id of ids) {
      const windowSlot = id % RELIABLE_WINDOW;
      if (this.relWindow[windowSlot]?.id === id) this.relWindow[windowSlot] = undefined;
    }
    while (this.relOldest !== this.relNextId && this.relWindow[this.relOldest % RELIABLE_WINDOW] === undefined) {
      this.relOldest = seqNext(this.relOldest);
    }
    this.pumpBacklog();
  }
}

function writeMessage(packet: GMBuffer, channel: QNetChannel, seq: number, body: Buffer) {
  packet.write(channel, 'buffer_u8');
  if (channel !== QNetChannel.Unreliable) packet.write(seq, 'buffer_u16');
  packet.write(body.length, 'buffer_u16');
  packet.writeBytes(body);
}

export function checkChannel(channel: QNetChannel) {
  if (channel !== QNetChannel.Unreliable && channel !== QNetChannel.Sequenced && channel !== QNetChannel.Reliable) {
    throw new TypeError(`${channel} is not a QNetChannel`);
  }
}
