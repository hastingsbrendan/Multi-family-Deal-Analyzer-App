import { describe, test, expect } from 'vitest';
import { readAuthIntent, resolveAuthGate, consumeAuthIntent } from '../authGate.js';

describe('readAuthIntent', () => {
  test('#app (landing "Log in" CTA) → login', () => {
    expect(readAuthIntent('#app', '')).toBe('login');
  });

  test('#signup (landing "Try it free" CTA) → signup', () => {
    expect(readAuthIntent('#signup', '')).toBe('signup');
  });

  test('no hash, no params → null (first visit)', () => {
    expect(readAuthIntent('', '')).toBeNull();
  });

  test('missing args → null', () => {
    expect(readAuthIntent()).toBeNull();
  });

  test('unrelated landing anchor → null', () => {
    expect(readAuthIntent('#how', '')).toBeNull();
  });

  test('PKCE ?code= callback → callback', () => {
    expect(readAuthIntent('', '?code=abc123')).toBe('callback');
  });

  test('?type=signup email verify → callback', () => {
    expect(readAuthIntent('', '?type=signup')).toBe('callback');
  });

  test('legacy implicit #access_token → callback', () => {
    expect(readAuthIntent('#access_token=x&type=signup', '')).toBe('callback');
  });

  test('#type=recovery password reset → callback', () => {
    expect(readAuthIntent('#type=recovery', '')).toBe('callback');
  });
});

describe('resolveAuthGate', () => {
  test('auth loading → loading, regardless of intent', () => {
    expect(resolveAuthGate({ authLoading: true, user: null, authIntent: null })).toBe('loading');
    expect(resolveAuthGate({ authLoading: true, user: null, authIntent: 'login' })).toBe('loading');
  });

  test('signed in → app', () => {
    expect(resolveAuthGate({ authLoading: false, user: { id: 'u1' }, authIntent: null })).toBe('app');
  });

  test('signed out with login intent → auth', () => {
    expect(resolveAuthGate({ authLoading: false, user: false, authIntent: 'login' })).toBe('auth');
  });

  test('signed out with signup intent → auth', () => {
    expect(resolveAuthGate({ authLoading: false, user: false, authIntent: 'signup' })).toBe('auth');
  });

  test('signed out with callback intent → auth', () => {
    expect(resolveAuthGate({ authLoading: false, user: false, authIntent: 'callback' })).toBe('auth');
  });

  test('signed out, no intent → redirect to landing', () => {
    expect(resolveAuthGate({ authLoading: false, user: false, authIntent: null })).toBe('redirect');
  });

  test('user null (pre-auth initial state) treated as signed out', () => {
    expect(resolveAuthGate({ authLoading: false, user: null, authIntent: null })).toBe('redirect');
  });
});

describe('consumeAuthIntent', () => {
  test('keeps intent while signed out', () => {
    expect(consumeAuthIntent('login', false)).toBe('login');
    expect(consumeAuthIntent('signup', null)).toBe('signup');
  });

  test('clears intent once signed in', () => {
    expect(consumeAuthIntent('login', { id: 'u1' })).toBeNull();
  });
});

// Regression: every new visitor was bounced from the auth screen back to /landing.
// App stripped the #app hash during render, then re-rendered on Supabase auth
// events (getSession + INITIAL_SESSION both call setUser, signUp fires another).
// The re-render re-read the now-empty hash and redirected. Intent must be read
// from the URL once, at mount, and survive re-renders.
describe('regression: landing CTA survives auth re-renders', () => {
  test('#app → auth screen persists after hash is stripped and auth events re-render', () => {
    const url = { hash: '#app', search: '' };
    const intent = readAuthIntent(url.hash, url.search); // captured once at mount

    // Render 1: session check in flight
    expect(resolveAuthGate({ authLoading: true, user: null, authIntent: intent })).toBe('loading');
    // Render 2: getSession resolved with no session
    expect(resolveAuthGate({ authLoading: false, user: false, authIntent: intent })).toBe('auth');

    url.hash = ''; // App strips the hash after showing the auth screen

    // Render 3: onAuthStateChange INITIAL_SESSION → setUser(false)
    expect(resolveAuthGate({ authLoading: false, user: false, authIntent: intent })).toBe('auth');
    // Render 4: signUp with email confirmation required → session null → setUser(false)
    expect(resolveAuthGate({ authLoading: false, user: false, authIntent: intent })).toBe('auth');
  });

  test('#signup → auth screen persists across the same sequence', () => {
    const intent = readAuthIntent('#signup', '');
    for (let i = 0; i < 3; i++) {
      expect(resolveAuthGate({ authLoading: false, user: false, authIntent: intent })).toBe('auth');
    }
  });

  test('sign-in then sign-out still returns to landing (intent consumed on sign-in)', () => {
    let intent = readAuthIntent('#app', '');
    const user = { id: 'u1' };

    intent = consumeAuthIntent(intent, user);
    expect(resolveAuthGate({ authLoading: false, user, authIntent: intent })).toBe('app');

    // handleSignOut → onAuthStateChange SIGNED_OUT → setUser(false)
    intent = consumeAuthIntent(intent, false);
    expect(resolveAuthGate({ authLoading: false, user: false, authIntent: intent })).toBe('redirect');
  });
});
