import { BufferBool, BufferS16, BufferU32, BufferU8, QSerializable } from '@q-serializable-decorators';

export enum QConnectionRequestStatus {
  REQUESTED = 0,
  SUCCESS = 1,
  FAILED_MAX_CONNECTION = 2,
  FAILED_ALREADY_CONNECTED = 3,
}

@QSerializable
export class QConnectionRequest {
  @BufferU8
  status: QConnectionRequestStatus;

  @BufferS16
  assignedId: number;

  constructor(status: QConnectionRequestStatus, assignedId: number) {
    this.status = status;
    this.assignedId = assignedId;
  }
}

@QSerializable
export class QConnectionHeartbeat {
  @BufferU32
  sentTime: number;

  @BufferBool
  isReply: boolean;

  constructor(sentTime: number, isReply: boolean) {
    this.sentTime = sentTime;
    this.isReply = isReply;
  }
}

@QSerializable
export class QConnectionDisconnect {
  constructor() {}
}
