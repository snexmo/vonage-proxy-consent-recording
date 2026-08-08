'use strict';

const express = require('express');
const request = require('supertest');

const amdRouter = require('./amd');

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/events/amd', amdRouter);
  return app;
}

describe('POST /events/amd', () => {
  let app;

  beforeEach(() => {
    app = createApp();
  });

  describe('Call Screener sub-states', () => {
    test('sub_state "screener" returns 200 with talk NCCO', async () => {
      const res = await request(app)
        .post('/events/amd')
        .send({ status: 'machine', sub_state: 'screener', call_uuid: 'uuid-1' });

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].action).toBe('talk');
      expect(res.body[0].text).toContain('professionnel de santé');
      expect(res.body[0].language).toBe('fr-FR');
    });

    test('screener message uses Standard voice (not provider/providerOptions)', async () => {
      const res = await request(app)
        .post('/events/amd')
        .send({ status: 'machine', sub_state: 'screener', call_uuid: 'uuid-1' });

      expect(res.body[0].provider).toBeUndefined();
      expect(res.body[0].providerOptions).toBeUndefined();
      expect(res.body[0].language).toBe('fr-FR');
    });

    test('sub_state "screener_message" returns 204', async () => {
      const res = await request(app)
        .post('/events/amd')
        .send({ status: 'machine', sub_state: 'screener_message', call_uuid: 'uuid-2' });

      expect(res.status).toBe(204);
    });

    test('sub_state "human_answered" returns 204', async () => {
      const res = await request(app)
        .post('/events/amd')
        .send({ status: 'human', sub_state: 'human_answered', call_uuid: 'uuid-3' });

      expect(res.status).toBe(204);
    });

    test('sub_state "unknown" returns 204', async () => {
      const res = await request(app)
        .post('/events/amd')
        .send({ status: 'unknown', sub_state: 'unknown', call_uuid: 'uuid-4' });

      expect(res.status).toBe(204);
    });
  });

  describe('Standard AMD events', () => {
    test('status "machine" returns 204', async () => {
      const res = await request(app)
        .post('/events/amd')
        .send({ status: 'machine', call_uuid: 'uuid-5' });

      expect(res.status).toBe(204);
    });

    test('sub_state "machine_with_beep" returns 204', async () => {
      const res = await request(app)
        .post('/events/amd')
        .send({ status: 'machine', sub_state: 'machine_with_beep', call_uuid: 'uuid-6' });

      expect(res.status).toBe(204);
    });

    test('status "human" (no screener) returns 204', async () => {
      const res = await request(app)
        .post('/events/amd')
        .send({ status: 'human', call_uuid: 'uuid-7' });

      expect(res.status).toBe(204);
    });

    test('unknown event returns 204', async () => {
      const res = await request(app)
        .post('/events/amd')
        .send({ status: 'answered', call_uuid: 'uuid-8' });

      expect(res.status).toBe(204);
    });
  });
});
