module.exports = {
  // Use ts-jest for TypeScript support
  preset: 'ts-jest',
  testEnvironment: 'node',

  // Root directory for tests
  rootDir: '.',

  // Test file patterns - only CLI tests
  testMatch: [
    '<rootDir>/tests/cli/**/*.test.ts',
    '<rootDir>/tests/cli/**/*.spec.ts',
  ],

  // Disable coverage for CLI tests to avoid compilation issues
  collectCoverage: false,

  // Module name mapper for cleaner imports
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },

  // Performance and timeout settings
  testTimeout: 20000, // 20 seconds for CLI tests
  maxWorkers: '50%', // Use 50% of available CPU cores

  // Test result formatting
  verbose: true,

  // Transform configuration with more lenient TypeScript settings
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        // Test-specific TypeScript configuration
        tsconfig: {
          target: 'ES2020',
          module: 'CommonJS',
          esModuleInterop: true,
          skipLibCheck: true,
          allowJs: true,
          strict: false,
          moduleResolution: 'node',
          noUnusedLocals: false,
          noUnusedParameters: false,
          noImplicitAny: false
        }
      },
    ],
  },

  // Ignore patterns
  testPathIgnorePatterns: [
    '/node_modules/',
    '/dist/',
    '/coverage/',
  ],

  // Clear mocks between tests
  clearMocks: true,
  restoreMocks: true,
};