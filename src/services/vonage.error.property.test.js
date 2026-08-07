'use strict';

/**
 * Property 4: API errors produce descriptive rejections
 *
 * For any non-2xx HTTP status code and response body returned by the
 * Conversations API, startRecording SHALL reject its Promise with an Error
 * whose message contains both the status code and the response body text.
 *
 * **Validates: Requirements 2.4, 4.4**
 */

const fc = require('fast-check');
const { EventEmitter } = require('events');

// Mock config to avoid loading .env / real keys
jest.mock('../config', () => ({
  VONAGE_APPLICATION_ID: 'test-app-id',
  VONAGE_PRIVATE_KEY64: Buffer.from('fake-key').toString('base64'),
}));

// Mock jsonwebtoken to avoid real crypto
jest.mock('jsonwebtoken', () => ({
  sign: () => 'mocked-jwt-token',
}));

describe('Property 4: API errors produce descriptive rejections', () => {
  let vonage;
  let mockHttps;

  beforeEach(() => {
    // Clear module cache to get fresh requires with our mock
    jest.resetModules();

    // Re-apply mocks after resetModules
    jest.mock('../config', () => ({
      VONAGE_APPLICATION_ID: 'test-app-id',
      VONAGE_PRIVATE_KEY64: Buffer.from('fake-key').toString('base64'),
    }));
    jest.mock('jsonwebtoken', () => ({
      sign: () => 'mocked-jwt-token',
    }));

    // Mock the https module
    mockHttps = {
      request: jest.fn(),
    };
    jest.mock('https', () => mockHttps);

    vonage = require('./vonage');
  });

  it('rejects with Error containing status code and body for non-2xx responses', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 400, max: 599 }),
        fc.string(),
        async (statusCode, rawBody) => {
          // Wrap the generated string as valid JSON so it goes through
          // the normal JSON.parse path in startRecording
          const responseBody = JSON.stringify(rawBody);

          // Create a mock response that emits data and end events
          const mockResponse = new EventEmitter();
          mockResponse.statusCode = statusCode;

          // Create a mock request that emits nothing bad
          const mockRequest = new EventEmitter();
          mockRequest.write = jest.fn();
          mockRequest.end = jest.fn();

          mockHttps.request.mockImplementation((options, callback) => {
            // Simulate async response
            process.nextTick(() => {
              callback(mockResponse);
              mockResponse.emit('data', responseBody);
              mockResponse.emit('end');
            });
            return mockRequest;
          });

          // Call startRecording and expect rejection
          await expect(
            vonage.startRecording('CON-test-uuid', 'http://example.com/recordings')
          ).rejects.toThrow();

          // Get the actual error
          let caughtError;
          try {
            await vonage.startRecording('CON-test-uuid', 'http://example.com/recordings');
          } catch (err) {
            caughtError = err;
          }

          // Verify the error message contains the status code
          expect(caughtError.message).toContain(String(statusCode));
          // Verify the error message contains the response body text
          expect(caughtError.message).toContain(responseBody);
        }
      ),
      { numRuns: 100 }
    );
  });
});
