// Where the video server is. It runs on Juan's Mac behind a Cloudflare quick tunnel whose URL
// changes on every start, so the web cannot hardcode it. data/serve.sh writes the URL to a gist on
// every start (null when it stops), and findApiUrl reads it: the web's plain address finds the
// server. ?api=<url> still wins (the phone's QR carries it, and it points a page at another server),
// and the last URL that worked is remembered on the browser.

const STORAGE_KEY = 'tridi.api';

// /health answers in milliseconds; 4 s covers the tunnel's first request, which is slower.
const HEALTH_TIMEOUT_MS = 4000;

// The gist data/serve.sh writes (its id is also in that script). Read through GitHub's API first:
// it is fresh within ~15 s of an edit, but allows 60 reads an hour per IP without a token. The raw
// file has no such limit but is cached for up to 5 minutes, so it is only the fallback. The
// remembered URL is tried before either, so a visitor only reads the gist when the server moved.
export const SERVER_GIST = { user: 'juanevillam', id: '78eb7f16b9c2d8d21a9abfe6607a98da', file: 'tridi-api.json' };
const GIST_TIMEOUT_MS = 4000;

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

function remember(url) {
  try {
    localStorage.setItem(STORAGE_KEY, url);
  } catch {
    /* storage blocked (private mode): nothing to remember */
  }
}

/**
 * The URL data/serve.sh published, or null (no server running, or GitHub unreachable).
 * @param dead  a URL already known not to answer: when a source still gives it (the API's copy can
 *   lag an edit by a minute), the next source is asked, as the raw file is often already fresh.
 */
export async function publishedApiUrl(gist = SERVER_GIST, { dead = null } = {}) {
  const sources = [
    [`https://api.github.com/gists/${gist.id}`, (body) => JSON.parse(body.files[gist.file].content)],
    [`https://gist.githubusercontent.com/${gist.user}/${gist.id}/raw/${gist.file}`, (body) => body],
  ];
  for (const [url, read] of sources) {
    try {
      // no-store: the browser would keep its copy for the API's max-age (60 s) on top of GitHub's
      // own, and a restarted server stayed "off" for two minutes.
      const res = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(GIST_TIMEOUT_MS) });
      if (!res.ok) continue; // the API answers 403 past its hourly limit: try the raw file
      const { url: published } = read(await res.json());
      const found = published ? valid(published) : null; // null: serve.sh stopped
      if (found && found === dead) continue;
      return found;
    } catch {
      /* offline or malformed: try the next source */
    }
  }
  return null;
}

/**
 * Like resolveApiUrl, but finds the server on its own: ?api= in the page address if it answers, else
 * `fallback` if it answers, else the last one seen on this browser if it still answers, else the
 * one data/serve.sh published, else `fallback`.
 * null if there is none.
 */
export async function findApiUrl({ fallback = null } = {}) {
  const fromQuery = valid(new URLSearchParams(location.search).get('api') ?? '');
  // An old link keeps a tunnel that died with its serve.sh: if it does not answer, look on.
  if (fromQuery && (await checkApi(fromQuery))) {
    remember(fromQuery);
    return fromQuery;
  }
  // A local server (the dev fallback) answers at once, or refuses at once when it is off: try it
  // before a remembered tunnel or the gist, whose copy lags a restart by up to a minute.
  if (fallback && (await checkApi(fallback))) return fallback;
  let stored = null;
  try {
    stored = valid(localStorage.getItem(STORAGE_KEY) ?? '');
  } catch {
    /* storage blocked */
  }
  if (stored && (await checkApi(stored))) return stored;
  const published = await publishedApiUrl(SERVER_GIST, { dead: stored });
  if (published) {
    remember(published);
    return published;
  }
  return fromQuery ?? fallback ?? stored;
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
