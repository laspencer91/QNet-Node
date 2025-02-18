import { GMQSerializationParser } from './gm-qserializer-parser';
import fs from 'fs';
import path from 'path';

// Mock filesystem
jest.mock('fs');
jest.mock('path');

describe('GMQSerializationParser', () => {
  // Mock filesystem setup
  const mockFS = fs as jest.Mocked<typeof fs>;
  const mockPath = path as jest.Mocked<typeof path>;

  beforeEach(() => {
    // Clear all mocks before each test
    jest.clearAllMocks();

    // Setup basic filesystem mocks
    mockFS.existsSync.mockReturnValue(true);
    mockPath.join.mockImplementation((...paths) => paths.join('/'));
    mockPath.basename.mockImplementation((path) => path.split('/').pop() || '');
  });

  describe('Project Initialization', () => {
    test('should find GameMaker project file', () => {
      // @ts-expect-error Jest doesn't know what version of the function we are wanting to mock
      mockFS.readdirSync.mockReturnValueOnce(['project.yyp', 'other.txt']);

      const parser = new GMQSerializationParser('/fake/path');

      expect(mockFS.readdirSync).toHaveBeenCalledWith('/fake/path');
      expect(mockFS.readFileSync).toHaveBeenCalledWith(
        '/fake/path/project.yyp',
        expect.any(Object), // or 'utf8' if we want to be more specific
      );
      expect(parser).toBeInstanceOf(GMQSerializationParser);
    });

    test('should throw error if no project file found', () => {
      // @ts-expect-error Jest doesn't know what version of the function we are wanting to mock
      mockFS.readdirSync.mockReturnValueOnce(['other.txt']);

      expect(() => {
        new GMQSerializationParser('/fake/path');
      }).toThrow('No GameMaker project file (.yyp) found');
    });
  });

  describe('Constructor Parsing', () => {
    beforeEach(() => {
      // Setup basic project structure
      mockFS.readdirSync
        // @ts-expect-error Jest doesn't know what version of the function we are wanting to mock
        .mockReturnValueOnce(['project.yyp'])
        // @ts-expect-error Jest doesn't know what version of the function we are wanting to mock
        .mockReturnValue(['script.gml']);

      mockFS.readFileSync.mockReturnValueOnce(
        JSON.stringify({
          resources: [
            {
              id: { path: 'scripts/script.gml' },
            },
          ],
        }),
      );
    });

    test('should parse basic constructor', () => {
      const mockScript = `
                function Location(_x = buffer_u8, _y = buffer_u16) constructor {
                    x = _x;
                    y = _y;
                }
            `;
      mockFS.readFileSync.mockReturnValue(mockScript);

      const parser = new GMQSerializationParser('/fake/path');
      const serializables = parser.getSerializables();

      expect(serializables).toHaveLength(1);
      expect(serializables[0].name).toBe('Location');
      expect(serializables[0].params).toHaveLength(2);
    });

    test('should parse array types', () => {
      const mockScript = `
                function ArrayTest(_nums = [buffer_u8]) constructor {
                    nums = _nums;
                }
            `;
      mockFS.readFileSync.mockReturnValue(mockScript);

      const parser = new GMQSerializationParser('/fake/path');
      const serializables = parser.getSerializables();

      expect(serializables[0].params[0].isArray).toBe(true);
      expect(serializables[0].params[0].fieldType).toBe('buffer_u8');
    });

    test('should detect manual serialization', () => {
      const mockScript = `
                function CustomSerial() constructor {
                    MANUAL_SERIALIZATION
                    
                    Write = function() {}
                    Read = function() {}
                }
            `;
      mockFS.readFileSync.mockReturnValue(mockScript);

      const parser = new GMQSerializationParser('/fake/path');
      const serializables = parser.getSerializables();

      expect(serializables[0].manualSerialization).toBe(true);
    });
  });

  describe('QSerializer Detection', () => {
    beforeEach(() => {
      mockFS.readdirSync
        // @ts-expect-error Jest doesn't know what version of the function we are wanting to mock
        .mockReturnValueOnce(['project.yyp'])
        // @ts-expect-error Jest doesn't know what version of the function we are wanting to mock
        .mockReturnValue(['network.gml']);

      mockFS.readFileSync.mockReturnValueOnce(
        JSON.stringify({
          resources: [
            {
              id: { path: 'scripts/network.gml' },
            },
          ],
        }),
      );
    });

    test('should find serializable structs in QSerializer definition', () => {
      const mockScript = `
        network = new QNetworkManager({
            structs: [
                Location,
                Player,
                Message
            ]
        });
    `;
      mockFS.readFileSync.mockReturnValue(mockScript);

      const parser = new GMQSerializationParser('/fake/path');
      const serializables = parser.getSerializables();

      expect(serializables).toBeDefined();
      expect(serializables.map((s) => s.name)).toEqual(['Location', 'Player', 'Message']);
    });

    test('should handle duplicate QSerializer definitions', () => {
      const mockScript = `
                network1 = new QNetworkManager({
                    structs: [Location]
                });
                network2 = new QNetworkManager({
                    structs: [Player]
                });
            `;
      mockFS.readFileSync.mockReturnValue(mockScript);

      const parser = new GMQSerializationParser('/fake/path');
      expect(parser.getSerializables()).toBeUndefined();
    });
  });

  describe('Type Validation', () => {
    test('should validate primitive buffer types', () => {
      const mockScript = `
                function Test(_num = buffer_u8) constructor {
                    num = _num;
                }
            `;
      mockFS.readdirSync
        // @ts-expect-error Jest doesn't know what version of the function we are wanting to mock
        .mockReturnValueOnce(['project.yyp'])
        // @ts-expect-error Jest doesn't know what version of the function we are wanting to mock
        .mockReturnValue(['test.gml']);

      mockFS.readFileSync
        .mockReturnValueOnce(
          JSON.stringify({
            resources: [{ id: { path: 'scripts/test.gml' } }],
          }),
        )
        .mockReturnValue(mockScript);

      const parser = new GMQSerializationParser('/fake/path');
      const serializables = parser.getSerializables();

      expect(serializables[0].params[0].fieldType).toBe('buffer_u8');
    });

    test('should validate nested struct types', () => {
      const mockScript = `
                function Location(_x = buffer_u8) constructor {
                    x = _x;
                }
                
                function Player(_loc = Location) constructor {
                    loc = _loc;
                }
            `;
      mockFS.readdirSync
        // @ts-expect-error Jest doesn't know what version of the function we are wanting to mock
        .mockReturnValueOnce(['project.yyp'])
        // @ts-expect-error Jest doesn't know what version of the function we are wanting to mock
        .mockReturnValue(['test.gml']);

      mockFS.readFileSync
        .mockReturnValueOnce(
          JSON.stringify({
            resources: [{ id: { path: 'scripts/test.gml' } }],
          }),
        )
        .mockReturnValue(mockScript);

      const parser = new GMQSerializationParser('/fake/path');
      const serializables = parser.getSerializables();

      expect(serializables).toHaveLength(2);
    });
  });
});
