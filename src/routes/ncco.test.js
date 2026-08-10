'use strict';

const express = require('express');
const request = require('supertest');

const nccoRouter = require('./ncco');

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
  });

  test('returns 200 with empty NCCO array', async () => {
    const res = await request(app).get('/ncco/patient');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  test('returns empty array regardless of query params', async () => {
    const res = await request(app).get('/ncco/patient?conversation_uuid=CON-123');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});

describe('POST /ncco/patient', () => {
  let app;

  beforeEach(() => {
    app = createApp();
  });

  test('returns 200 with empty NCCO array', async () => {
    const res = await request(app)
      .post('/ncco/patient')
      .send({ conversation_uuid: 'CON-456' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  test('returns empty array regardless of body content', async () => {
    const res = await request(app)
      .post('/ncco/patient')
      .send({ foo: 'bar', conversation_uuid: 'CON-789' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});
