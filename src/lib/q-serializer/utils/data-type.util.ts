import { Constructor, GameMakerBufferType } from '@types';
import { SerializableType } from '../q-serializer';

export const DataType = {
  isArray: (dt: SerializableType): dt is Constructor[] | GameMakerBufferType[] => Array.isArray(dt),
  isSerializable: (dt: SerializableType): dt is Constructor => typeof dt === 'function',
};
