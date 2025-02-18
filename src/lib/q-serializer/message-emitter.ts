import { Constructor } from '@types';

/**
 * A class for managing message listeners and dispatching messages of specific types.
 *
 * @example
 * const messageEmitter = new MessageEmitter();
 * messageEmitter.on(Location, (data) => {
 *   console.log('Recieved Location!', data);
 * });
 */
export class MessageEmitter {
  /**
   * Map to store callbacks for each message type.
   */
  callbacks = new Map<string, Array<(data: any) => void>>();

  /**
   * Registers a callback function for a specific message type.
   * @param type The constructor function representing the message type.
   * @param callback The callback function to be executed when a message of the specified type is received.
   */
  on<T extends Constructor>(type: T, callback: (data: InstanceType<T>) => void) {
    const constructorName = type.name;
    console.log('Registering message listener: ', constructorName);

    // If the constructor name is not in the callbacks map, initialize it with an empty array.
    if (!this.callbacks.has(constructorName)) {
      this.callbacks.set(constructorName, []);
    }

    // Push the callback function to the array of callbacks for the specified message type.
    this.callbacks.get(constructorName)?.push(callback);
  }

  /**
   * Emits a message of a specific type and dispatches it to the registered callback functions.
   * @param type An instance of the message type.
   */
  emit<T extends InstanceType<Constructor>>(type: T) {
    console.log(type.constructor.name);
    const callbacks = this.callbacks.get(type.constructor.name);
    if (callbacks) {
      // Execute each callback function registered for the received message type.
      callbacks.forEach((callback) => callback(type));
    }
  }
}
