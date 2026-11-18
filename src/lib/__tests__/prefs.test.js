import { describe, test, expect, vi, beforeEach } from 'vitest';

// sbWritePrefs updated the prefs row and inserted only if the update *errored*.
// Updating zero rows isn't an error, so accounts without a prefs row (all of them)
// never saved their defaults (2026-11 review).
globalThis.__results = [];
globalThis.__queries = [];
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: { getSession: async () => ({ data: { session: { user: { id: 'user-1' } } } }) },
    from: (table) => {
      const entry = { table, calls: [] };
      globalThis.__queries.push(entry);
      const q = {};
      ['update', 'insert', 'eq', 'is', 'select'].forEach(m => { q[m] = (...a) => { entry.calls.push([m, ...a]); return q; }; });
      q.then = (res, rej) => Promise.resolve(globalThis.__results.shift() ?? { data: null, error: null }).then(res, rej);
      return q;
    },
  }),
}));
vi.mock('@sentry/react', () => ({ addBreadcrumb: () => {}, captureMessage: () => {}, captureException: () => {} }));

const { sbWritePrefs } = await import('../constants.js');
const ops = () => globalThis.__queries.map(q => q.calls[0][0]);

beforeEach(() => { globalThis.__results = []; globalThis.__queries = []; });

describe('sbWritePrefs', () => {
  test('inserts a prefs row when none exists', async () => {
    globalThis.__results = [{ data: [], error: null }, { data: null, error: null }];
    await sbWritePrefs({ vacancyRate: 6 });
    expect(ops()).toEqual(['update', 'insert']);
    expect(globalThis.__queries[1].calls[0][1]).toMatchObject({ user_id: 'user-1', prefs: { vacancyRate: 6 } });
  });

  test('only updates when the row exists', async () => {
    globalThis.__results = [{ data: [{ deal_id: 'p1' }], error: null }];
    await sbWritePrefs({ vacancyRate: 6 });
    expect(ops()).toEqual(['update']);
  });

  test('throws on errors so Settings can say it failed', async () => {
    globalThis.__results = [{ data: null, error: { message: 'boom' } }];
    await expect(sbWritePrefs({})).rejects.toThrow('WritePrefs: boom');
  });
});
