const express = require('express');
const request = require('supertest');
const fs = require('fs');
const path = require('path');

// Mock the vonage service
jest.mock('../services/vonage', () => ({
  generateJwt: jest.fn(() => 'mock-jwt-token'),
  deleteMedia: jest.fn(() => Promise.resolve()),
}));

// Mock https module to avoid real network calls
jest.mock('https', () => {
  const { PassThrough } = require('stream');
  return {
    request: jest.fn((options, callback) => {
      const response = new PassThrough();
      response.statusCode = 200;
      // Simulate a response with some data
      process.nextTick(() => {
        callback(response);
        response.end(Buffer.from('fake-mp3-data'));
      });
      const req = new PassThrough();
      req.end = jest.fn();
      return req;
    }),
  };
});

// Mock config
jest.mock('../config', () => ({
  VONAGE_APPLICATION_ID: 'test-app-id',
  VONAGE_PRIVATE_KEY64: 'dGVzdC1rZXk=',
}));

const { router: recordingsRouter } = require('./recordings');

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/recordings', recordingsRouter);
  return app;
}

describe('POST /recordings', () => {
  let app;
  let consoleSpy;

  beforeEach(() => {
    app = createApp();
    consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    jest.spyOn(console, 'error').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  const validPayload = {
    recording_url: 'https://api.nexmo.com/v1/files/rec-uuid-123',
    recording_uuid: 'rec-uuid-123',
    conversation_uuid: 'conv-uuid-456',
    start_time: '2026-08-06T10:00:00Z',
    end_time: '2026-08-06T10:10:00Z',
    size: 12345,
    status: 'ok',
  };

  test('returns 200 immediately', async () => {
    const res = await request(app)
      .post('/recordings')
      .send(validPayload);

    expect(res.status).toBe(200);
  });

  test('logs recording metadata with all fields', async () => {
    await request(app)
      .post('/recordings')
      .send(validPayload);

    expect(consoleSpy).toHaveBeenCalledWith('[RECORDING] Metadata received:');
    expect(consoleSpy).toHaveBeenCalledWith(`  recording_uuid: ${validPayload.recording_uuid}`);
    expect(consoleSpy).toHaveBeenCalledWith(`  conversation_uuid: ${validPayload.conversation_uuid}`);
    expect(consoleSpy).toHaveBeenCalledWith(`  recording_url: ${validPayload.recording_url}`);
    expect(consoleSpy).toHaveBeenCalledWith(`  start_time: ${validPayload.start_time}`);
    expect(consoleSpy).toHaveBeenCalledWith(`  end_time: ${validPayload.end_time}`);
    expect(consoleSpy).toHaveBeenCalledWith(`  size: ${validPayload.size}`);
    expect(consoleSpy).toHaveBeenCalledWith(`  status: ${validPayload.status}`);
  });

  test('generates JWT for authenticated download', async () => {
    const { generateJwt } = require('../services/vonage');

    await request(app)
      .post('/recordings')
      .send(validPayload);

    // Allow async download to start
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(generateJwt).toHaveBeenCalled();
  });

  test('makes authenticated GET request to recording_url', async () => {
    const https = require('https');

    await request(app)
      .post('/recordings')
      .send(validPayload);

    // Allow async download to start
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(https.request).toHaveBeenCalledWith(
      expect.objectContaining({
        hostname: 'api.nexmo.com',
        path: '/v1/files/rec-uuid-123',
        method: 'GET',
        headers: expect.objectContaining({
          Authorization: 'Bearer mock-jwt-token',
        }),
      }),
      expect.any(Function)
    );
  });

  test('calls deleteMedia with recording_url after successful download', async () => {
    const { deleteMedia } = require('../services/vonage');

    await request(app)
      .post('/recordings')
      .send(validPayload);

    // Allow async download and delete to complete
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(deleteMedia).toHaveBeenCalledWith(validPayload.recording_url);
  });
});
