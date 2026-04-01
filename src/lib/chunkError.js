// ─── Chunk error detection — shared between lazyWithRetry and ErrorBoundary ───
// Stale-chunk errors occur when a new Cloudflare deployment invalidates old
// chunk hashes and a user's cached index.js tries to load a file that no
// longer exists on the CDN.
const CHUNK_ERROR_STRINGS = [
  'Failed to fetch dynamically imported module',
  'Loading chunk',
  'ChunkLoadError',
  'dynamically imported module',
];

export function isChunkError(err) {
  const msg = err?.message || '';
  return CHUNK_ERROR_STRINGS.some(s => msg.includes(s));
}
