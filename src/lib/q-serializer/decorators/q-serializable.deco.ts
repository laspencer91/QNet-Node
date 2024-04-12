import 'reflect-metadata';
import { SerializableField } from '../q-serializer';
import { _QSerializableContainer } from '../system/q-serializable-container';

export function QSerializable(target: any) {
  Reflect.defineMetadata('name', target.name, target);

  const bufferTypes: SerializableField[] = [];
  const instance = new target();
  const fieldNames = Object.getOwnPropertyNames(instance);

  fieldNames.forEach((fieldName) => {
    const bufferType = Reflect.getMetadata('bufferType', instance, fieldName);
    if (bufferType) {
      bufferTypes.push({
        fieldName,
        bufferType
      });
    }
  });

  if (_QSerializableContainer.instance.bufferTypesMap.has(target.name)) {
    throw Error(`Cannot register more than one Serializable with the same class name. Class: ${target.name}`);
  }

  // Here you can do whatever you want with bufferTypes
  _QSerializableContainer.instance.bufferTypesMap.set(target.name, bufferTypes);
}