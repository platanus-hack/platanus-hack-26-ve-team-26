// Where the video server is. It runs on Juan's Mac behind a Cloudflare quick tunnel whose URL
// changes on every start, so the web cannot hardcode it: data/serve.sh prints a link to the web
// with ?api=<url>, and the page remembers it for later visits on the same browser.

const STORAGE_KEY = 'tridi.api';

// /health answers in milliseconds; 4 s covers the tunnel's first request, which is slower.
const HEALTH_TIMEOUT_MS = 4000;

function valid(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.origin : null;
  } catch {
    return null;
  }
}

/**
 * The server's base URL: ?api= in the page address, else the last one seen on this browser,
 * else `fallback` (e.g. 'http://127.0.0.1:8000' while developing). null if there is none.
 */
export function resolveApiUrl({ fallback = null } = {}) {
  const fromQuery = valid(new URLSearchParams(location.search).get('api') ?? '');
  try {
    if (fromQuery) localStorage.setItem(STORAGE_KEY, fromQuery);
    return fromQuery ?? valid(localStorage.getItem(STORAGE_KEY) ?? '') ?? fallback;
  } catch {
    return fromQuery ?? fallback; // storage blocked (private mode): the link still works
  }
}

/** true if the server answers /health: show the "Subir" tab only then, and the gallery otherwise. */
export async function checkApi(baseUrl) {
  if (!baseUrl) return false;
  try {
    const res = await fetch(`${baseUrl}/health`, { signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS) });
    return res.ok && (await res.json()).ok === true;
  } catch {
    return false;
  }
}
