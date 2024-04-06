import { QSerializable } from './types/q-serializable.interface';
import { _QSerializableContainer } from './gm-buffer-interface';

export class QSerializer {
  serializables: QSerializable[];

  constructor(serializables: QSerializable[]) {
    this.serializables = serializables;
    this.serializables.forEach(s => {
      const className = Reflect.getMetadata('name', s);
      if (_QSerializableContainer.instance.bufferTypesMap.has(className)) {
        throw Error(`Cannot register more than one Serializable with the same class name. Class: ${className}`);
      }
      console.log(`Registering ${className} with buffers: `, _QSerializableContainer.instance.bufferTypesMap.get(className));
    });
  }

  serialize<T extends QSerializable>(serializable: T) {

  }
}