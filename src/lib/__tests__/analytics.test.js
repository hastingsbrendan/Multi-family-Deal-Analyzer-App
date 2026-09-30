import { describe, test, expect, vi } from 'vitest';

// PostHog loads lazily (its own chunk) — calls made before it arrives must be queued
// and replayed in order, and init must run exactly once.
const calls = [];
vi.mock('posthog-js', () => ({
  default: {
    init: (...a) => calls.push(['init', a[0]]),
    capture: (e, p) => calls.push(['capture', e, p]),
    identify: (id) => calls.push(['identify', id]),
    reset: () => calls.push(['reset']),
  },
}));

const { initAnalytics, track, identifyUser, resetAnalyticsUser } = await import('../analytics.js');

describe('analytics — lazy PostHog', () => {
  test('events before PostHog loads are queued, then replayed in order after init', async () => {
    track('before_init', { a: 1 });
    identifyUser({ id: 'u1', email: 'x@example.com', created_at: '2026-01-01' });
    expect(calls).toEqual([]);

    await initAnalytics();
    expect(calls.map(c => c[0])).toEqual(['init', 'capture', 'identify']);
    expect(calls[1]).toEqual(['capture', 'before_init', { a: 1 }]);
  });

  test('after loading, calls go straight through; init runs only once', async () => {
    await initAnalytics();
    track('after_init');
    resetAnalyticsUser();
    expect(calls.filter(c => c[0] === 'init')).toHaveLength(1);
    expect(calls.slice(-2)).toEqual([['capture', 'after_init', {}], ['reset']]);
  });

  test('identifyUser ignores a missing user', async () => {
    const n = calls.length;
    identifyUser(null);
    expect(calls).toHaveLength(n);
  });
});
