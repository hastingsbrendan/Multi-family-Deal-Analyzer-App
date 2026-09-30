// ─── Auth gate routing ────────────────────────────────────────────────────────
// Decides what App renders for a signed-out visitor. Kept pure so App's render
// stays free of side effects.
//
// The routing intent must be read from the URL ONCE, at mount. App strips the
// #app / #signup hash right after showing the auth screen, and re-renders on
// every Supabase auth event (getSession, INITIAL_SESSION, signUp). Re-reading the
// live URL on each render is what bounced every new visitor from the auth screen
// back to /landing.

// 'signup' | 'login' | 'callback' | null
export function readAuthIntent(hash = '', search = '') {
  if (hash === '#signup') return 'signup';
  if (hash === '#app')    return 'login';
  // Auth callback params (email verify, password reset) must NOT redirect to landing
  if (search.includes('code=') || search.includes('type=') ||
      hash.includes('access_token') || hash.includes('type=recovery')) return 'callback';
  return null;
}

// 'loading' | 'app' | 'auth' | 'redirect'
export function resolveAuthGate({ authLoading, user, authIntent }) {
  if (authLoading) return 'loading';
  if (user)        return 'app';
  return authIntent ? 'auth' : 'redirect';
}

// Intent applies to one signed-out visit. Clearing it on sign-in keeps sign-out
// returning to the landing page rather than the auth screen.
export function consumeAuthIntent(authIntent, user) {
  return user ? null : authIntent;
}
