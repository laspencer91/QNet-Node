import dgram from 'dgram';
import { QConnectionDisconnect, QConnectionHeartbeat, QConnectionRequest, QConnectionRequestStatus } from './messages';
import { QSerializer } from '../q-serializer';

export enum QConnectionStatus {
  DISCONNECTED = 0,
  CONNECTED = 1,
  CONNECTING = 2,
  TIMEOUT = 3,
}

export class QNetworkConnection {
  id: number;
  ip: string;
  port: number;
  status: QConnectionStatus = QConnectionStatus.DISCONNECTED;
  lastDataReceivedTime: number = Date.now();
  heartbeatFrequency: number = 2000; // 2 seconds
  ping: number = 0;

  private connectAttempts: number = 0;
  private readonly maxConnectionAttempts: number = 5;
  private pulseInterval?: NodeJS.Timeout;
  private readonly socket: dgram.Socket;
  private readonly serializer: QSerializer;

  constructor(id: number, ip: string, port: number, socket: dgram.Socket, serializer: QSerializer) {
    this.id = id;
    this.ip = ip;
    this.port = port;
    this.socket = socket;
    this.serializer = serializer;
  }

  start() {
    this.startPulse();
  }

  attemptConnection() {
    if (this.status === QConnectionStatus.CONNECTED) {
      console.warn(`Connection ${this.id} attempted a connection but is already connected.`);
      return;
    }

    if (this.status === QConnectionStatus.CONNECTING) return;

    this.status = QConnectionStatus.CONNECTING;
    this.sendPacket(new QConnectionRequest(QConnectionRequestStatus.REQUESTED, -1));
  }

  sendPacket(data: any) {
    const buffer = this.serializer.serialize(data);
    if (buffer) {
      this.socket.send(buffer, this.port, this.ip, (error) => {
        if (error) {
          console.error(`Failed to send packet to ${this.ip}:${this.port}`, error);
        }
      });
    }
  }

  onConnect() {
    console.log('[MAKE ALIVE] CALLED! CONNECTED!');
    this.status = QConnectionStatus.CONNECTED;
    this.connectAttempts = 0;
  }

  disconnect() {
    this.stopPulse();

    if (this.status === QConnectionStatus.CONNECTED) {
      this.sendPacket(new QConnectionDisconnect());
    }

    this.status = QConnectionStatus.DISCONNECTED;
  }

  private startPulse() {
    this.pulseInterval = setInterval(() => this.pulse(), this.heartbeatFrequency);
  }

  private stopPulse() {
    if (this.pulseInterval) {
      clearInterval(this.pulseInterval);
      this.pulseInterval = undefined;
    }
  }

  private pulse() {
    if (this.status === QConnectionStatus.CONNECTING) {
      console.log(`Sending Connection Request ${this.connectAttempts++}`);

      this.sendPacket(new QConnectionRequest(QConnectionRequestStatus.REQUESTED, -1));

      if (this.connectAttempts >= this.maxConnectionAttempts) {
        this.status = QConnectionStatus.TIMEOUT;
        this.connectAttempts = 0;
      }
    } else if (this.status === QConnectionStatus.CONNECTED) {
      this.sendPacket(new QConnectionHeartbeat(Date.now(), false));
    }
  }

  toString() {
    const statusText = QConnectionStatus[this.status];
    return `[Connection] ${this.id} - ${statusText} - ${this.ping}`;
  }
}
