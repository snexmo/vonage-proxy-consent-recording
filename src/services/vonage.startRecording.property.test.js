'use strict';

const fc = require('fast-check');

/**
 * Property 2: Recording request body is correctly constructed
 *
 * For any valid conversation UUID and event URL, the request body constructed
 * by startRecording SHALL contain exactly: action "start", split "conversation",
 * channels 2, event_url as a single-element array containing the provided URL,
 * event_method "POST", and format "mp3".
 *
 * Also verifies request path and HTTP method.
 *
 * **Validates: Requirements 2.2, 4.2**
 */

// Mock https module before requiring vonage
jest.mock('https', () => ({
  request: jest.fn(),
}));

// Mock generateJwt to avoid needing real crypto keys
jest.mock('./vonage', () => {
  const actual = jest.requireActual('./vonage');
  return {
    ...actual,
    generateJwt: jest.fn(() => 'mock-jwt-token'),
  };
});

// We need to mock generateJwt at the module level since it's called internally.
// The vonage module uses generateJwt internally, so we need a different approach:
// We'll mock the dependencies that generateJwt needs.
jest.unmock('./vonage');
jest.unmock('https');

// Reset and use a manual approach: mock https.request and the jwt/config dependencies
jest.mock('https');
jest.mock('jsonwebtoken', () => ({
  sign: jest.fn(() => 'mock-jwt-token'),
}));
jest.mock('../config', () => ({
  VONAGE_PRIVATE_KEY64: Buffer.from('fake-private-key').toString('base64'),
  VONAGE_APPLICATION_ID: 'test-app-id',
}));

const https = require('https');
const { startRecording } = require('./vonage');

describe('Property 2: Recording request body is correctly constructed', () => {
  let capturedOptions;
  let capturedBody;

  beforeEach(() => {
    capturedOptions = null;
    capturedBody = null;

    // Mock https.request to capture the options and body
    https.request.mockImplementation((options, callback) => {
      capturedOptions = options;

      // Simulate a successful response
      const mockRes = {
        statusCode: 200,
        on: jest.fn((event, handler) => {
          if (event === 'data') {
            handler(JSON.stringify({ id: 'rec-123', status: 'started' }));
          }
          if (event === 'end') {
            handler();
          }
        }),
      };

      // Call the callback with the mock response on next tick
      process.nextTick(() => callback(mockRes));

      // Return a mock request object
      const mockReq = {
        on: jest.fn(),
        write: jest.fn((body) => {
          capturedBody = body;
        }),
        end: jest.fn(),
      };
      return mockReq;
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('constructs the correct request body for any conversationUuid and eventUrl', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.webUrl(),
        async (conversationUuid, eventUrl) => {
          capturedOptions = null;
          capturedBody = null;

          await startRecording(conversationUuid, eventUrl);

          // Verify body was written
          expect(capturedBody).not.toBeNull();
          const parsedBody = JSON.parse(capturedBody);

          // Verify all required fields
          expect(parsedBody.action).toBe('start');
          expect(parsedBody.split).toBe('conversation');
          expect(parsedBody.channels).toBe(2);
          expect(parsedBody.event_url).toEqual([eventUrl]);
          expect(parsedBody.event_method).toBe('POST');
          expect(parsedBody.format).toBe('mp3');

          // Verify no extra fields
          const expectedKeys = ['action', 'split', 'channels', 'event_url', 'event_method', 'format'];
          expect(Object.keys(parsedBody).sort()).toEqual(expectedKeys.sort());

          // Verify request path
          expect(capturedOptions.path).toBe(`/v1/conversations/${conversationUuid}/record`);

          // Verify HTTP method is PUT
          expect(capturedOptions.method).toBe('PUT');
        }
      ),
      { numRuns: 100 }
    );
  });
});
