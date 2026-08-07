const express = require('express');
const request = require('supertest');

const eventsRouter = require('./events');

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/events', eventsRouter);
  return app;
}

describe('POST /events', () => {
  let app;
  let consoleSpy;
  let consoleWarnSpy;

  beforeEach(() => {
    app = createApp();
    consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('returns 200 for any event', async () => {
    const res = await request(app)
      .post('/events')
      .send({ status: 'completed', conversation_uuid: 'CON-abc123' });

    expect(res.status).toBe(200);
  });

  test('logs warning for unanswered status', async () => {
    const event = { status: 'unanswered', uuid: 'call-1' };

    await request(app)
      .post('/events')
      .send(event);

    expect(consoleWarnSpy).toHaveBeenCalledWith('[EVENT WARNING]', 'unanswered', event);
  });

  test('logs warning for failed status', async () => {
    const event = { status: 'failed', uuid: 'call-2' };

    await request(app)
      .post('/events')
      .send(event);

    expect(consoleWarnSpy).toHaveBeenCalledWith('[EVENT WARNING]', 'failed', event);
  });

  test('logs normal event for other statuses', async () => {
    const event = { status: 'completed', conversation_uuid: 'CON-xyz' };

    await request(app)
      .post('/events')
      .send(event);

    expect(consoleSpy).toHaveBeenCalledWith('[EVENT]', 'completed', event);
  });

  test('logs event type when status is absent', async () => {
    const event = { type: 'transfer' };

    await request(app)
      .post('/events')
      .send(event);

    expect(consoleSpy).toHaveBeenCalledWith('[EVENT]', 'transfer', event);
  });

  test('logs "unknown" when neither status nor type is present', async () => {
    const event = { foo: 'bar' };

    await request(app)
      .post('/events')
      .send(event);

    expect(consoleSpy).toHaveBeenCalledWith('[EVENT]', 'unknown', event);
  });
});

describe('POST /events/connect', () => {
  let app;
  let consoleSpy;
  let consoleWarnSpy;

  beforeEach(() => {
    app = createApp();
    consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('returns 200 for any connect event', async () => {
    const res = await request(app)
      .post('/events/connect')
      .send({ status: 'answered' });

    expect(res.status).toBe(200);
  });

  test('logs warning for unanswered patient', async () => {
    const event = { status: 'unanswered', uuid: 'leg-1' };

    await request(app)
      .post('/events/connect')
      .send(event);

    expect(consoleWarnSpy).toHaveBeenCalledWith('[EVENT/CONNECT WARNING] Patient did not answer:', event);
  });

  test('logs warning for failed connect', async () => {
    const event = { status: 'failed', uuid: 'leg-2' };

    await request(app)
      .post('/events/connect')
      .send(event);

    expect(consoleWarnSpy).toHaveBeenCalledWith('[EVENT/CONNECT WARNING]', 'failed', event);
  });

  test('logs normal event for answered status', async () => {
    const event = { status: 'answered', uuid: 'leg-3' };

    await request(app)
      .post('/events/connect')
      .send(event);

    expect(consoleSpy).toHaveBeenCalledWith('[EVENT/CONNECT]', 'answered', event);
  });
});
