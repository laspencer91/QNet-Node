/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  moduleDirectories: ['node_modules', '<rootDir>'],
  moduleNameMapper: {
    '@types': '<rootDir>/src/lib/types/index.ts',
    '@q-serializable-decorators': '<rootDir>/src/lib/q-serializer/decorators',
    '@generated/(.+)$': '<rootDir>/generated/$1',
  },
};
