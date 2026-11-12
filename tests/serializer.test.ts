import { createHash } from 'crypto';
import {
  buffer_s16,
  buffer_string,
  buffer_u8,
  Field,
  GMBuffer,
  lazy,
  QSerializable,
  QSerializer,
  QSerializerError,
} from '../src';
import '../examples/demo-manual';
import {
  ChatMessage,
  CounterMessage,
  messages as demoMessages,
  PlayerState,
  TestBlob,
  TestManual,
  TestVec,
} from '../examples/generated/demo-messages';

/** The string GameMaker's QSerializer builds for the demo list (see __SchemaString in __q_serializer.gml). */
const GML_DEMO_SCHEMA =
  'qnet2' +
  '|PlayerState:player_id=u8,px=s16,py=s16,' +
  '|CounterMessage:value=u32,' +
  '|ChatMessage:from=u8,text=string,' +
  '|TestVec:vx=s16,vy=s16,' +
  '|TestBlob:big=f64,flag=bool,grid=[[u8]],name=string,neg=s32,origin=TestVec,points=[TestVec],' +
  '|TestManual:manual';

const md5u32 = (text: string) => parseInt(createHash('md5').update(text).digest('hex').slice(0, 8), 16);

/** The TestBlob value the GameMaker self-test serializes. */
const blob = () =>
  new TestBlob(
    'hello world',
    new TestVec(-5, 7),
    [new TestVec(1, 2), new TestVec(-3, 4)],
    [[1, 2, 3], [], [255]],
    true,
    1234.5678,
    -100000,
  );

describe('QSerializer', () => {
  const serializer = new QSerializer(demoMessages);

  test('schema string and hash match what GameMaker computes for the same list', () => {
    expect(serializer.schemaString).toBe(GML_DEMO_SCHEMA);
    expect(serializer.schemaHash).toBe(md5u32(GML_DEMO_SCHEMA));
  });

  test('a different order gives a different hash', () => {
    const reordered = new QSerializer([CounterMessage, PlayerState, ChatMessage, TestVec, TestBlob, TestManual]);
    expect(reordered.schemaHash).not.toBe(serializer.schemaHash);
  });

  test('fields are written in alphabetical order, per PROTOCOL.md', () => {
    // type 0, player_id u8 1, px s16 -2, py s16 300
    expect(serializer.serialize(new PlayerState(1, -2, 300)).toString('hex')).toBe('00' + '01' + 'feff' + '2c01');
  });

  test('strings, nested structs, arrays of structs and arrays of arrays: exact bytes', () => {
    const hex = serializer.serialize(blob()).toString('hex');
    const expected =
      '04' + // type id: TestBlob is index 4
      Buffer.from(new Float64Array([1234.5678]).buffer).toString('hex') + // big f64
      '01' + // flag
      '0300' +
      '0300010203' +
      '0000' +
      '0100ff' + // grid: 3 arrays [1,2,3] [] [255]
      Buffer.from('hello world\0').toString('hex') + // name
      '6079feff' + // neg s32 -100000
      'fbff0700' + // origin {vx -5, vy 7}
      '0200' +
      '01000200' +
      'fdff0400'; // points: 2 x TestVec
    expect(hex).toBe(expected);
  });

  test('round trips the demo messages', () => {
    for (const message of [
      blob(),
      new ChatMessage(3, 'hi'),
      new CounterMessage(4000000000),
      new TestManual(42, 'manual'),
    ]) {
      const copy = serializer.deserialize(serializer.serialize(message));
      expect(copy).toBeInstanceOf(message.constructor);
      expect(copy).toEqual(message);
    }
  });

  test('unknown type ids and truncated data read as undefined', () => {
    expect(serializer.deserialize(Buffer.from([250]))).toBeUndefined();
    const bytes = serializer.serialize(blob());
    expect(serializer.deserialize(bytes.subarray(0, 12))).toBeUndefined();
  });

  test('clear errors for programmer mistakes', () => {
    expect(() => serializer.serialize(new PlayerState(1, 'x' as never, 0))).toThrow(/PlayerState.px should be/);
    expect(() => serializer.serialize({})).toThrow(/not a registered message type/);
    expect(() => serializer.serialize(new PlayerState(300, 0, 0))).toThrow(/PlayerState.player_id/);

    class NotDecorated {}
    expect(() => new QSerializer([NotDecorated])).toThrow(QSerializerError);

    @QSerializable
    class UsesUnregistered {
      @Field(TestVec) v = new TestVec();
    }
    expect(() => new QSerializer([UsesUnregistered])).toThrow(/not in the messages list/);
  });

  test('self-referencing structs with lazy()', () => {
    @QSerializable
    class TreeNode {
      @Field(buffer_string) label = '';
      @Field([lazy(() => TreeNode)]) children: TreeNode[] = [];
    }
    const tree = new TreeNode();
    tree.label = 'root';
    const leaf = new TreeNode();
    leaf.label = 'leaf';
    tree.children = [leaf];
    const s = new QSerializer([TreeNode]);
    expect(s.schemaString).toBe('qnet2|TreeNode:children=[TreeNode],label=string,');
    expect(s.deserialize(s.serialize(tree))).toEqual(tree);
  });

  test('a class with its own write/read methods works as a manual message', () => {
    @QSerializable({ manual: true, name: 'Snapshot' })
    class SnapshotMessage {
      tick = 0;
      write(buffer: GMBuffer) {
        buffer.write(this.tick, 'buffer_u32');
      }
      read(buffer: GMBuffer) {
        this.tick = buffer.read('buffer_u32');
      }
    }
    @QSerializable
    class Pos {
      @Field(buffer_s16) x = 0;
      @Field(buffer_u8) id = 0;
    }
    const s = new QSerializer([SnapshotMessage, Pos]);
    expect(s.schemaString).toBe('qnet2|Snapshot:manual|Pos:id=u8,x=s16,');
    const snap = new SnapshotMessage();
    snap.tick = 99;
    expect(s.serialize(snap).toString('hex')).toBe('0063000000');
    expect((s.deserialize(s.serialize(snap)) as SnapshotMessage).tick).toBe(99);
  });
});

/** Printed so the GameMaker self-test can assert the same bytes and hash. */
test('cross-check values for the GameMaker self-test', () => {
  const serializer = new QSerializer(demoMessages);
  console.log(`schema_hash=${serializer.schemaHash}\nTestBlob hex=${serializer.serialize(blob()).toString('hex')}`);
});
