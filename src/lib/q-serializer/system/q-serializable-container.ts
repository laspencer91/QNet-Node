import { SerializableField } from '../q-serializer';

export class _QSerializableContainer {
  private static _instance: _QSerializableContainer;

  public readonly bufferTypesMap = new Map<string, Array<SerializableField>>();

  static get instance() {
    if (!this._instance) {
      this._instance = new _QSerializableContainer();
    }
    return this._instance;
  }
}