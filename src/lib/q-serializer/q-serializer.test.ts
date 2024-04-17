import { QSerializer, SerializableEntity } from './q-serializer';
import { BufferArray, BufferString, BufferU8, QSerializable } from './decorators';
import { Location } from '../../serializables/location';

@QSerializable
class MockChatMessageSerializable {
  @BufferString
  sender: string;

  constructor(sender: string) {
    this.sender = sender;
  }
}

@QSerializable
class MockLocationsContainerSerializable {
  @BufferU8
  id: number;

  @BufferArray(Location)
  locations: Array<Location>;

  constructor(id: number, locations: Array<Location>) {
    this.id = id;
    this.locations = locations;
  }
}

@QSerializable
class MockLocationsContainerContainerSerializable {
  @BufferArray(MockLocationsContainerSerializable)
  container: Array<MockLocationsContainerSerializable>;

  constructor(container: Array<MockLocationsContainerSerializable>) {
    this.container = container;
  }
}

const expectedMockChatMessageSerializableEntityProps: SerializableEntity = {
  serialId: 1,
  name: 'MockChatMessageSerializable',
  serializableFields: [{ fieldName: 'sender', bufferType: 'buffer_string' }],
  constructor: MockChatMessageSerializable,
};

const serializables = [
  Location,
  MockChatMessageSerializable,
  MockLocationsContainerSerializable,
  MockLocationsContainerContainerSerializable,
];
const serializer = new QSerializer(serializables);

describe('QSerializer', () => {
  it('Registers Serializers As Expected', () => {
    expect(serializer.getSerializableNameById(1)).toEqual(Reflect.getMetadata('name', MockChatMessageSerializable));
    expect(serializer.getSerializableNameById(0)).toEqual(Reflect.getMetadata('name', Location));
  });

  it('gets correct information when calling getSerializableEntity functions', () => {
    expect(serializer.getSerializableEntityPropsByName('MockChatMessageSerializable')).toEqual(
      expectedMockChatMessageSerializableEntityProps,
    );
    expect(serializer.getSerializableEntityPropsById(1)).toEqual(expectedMockChatMessageSerializableEntityProps);
  });

  it('Serializes basic type properly', () => {
    const expectedArrayContents = [1, 0, 76, 111, 103, 97, 110, 0]; // 0 @ second index, because 2 bytes for id.
    const serializedChatMessage = serializer.serialize(new MockChatMessageSerializable('Logan'));
    expect(Array.from(serializedChatMessage ?? [])).toEqual(expectedArrayContents);
  });

  it('Deserializes basic type properly', () => {
    const expectedArrayContents = [1, 0, 76, 111, 103, 97, 110, 0]; // 0 @ second index, because 2 bytes for id.
    const chatMessage = serializer.deserialize<typeof MockChatMessageSerializable>(Buffer.from(expectedArrayContents));
    const expected = new MockChatMessageSerializable('Logan');
    expect(chatMessage).toEqual(expected);
    expect(chatMessage instanceof MockChatMessageSerializable).toBeTruthy();
  });

  it('Serializes a serializable array.', () => {
    const expectedArrayContents = [2, 0, 1, 3, 0, 11, 12, 0, 21, 22, 0, 31, 32, 0];
    const locationContainer = new MockLocationsContainerSerializable(1, [
      new Location(11, 12),
      new Location(21, 22),
      new Location(31, 32),
    ]);
    const resultBuffer = serializer.serialize(locationContainer);
    expect(Array.from(resultBuffer ?? [])).toEqual(expectedArrayContents);
  });

  it('Serializes nested serializable arrays.', () => {
    const expectedArrayContents = [
      3, //  Serial ID - BYTE 1
      0, //  Serial ID - BYTE 2
      3, //  Location container array elements count. - U16 - BYTE #1
      0, //  Location container array elements count. - U16 - BYTE #2
      1, //  LocationContainer id #1 - U8 --------------------------------
      3, //  LocationContainers' location array length - U16 - BYTE #1
      0, //  LocationContainers' location array length - U16 - BYTE #2
      11, // LOCATION X - U8
      12, // LOCATION Y - U16 - BYTE 1
      0, //  LOCATION Y - U16 - BYTE 2
      21, // LOCATION X - U8
      22, // LOCATION Y - U16 - BYTE 1
      0, //  LOCATION Y - U16 - BYTE 2
      31, // LOCATION X - U8
      32, // LOCATION Y - U16 - BYTE 1
      0, //  LOCATION Y - U16 - BYTE 2
      2, //  LocationContainer id #2 - U8 --------------------------------
      3, //  LocationContainers' location array length - U16 - BYTE #1
      0, //  LocationContainers' location array length - U16 - BYTE #2
      41, // LOCATION X - U8
      42, // LOCATION Y - U16 - BYTE 1
      0, //  LOCATION Y - U16 - BYTE 2
      51, // LOCATION X - U8
      52, // LOCATION Y - U16 - BYTE 1
      0, //  LOCATION Y - U16 - BYTE 2
      61, // LOCATION X - U8
      62, // LOCATION Y - U16 - BYTE 1
      0, //  LOCATION Y - U16 - BYTE 2
      3, //  LocationContainer id #3 - U8 --------------------------------
      3, //  LocationContainers' location array length - U16 - BYTE #1
      0, //  LocationContainers' location array length - U16 - BYTE #2
      71, // LOCATION X - U8
      72, // LOCATION Y - U16 - BYTE 1
      0, //  LOCATION Y - U16 - BYTE 2
      81, // LOCATION X - U8
      82, // LOCATION Y - U16 - BYTE 1
      0, //  LOCATION Y - U16 - BYTE 2
      91, // LOCATION X - U8
      92, // LOCATION Y - U16 - BYTE 1
      0, //  LOCATION Y - U16 - BYTE 2
    ];
    const masterContainer = new MockLocationsContainerContainerSerializable([
      new MockLocationsContainerSerializable(1, [new Location(11, 12), new Location(21, 22), new Location(31, 32)]),
      new MockLocationsContainerSerializable(2, [new Location(41, 42), new Location(51, 52), new Location(61, 62)]),
      new MockLocationsContainerSerializable(3, [new Location(71, 72), new Location(81, 82), new Location(91, 92)]),
    ]);
    const resultBuffer = serializer.serialize(masterContainer);
    expect(Array.from(resultBuffer ?? [])).toEqual(expectedArrayContents);
  });
});
