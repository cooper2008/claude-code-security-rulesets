module.exports = {
  // Use ts-jest for TypeScript support
  preset: 'ts-jest',
  testEnvironment: 'node',

  // Root directory for tests
  rootDir: '.',

  // Test file patterns
  testMatch: [
    '<rootDir>/tests/**/*.test.ts',
    '<rootDir>/tests/**/*.spec.ts',
  ],

  // Coverage configuration for validation testing
  collectCoverage: true,
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html', 'json'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/**/index.ts',
    '!src/cli/index.ts',
  ],
  // Coverage thresholds to ensure comprehensive testing
  coverageThreshold: {
    global: {
      branches: 90,
      functions: 90,
      lines: 90,
      statements: 90
    },
    'src/validation/': {
      branches: 95,
      functions: 95,
      lines: 95,
      statements: 95
    }
  },

  // Module name mapper for cleaner imports
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },

  // Performance and timeout settings
  testTimeout: 10000, // 10 seconds max per test
  maxWorkers: '50%', // Use 50% of available CPU cores

  // Test result formatting
  verbose: true,

  // Transform configuration
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
          moduleResolution: 'node'
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