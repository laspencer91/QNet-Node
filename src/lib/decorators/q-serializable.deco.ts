import { _QSerializableContainer } from '../gm-buffer-interface';

export function QSerializable(target: any) {
  Reflect.defineMetadata('name', target.name, target);

  const bufferTypes: string[] = [];
  const instance = new target();
  const keys = Object.getOwnPropertyNames(instance);
  console.log(target.name);
  console.log(keys);

  keys.forEach((key) => {
    const bufferType = Reflect.getMetadata('bufferType', instance, key);
    if (bufferType) {
      bufferTypes.push(bufferType);
    }
  });

  // Here you can do whatever you want with bufferTypes
  _QSerializableContainer.instance.bufferTypesMap.set(target.name, bufferTypes);
}