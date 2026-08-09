'use strict';

const express = require('express');
const request = require('supertest');

// Mock config
jest.mock('../config', () => ({
  BASE_URL: 'https://example.ngrok.io',
}));

// Mock callState service
jest.mock('../services/callState', () => ({
  getCallOptions: jest.fn().mockReturnValue({
    voiceTier: 'standard',
    transcriptionProvider: 'none',
    amdEnabled: true,
  }),
}));

const nccoRouter = require('./ncco');
const { getCallOptions } = require('../services/callState');

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/', nccoRouter);
  return app;
}

describe('GET /ncco/patient', () => {
  let app;

  beforeEach(() => {
    app = createApp();
    jest.clearAllMocks();
    getCallOptions.mockReturnValue({ voiceTier: 'standard' });
  });

  test('returns 200 with NCCO array', async () => {
    const res = await request(app).get('/ncco/patient');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(2);
  });

  test('first action is talk with consent prompt text', async () => {
    const res = await request(app).get('/ncco/patient');
    expect(res.body[0].action).toBe('talk');
    expect(res.body[0].text).toContain('Appuyez sur 1');
    expect(res.body[0].bargeIn).toBe(true);
  });

  test('second action is input with DTMF config', async () => {
    const res = await request(app).get('/ncco/patient');
    expect(res.body[1].action).toBe('input');
    expect(res.body[1].type).toEqual(['dtmf']);
    expect(res.body[1].dtmf.maxDigits).toBe(1);
    expect(res.body[1].dtmf.timeOut).toBe(10);
    expect(res.body[1].eventUrl).toEqual(['https://example.ngrok.io/consent']);
  });

  describe('Standard voice tier', () => {
    test('talk action uses language and style', async () => {
      getCallOptions.mockReturnValue({ voiceTier: 'standard' });
      const res = await request(app).get('/ncco/patient');
      expect(res.body[0].language).toBe('fr-FR');
      expect(res.body[0].style).toBe(0);
      expect(res.body[0].provider).toBeUndefined();
    });
  });

  describe('Premium voice tier', () => {
    test('talk action uses language, style, and premium: true', async () => {
      getCallOptions.mockReturnValue({ voiceTier: 'premium' });
      const res = await request(app).get('/ncco/patient');
      expect(res.body[0].language).toBe('fr-FR');
      expect(res.body[0].style).toBe(0);
      expect(res.body[0].premium).toBe(true);
      expect(res.body[0].provider).toBeUndefined();
    });
  });

  describe('Premier voice tier (Chirp3 HD)', () => {
    test('talk action uses provider and providerOptions', async () => {
      getCallOptions.mockReturnValue({ voiceTier: 'premier' });
      const res = await request(app).get('/ncco/patient');
      expect(res.body[0].provider).toBe('google');
      expect(res.body[0].providerOptions.name).toBe('fr-FR-Chirp3-HD-Aoede');
      expect(res.body[0].providerOptions.language_code).toBe('fr-FR');
      expect(res.body[0].language).toBeUndefined();
      expect(res.body[0].style).toBeUndefined();
    });
  });

  test('defaults to standard when callOptions is null', async () => {
    getCallOptions.mockReturnValue(null);
    const res = await request(app).get('/ncco/patient');
    expect(res.body[0].language).toBe('fr-FR');
    expect(res.body[0].style).toBe(0);
  });
});

describe('POST /ncco/patient', () => {
  let app;

  beforeEach(() => {
    app = createApp();
    jest.clearAllMocks();
    getCallOptions.mockReturnValue({ voiceTier: 'standard' });
  });

  test('returns same NCCO structure as GET', async () => {
    const getRes = await request(app).get('/ncco/patient');
    const postRes = await request(app)
      .post('/ncco/patient')
      .send({ conversation_uuid: 'conv-post-123' });

    expect(postRes.status).toBe(200);
    expect(postRes.body).toEqual(getRes.body);
  });

  test('uses Premier voice tier when configured', async () => {
    getCallOptions.mockReturnValue({ voiceTier: 'premier' });
    const res = await request(app)
      .post('/ncco/patient')
      .send({ conversation_uuid: 'conv-post-456' });

    expect(res.body[0].provider).toBe('google');
    expect(res.body[0].providerOptions.name).toBe('fr-FR-Chirp3-HD-Aoede');
  });
});
