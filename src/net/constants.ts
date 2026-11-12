/** Wire constants. These must match __qnet_config in the GameMaker library. See PROTOCOL.md. */
export const PROTOCOL_ID = 0x514e;
export const PROTOCOL_VERSION = 2;
export const MAX_PACKET_SIZE = 1200;
export const RELIABLE_WINDOW = 256;
export const MIN_RESEND_MS = 100;
export const HANDSHAKE_RETRY_MS = 200;
export const ACK_DELAY_MS = 33;
export const MAX_PENDING = 64;
export const SEQUENCE_RING = 256;

/** How a message is delivered. Values are on the wire. */
export enum QNetChannel {
  /** Fire and forget. May be lost or arrive out of order. Never duplicated. */
  Unreliable = 0,
  /** May be lost, but never arrives older than one already received. For state like positions. */
  Sequenced = 1,
  /** Always arrives, exactly once, in send order. For events. */
  Reliable = 2,
}

export enum QNetRole {
  Offline = 0,
  Host = 1,
  Client = 2,
}

export enum QNetState {
  Disconnected = 0,
  /** Client only: sending connection requests. */
  Connecting = 1,
  /** Client only: the host answered with a challenge. */
  Challenged = 2,
  Connected = 3,
}

/** Why a connection ended or a join failed. Values match QNET_REASON in GameMaker (and are on the wire). */
export enum QNetReason {
  None = 0,
  /** You called disconnect() or shutdown(). */
  Local = 1,
  /** The other side closed the connection. */
  Remote = 2,
  /** Nothing heard from the peer for `timeout` seconds. */
  Timeout = 3,
  /** Join only: the host has no free slots. */
  ServerFull = 4,
  /** Join only: different message list or protocol version. */
  SchemaMismatch = 5,
  /** Join only: no answer within `connectTimeout` seconds. */
  ConnectTimeout = 6,
}

export function reasonToString(reason: QNetReason): string {
  switch (reason) {
    case QNetReason.Local:
      return 'Closed locally';
    case QNetReason.Remote:
      return 'Closed by remote peer';
    case QNetReason.Timeout:
      return 'Timed out';
    case QNetReason.ServerFull:
      return 'Server is full';
    case QNetReason.SchemaMismatch:
      return 'Message list or QNet version does not match the host';
    case QNetReason.ConnectTimeout:
      return 'No response from host';
    default:
      return 'None';
  }
}

/** @internal */
export enum PacketType {
  ConnectRequest = 1,
  Challenge = 2,
  ChallengeResponse = 3,
  Accepted = 4,
  Denied = 5,
  Payload = 6,
  Disconnect = 7,
}

// ---- u16 sequence arithmetic ---------------------------------------------------------

/** True if `a` is newer than `b`, accounting for wrap-around. */
export function seqGreater(a: number, b: number): boolean {
  return (a > b && a - b <= 32768) || (a < b && b - a > 32768);
}

/** How far forward `newer` is from `older`, 0..65535. */
export function seqDiff(newer: number, older: number): number {
  return (newer - older + 65536) % 65536;
}

export function seqNext(seq: number): number {
  return (seq + 1) % 65536;
}
