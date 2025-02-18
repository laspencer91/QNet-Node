import dgram from 'dgram';
import { QConnectionDisconnect, QConnectionHeartbeat, QConnectionRequest, QConnectionRequestStatus } from './messages';
import { QNetworkConnection, QConnectionStatus } from './connection';
import { QSerializer } from '../q-serializer';

export class QNetworkManager {
  private readonly maxConnections: number;
  private readonly connectionTimeout: number = 5000; // 5 seconds
  private readonly connections: Map<string, QNetworkConnection> = new Map();
  private readonly socket: dgram.Socket;
  private readonly serializer: QSerializer;
  private statusCheckInterval?: NodeJS.Timeout;
  private nextConnectionId: number = 0;

  constructor(maxConnections: number, serializer: QSerializer) {
    this.maxConnections = maxConnections;
    this.serializer = serializer;
    this.socket = dgram.createSocket('udp4');
    this.setupSocketHandlers();
  }

  async start(port: number): Promise<number> {
    return new Promise((resolve, reject) => {
      this.socket.bind(port, () => {
        console.log(`Socket initialized at port: ${port}`);
        this.startConnectionStatusCheck();
        resolve(port);
      });

      this.socket.on('error', (error) => {
        reject(error);
      });
    });
  }

  shutdown() {
    if (this.statusCheckInterval) {
      clearInterval(this.statusCheckInterval);
    }

    // Disconnect all connections
    for (const connection of this.connections.values()) {
      connection.disconnect();
    }
    this.connections.clear();

    // Close socket
    this.socket.close();
    console.log('NetworkManager has shutdown.');
  }

  async connect(ip: string, port: number) {
    const key = `${ip}:${port}`;
    if (this.connections.has(key)) {
      throw new Error('Already connected to this address');
    }

    const connection = this.addConnection(ip, port);
    connection.attemptConnection();
    return connection;
  }

  private addConnection(ip: string, port: number): QNetworkConnection {
    const key = `${ip}:${port}`;
    if (this.connections.size >= this.maxConnections) {
      throw new Error('Max connections reached');
    }

    const connection = new QNetworkConnection(this.nextConnectionId++, ip, port, this.socket, this.serializer);

    this.connections.set(key, connection);
    connection.start();

    return connection;
  }

  private removeConnection(connection: QNetworkConnection, quietly: boolean = false) {
    const key = `${connection.ip}:${connection.port}`;
    this.connections.delete(key);

    if (!quietly) {
      connection.disconnect();
    }
  }

  private setupSocketHandlers() {
    this.socket.on('message', (msg, rinfo) => {
      const message = this.serializer.deserialize(msg);
      if (!message?.instance) return;

      const key = `${rinfo.address}:${rinfo.port}`;
      const connection = this.connections.get(key);

      if (message.instance instanceof QConnectionRequest) {
        this.handleConnectionRequest(message.instance, rinfo);
      } else if (message.instance instanceof QConnectionHeartbeat) {
        this.handleHeartbeat(message.instance, connection);
      } else if (message.instance instanceof QConnectionDisconnect) {
        this.handleDisconnect(connection);
      } else if (connection) {
        connection.lastDataReceivedTime = Date.now();
        this.onMessage(message.instance, connection);
      }
    });
  }

  private handleConnectionRequest(request: QConnectionRequest, rinfo: dgram.RemoteInfo) {
    const key = `${rinfo.address}:${rinfo.port}`;
    let connection = this.connections.get(key);

    if (request.status === QConnectionRequestStatus.REQUESTED) {
      try {
        connection = this.addConnection(rinfo.address, rinfo.port);
        const response = new QConnectionRequest(QConnectionRequestStatus.SUCCESS, connection.id);
        connection.sendPacket(response);
        connection.onConnect();
        this.onPeerConnected(connection);
      } catch (error) {
        const errorStatus =
          (error as Error).message === 'Max connections reached'
            ? QConnectionRequestStatus.FAILED_MAX_CONNECTION
            : QConnectionRequestStatus.FAILED_ALREADY_CONNECTED;

        const response = new QConnectionRequest(errorStatus, -1);
        const buffer = this.serializer.serialize(response);
        if (buffer) {
          this.socket.send(buffer, rinfo.port, rinfo.address);
        }
      }
    } else if (request.status === QConnectionRequestStatus.SUCCESS && connection) {
      connection.onConnect();
      this.onPeerConnected(connection);
    }
  }

  private handleHeartbeat(heartbeat: QConnectionHeartbeat, connection?: QNetworkConnection) {
    if (!connection) return;

    if (!heartbeat.isReply) {
      heartbeat.isReply = true;
      connection.sendPacket(heartbeat);
    } else {
      connection.ping = (connection.ping + (Date.now() - heartbeat.sentTime) / 2) / 2;
    }
  }

  private handleDisconnect(connection?: QNetworkConnection) {
    if (!connection) return;
    this.removeConnection(connection);
    this.onPeerDisconnected(connection);
  }

  private startConnectionStatusCheck() {
    this.statusCheckInterval = setInterval(() => {
      for (const connection of this.connections.values()) {
        switch (connection.status) {
          case QConnectionStatus.TIMEOUT:
            this.onConnectionTimeout(connection);
            break;
          case QConnectionStatus.CONNECTED:
            if (Date.now() - connection.lastDataReceivedTime > this.connectionTimeout) {
              this.onConnectionTimeout(connection);
            }
            break;
        }
      }
    }, 2000);
  }

  // Callback handlers - can be overridden
  protected onPeerConnected(connection: QNetworkConnection) {
    console.log(`[QNETWORK MANAGER] A new peer has connected with id ${connection.id}`);
  }

  protected onPeerDisconnected(connection: QNetworkConnection) {
    console.log(`[QNETWORK MANAGER] A peer has disconnected with id ${connection.id}`);
  }

  protected onConnectionTimeout(connection: QNetworkConnection) {
    this.removeConnection(connection);
    console.log(`[CONNECTION TIMEOUT] No response detected from connection: ${connection.id}`);
  }

  protected onMessage(message: any, connection: QNetworkConnection) {
    // Override this to handle custom messages
  }
}
