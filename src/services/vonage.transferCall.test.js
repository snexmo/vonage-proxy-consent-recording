'use strict';

const http = require('http');
const { transferCall } = require('./vonage');

// Mock config
jest.mock('../config', () => ({
  VONAGE_APPLICATION_ID: 'test-app-id',
  // Minimal RSA private key for testing (DO NOT use in production)
  VONAGE_PRIVATE_KEY64: Buffer.from(
    require('crypto').generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    }).privateKey
  ).toString('base64'),
}));

describe('transferCall', () => {
  let server;
  let serverPort;
  let lastRequest;

  beforeAll((done) => {
    // Create a local HTTP server to capture the request
    server = http.createServer((req, res) => {
      let body = '';
      req.on('data', (chunk) => { body += chunk; });
      req.on('end', () => {
        lastRequest = {
          method: req.method,
          path: req.url,
          headers: req.headers,
          body: body ? JSON.parse(body) : null,
        };

        // Default: return 204 (typical transfer response)
        if (lastRequest.path.includes('fail')) {
          res.writeHead(400);
          res.end(JSON.stringify({ error: 'Bad Request' }));
        } else {
          res.writeHead(204);
          res.end();
        }
      });
    });
    server.listen(0, () => {
      serverPort = server.address().port;
      done();
    });
  });

  afterAll((done) => {
    server.close(done);
  });

  beforeEach(() => {
    lastRequest = null;
    // Override https to use our local HTTP server
    jest.spyOn(require('https'), 'request').mockImplementation((options, callback) => {
      // Redirect to our local HTTP server
      const httpOptions = {
        hostname: '127.0.0.1',
        port: serverPort,
        path: options.path,
        method: options.method,
        headers: options.headers,
      };
      return http.request(httpOptions, callback);
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('makes PUT request to /v1/calls/{callUuid}', async () => {
    const ncco = [{ action: 'conversation', name: 'rec-test-123', startOnEnter: true }];
    await transferCall('call-uuid-abc', ncco);

    expect(lastRequest.method).toBe('PUT');
    expect(lastRequest.path).toBe('/v1/calls/call-uuid-abc');
  });

  test('sends transfer action with inline NCCO in body', async () => {
    const ncco = [{ action: 'conversation', name: 'rec-test-456', startOnEnter: true }];
    await transferCall('call-uuid-def', ncco);

    expect(lastRequest.body).toEqual({
      action: 'transfer',
      destination: {
        type: 'ncco',
        ncco: [{ action: 'conversation', name: 'rec-test-456', startOnEnter: true }],
      },
    });
  });

  test('includes Authorization header with Bearer token', async () => {
    const ncco = [{ action: 'conversation', name: 'rec-test' }];
    await transferCall('call-uuid-ghi', ncco);

    expect(lastRequest.headers.authorization).toMatch(/^Bearer /);
    // JWT should have 3 dot-separated parts
    const token = lastRequest.headers.authorization.replace('Bearer ', '');
    expect(token.split('.')).toHaveLength(3);
  });

  test('includes Content-Type application/json header', async () => {
    const ncco = [{ action: 'conversation', name: 'rec-test' }];
    await transferCall('call-uuid-jkl', ncco);

    expect(lastRequest.headers['content-type']).toBe('application/json');
  });

  test('resolves with empty object on 204 response', async () => {
    const ncco = [{ action: 'conversation', name: 'rec-test' }];
    const result = await transferCall('call-uuid-mno', ncco);
    expect(result).toEqual({});
  });

  test('rejects with error on non-2xx response', async () => {
    const ncco = [{ action: 'conversation', name: 'rec-test' }];
    await expect(transferCall('fail-uuid', ncco))
      .rejects.toThrow(/Vonage API error \(400\)/);
  });
});
