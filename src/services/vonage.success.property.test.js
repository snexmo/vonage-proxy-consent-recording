'use strict';

const fc = require('fast-check');
const { PassThrough } = require('stream');

// Mock config to avoid loading real env vars
jest.mock('../config', () => ({
  VONAGE_APPLICATION_ID: 'test-app-id',
  VONAGE_PRIVATE_KEY64: Buffer.from('fake-key').toString('base64'),
}));

// Mock jsonwebtoken to avoid real crypto
jest.mock('jsonwebtoken', () => ({
  sign: jest.fn(() => 'mock-jwt-token'),
}));

// We'll configure the https mock per-test
let mockRequestHandler;
jest.mock('https', () => ({
  request: jest.fn((options, callback) => {
    return mockRequestHandler(options, callback);
  }),
}));

const { startRecording } = require('./vonage');

/**
 * Feature: api-driven-recording, Property 7: Successful API response resolves with parsed JSON
 *
 * For any 2xx HTTP status code and valid JSON response body from the Conversations API,
 * startRecording SHALL resolve its Promise with the parsed JSON object.
 *
 * Validates: Requirements 4.3
 */
describe('Property 7: Successful API response resolves with parsed JSON', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('resolves with parsed JSON for any 2xx status code and JSON-serializable object', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 200, max: 299 }),
        fc.jsonValue(),
        async (statusCode, responseObject) => {
          const responseBody = JSON.stringify(responseObject);
          // JSON round-trip is lossy for values like -0, so compare against
          // the canonical parsed representation (what the API actually returns).
          const expected = JSON.parse(responseBody);

          // Configure mock to respond with the given statusCode and body
          mockRequestHandler = (_options, callback) => {
            const res = new PassThrough();
            res.statusCode = statusCode;

            process.nextTick(() => {
              callback(res);
              res.end(responseBody);
            });

            const req = new PassThrough();
            req.end = jest.fn();
            req.write = jest.fn();
            req.on = jest.fn().mockReturnThis();
            return req;
          };

          const result = await startRecording('CON-test-uuid', 'http://example.com/recordings');

          expect(result).toEqual(expected);
        }
      ),
      { numRuns: 100 }
    );
  });
});
