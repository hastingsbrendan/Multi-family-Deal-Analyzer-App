import { describe, test, expect, vi, beforeEach } from 'vitest';

// constants.js builds the Supabase client at import time. Swap in a stub whose
// functions.invoke each test can program. vi.mock is hoisted, so the mock state
// lives on globalThis (same trick as groups.test.js).
globalThis.__invoke = vi.fn();
globalThis.__captureException = vi.fn();

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: {},
    functions: { invoke: (...args) => globalThis.__invoke(...args) },
  }),
}));

vi.mock('@sentry/react', () => ({
  addBreadcrumb:    () => {},
  captureMessage:   () => {},
  captureException: (...args) => globalThis.__captureException(...args),
}));

import { sbSubmitFeedback } from '../constants.js';

const USER = { email: 'buyer@example.com', user_metadata: { display_name: 'Pat Buyer' } };

beforeEach(() => {
  globalThis.__invoke.mockReset();
  globalThis.__captureException.mockReset();
  globalThis.__invoke.mockResolvedValue({ data: { ok: true }, error: null });
});

describe('sbSubmitFeedback', () => {
  test('calls the submit-feedback edge function via functions.invoke', async () => {
    await sbSubmitFeedback({ user: USER, category: 'Bug report', message: 'hi', url: 'https://renthack.io/' });
    expect(globalThis.__invoke).toHaveBeenCalledTimes(1);
    expect(globalThis.__invoke.mock.calls[0][0]).toBe('submit-feedback');
  });

  test('sends user details, trimmed message, url and timestamp', async () => {
    await sbSubmitFeedback({ user: USER, category: 'Bug report', message: '  broken chart  ', url: 'https://renthack.io/#deal' });
    const { body } = globalThis.__invoke.mock.calls[0][1];
    expect(body).toMatchObject({
      email:    'buyer@example.com',
      name:     'Pat Buyer',
      category: 'Bug report',
      message:  'broken chart',
      url:      'https://renthack.io/#deal',
    });
    expect(Number.isNaN(Date.parse(body.ts))).toBe(false);
  });

  test('falls back to anonymous when there is no user', async () => {
    await sbSubmitFeedback({ user: null, category: 'Question', message: 'q', url: '' });
    const { body } = globalThis.__invoke.mock.calls[0][1];
    expect(body.email).toBe('anonymous');
    expect(body.name).toBe('');
  });

  test('resolves when the function succeeds', async () => {
    await expect(sbSubmitFeedback({ user: USER, category: 'Question', message: 'q', url: '' })).resolves.toBeUndefined();
    expect(globalThis.__captureException).not.toHaveBeenCalled();
  });

  // Regression: the modal used a raw fetch with no Authorization header. The edge
  // function has verify_jwt on, so every submission got a 401 — and because the
  // modal never checked the response, users were told "Thanks for the feedback!"
  // while nothing was saved.
  test('throws when the function rejects the request (e.g. 401)', async () => {
    const httpErr = Object.assign(new Error('Edge Function returned a non-2xx status code'), { name: 'FunctionsHttpError' });
    globalThis.__invoke.mockResolvedValue({ data: null, error: httpErr });
    await expect(sbSubmitFeedback({ user: USER, category: 'Question', message: 'q', url: '' })).rejects.toBe(httpErr);
  });

  test('reports failures to Sentry so they are no longer silent', async () => {
    const httpErr = new Error('Edge Function returned a non-2xx status code');
    globalThis.__invoke.mockResolvedValue({ data: null, error: httpErr });
    await sbSubmitFeedback({ user: USER, category: 'Question', message: 'q', url: '' }).catch(() => {});
    expect(globalThis.__captureException).toHaveBeenCalledTimes(1);
    expect(globalThis.__captureException.mock.calls[0][0]).toBe(httpErr);
  });

  test('propagates network failures thrown by invoke', async () => {
    globalThis.__invoke.mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(sbSubmitFeedback({ user: USER, category: 'Question', message: 'q', url: '' })).rejects.toThrow('Failed to fetch');
  });
});
