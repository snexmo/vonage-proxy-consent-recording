'use strict';

const fc = require('fast-check');
const express = require('express');
const request = require('supertest');

const nccoRouter = require('./ncco');

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/', nccoRouter);
  return app;
}

/**
 * Feature: simple-proxy-recording, Property 4: Patient NCCO is always empty
 *
 * **Validates: Requirements 3.1, 3.2**
 *
 * For any request to the patient NCCO endpoint (GET or POST, with any query
 * parameters or body content), the response SHALL be an empty JSON array [].
 */
describe('Property 4: Patient NCCO is always empty', () => {
  let app;

  beforeEach(() => {
    app = createApp();
  });

  test('GET /ncco/patient with any random query parameters always returns [] with status 200', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.dictionary(
          fc.string({ minLength: 1, maxLength: 20 }).filter(s => /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(s)),
          fc.oneof(
            fc.string({ minLength: 0, maxLength: 50 }),
            fc.integer().map(String),
            fc.boolean().map(String),
            fc.constant('')
          )
        ),
        async (queryParams) => {
          const queryString = Object.entries(queryParams)
            .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
            .join('&');

          const url = queryString ? `/ncco/patient?${queryString}` : '/ncco/patient';
          const res = await request(app).get(url);

          expect(res.status).toBe(200);
          expect(res.headers['content-type']).toMatch(/application\/json/);
          expect(res.body).toEqual([]);
        }
      ),
      { numRuns: 100 }
    );
  });

  test('POST /ncco/patient with any random JSON body always returns [] with status 200', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.jsonValue(),
        async (body) => {
          const res = await request(app)
            .post('/ncco/patient')
            .send(typeof body === 'object' && body !== null ? body : { value: body });

          expect(res.status).toBe(200);
          expect(res.headers['content-type']).toMatch(/application\/json/);
          expect(res.body).toEqual([]);
        }
      ),
      { numRuns: 100 }
    );
  });
});
