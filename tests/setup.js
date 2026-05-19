/**
 * Jest Setup File
 * Configure test environment, mocks, and globals
 */

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-min-16-characters';
process.env.SESSION_SECRET = 'test-session-secret-min-16-chars';
process.env.MONGODB_URI = 'mongodb://localhost:27017/careerpilot-test';
process.env.JWT_EXPIRATION = '15m';

// Suppress console logs during tests unless DEBUG is set
if (!process.env.DEBUG) {
  global.console = {
    ...console,
    log: jest.fn(),
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };
}

// Set test timeout
jest.setTimeout(10000);

// Clean up after all tests
afterAll(async () => {
  // Give connections time to close
  await new Promise(resolve => setTimeout(resolve, 500));
});
