import { QSerializer, SerializableEntityProps } from './q-serializer';
import { BufferString, QSerializable } from './decorators';


@QSerializable
class MockChatMessageSerializable {
  @BufferString
  sender: string;

  constructor(sender: string) {
    this.sender = sender;
  }
}

const expectedMockChatMessageSerializableEntityProps: SerializableEntityProps<typeof serializables> = {
  serialId: 1,
  name: 'MockChatMessageSerializable',
  serializableFields: [
    { fieldName: 'sender', bufferType: 'buffer_string' }
  ],
  constructor: MockChatMessageSerializable
};

const serializables = [Location, MockChatMessageSerializable];
const serializer = new QSerializer(serializables);

describe('QSerializer', () => {
  it('Registers Serializers As Expected', () => {
    expect(serializer.getSerializableNameById(1)).toEqual(Reflect.getMetadata('name', MockChatMessageSerializable));
    expect(serializer.getSerializableNameById(0)).toEqual(Reflect.getMetadata('name', Location));
  });

  it('gets correct information when calling getSerializableEntity functions', () => {
    expect(serializer.getSerializableEntityPropsByName('MockChatMessageSerializable')).toEqual(expectedMockChatMessageSerializableEntityProps);
    expect(serializer.getSerializableEntityPropsById(1)).toEqual(expectedMockChatMessageSerializableEntityProps);

  });

  it('Serializes basic type properly', () => {
    const expectedArrayContents = [1, 0, 76, 111, 103, 97, 110, 0]; // 0 @ second index, because 2 bytes for id.
    const serializedChatMessage = serializer.serialize(new MockChatMessageSerializable('Logan'));
    console.log(serializedChatMessage?.toJSON());
    expect(Array.from(serializedChatMessage ?? [])).toEqual(expectedArrayContents);
  });

  it('Deserializes basic type properly', () => {
    const expectedArrayContents = [1, 0, 76, 111, 103, 97, 110, 0]; // 0 @ second index, because 2 bytes for id.
    const chatMessage = serializer.deserialize(Buffer.from(expectedArrayContents));
    const expected = new MockChatMessageSerializable('Logan');
    expect(chatMessage).toEqual(expected);
    //expect((new serializables[1]('Logan')) instanceof MockChatMessageSerializable).toBeTruthy();
    expect(chatMessage instanceof MockChatMessageSerializable).toBeTruthy();
  });
});