'use strict';

const express = require('express');
const request = require('supertest');

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
      process.nextTick(() => {
        callback(response);
        response.end(JSON.stringify({ transcript: 'mock data' }));
      });
      const req = new PassThrough();
      req.end = jest.fn();
      return req;
    }),
  };
});

const { router: transcriptionsRouter } = require('./transcriptions');

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/transcriptions', transcriptionsRouter);
  return app;
}

describe('POST /transcriptions', () => {
  let app;

  beforeEach(() => {
    app = createApp();
  });

  test('returns 200 for successful transcription webhook', async () => {
    const res = await request(app)
      .post('/transcriptions')
      .send({
        conversation_uuid: 'CON-abc123',
        recording_uuid: 'rec-uuid-456',
        status: 'transcribed',
        transcription_url: 'https://api.nexmo.com/v1/files/tx-file-789',
        provider: 'deepgram',
        type: 'record',
      });

    expect(res.status).toBe(200);
  });

  test('logs transcription_url on success', async () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation();

    await request(app)
      .post('/transcriptions')
      .send({
        conversation_uuid: 'CON-abc123',
        recording_uuid: 'rec-uuid-456',
        status: 'transcribed',
        transcription_url: 'https://api.nexmo.com/v1/files/tx-file-789',
        provider: 'aws',
        type: 'record',
      });

    const allLogs = logSpy.mock.calls.flat().join(' ');
    expect(allLogs).toContain('Completed successfully');
    expect(allLogs).toContain('https://api.nexmo.com/v1/files/tx-file-789');
    expect(allLogs).toContain('aws');

    logSpy.mockRestore();
  });

  test('returns 200 for failed transcription webhook', async () => {
    const res = await request(app)
      .post('/transcriptions')
      .send({
        conversation_uuid: 'CON-abc123',
        recording_uuid: 'rec-uuid-456',
        status: 'transcription_failed',
        error: 'Provider timeout',
        provider: 'deepgram',
      });

    expect(res.status).toBe(200);
  });

  test('logs error on failure', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation();

    await request(app)
      .post('/transcriptions')
      .send({
        conversation_uuid: 'CON-abc123',
        recording_uuid: 'rec-uuid-456',
        status: 'transcription_failed',
        error: 'Provider timeout',
        provider: 'deepgram',
      });

    const allErrors = errorSpy.mock.calls.flat().join(' ');
    expect(allErrors).toContain('Failed');
    expect(allErrors).toContain('Provider timeout');

    errorSpy.mockRestore();
  });

  test('handles Vonage built-in transcription (no provider field)', async () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation();

    await request(app)
      .post('/transcriptions')
      .send({
        conversation_uuid: 'CON-abc123',
        recording_uuid: 'rec-uuid-456',
        status: 'transcribed',
        transcription_url: 'https://api.nexmo.com/v1/files/tx-vonage',
        type: 'record',
      });

    const allLogs = logSpy.mock.calls.flat().join(' ');
    expect(allLogs).toContain('vonage (built-in)');

    logSpy.mockRestore();
  });

  test('handles unknown status gracefully', async () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation();

    const res = await request(app)
      .post('/transcriptions')
      .send({
        conversation_uuid: 'CON-abc123',
        status: 'processing',
      });

    expect(res.status).toBe(200);
    const allLogs = logSpy.mock.calls.flat().join(' ');
    expect(allLogs).toContain('processing');

    logSpy.mockRestore();
  });

  test('calls deleteMedia with transcription_url after successful download', async () => {
    const { deleteMedia } = require('../services/vonage');
    jest.spyOn(console, 'log').mockImplementation();

    await request(app)
      .post('/transcriptions')
      .send({
        conversation_uuid: 'CON-abc123',
        recording_uuid: 'rec-uuid-456',
        status: 'transcribed',
        transcription_url: 'https://api.nexmo.com/v1/files/tx-file-789',
        provider: 'aws',
        type: 'record',
      });

    // Allow async download and delete to complete
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(deleteMedia).toHaveBeenCalledWith('https://api.nexmo.com/v1/files/tx-file-789');
  });
});
