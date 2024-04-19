export type NestedArray<T> = T | NestedArray<T>[];

export type Constructor<T = object> = new (...args: any[]) => T;
