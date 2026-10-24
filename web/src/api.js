// The video server (data/server.py on a teammate's Mac, behind a tunnel). Checked when the page
// opens, with retries: if it does not answer, "Subir" says so and the camera and gallery remain,
// the fallback the team agreed on. Imported from data/live's own files, not from 'tridi-live', so this check does
// not pull in MediaPipe.
import { checkApi, resolveApiUrl } from '../../data/live/src/api.js';

// While developing, data/server.py runs on this port by default (data/README.md).
const DEV_SERVER = 'http://127.0.0.1:8000';

// The tunnel's first request can take longer than one check waits (4 s in data/live): a server
// that is up was shown as off. It is asked again after these pauses before giving up.
const RETRY_AFTER_MS = [1500, 4000];

async function checkWithRetries(url) {
  if (await checkApi(url)) return true;
  for (const pause of RETRY_AFTER_MS) {
    await new Promise((resolve) => setTimeout(resolve, pause));
    if (await checkApi(url)) return true;
  }
  return false;
}

export function createApi() {
  const url = resolveApiUrl({ fallback: import.meta.env.DEV ? DEV_SERVER : null });
  const api = { url, ok: null };
  api.checked = checkWithRetries(url).then((ok) => (api.ok = ok));
  /** Asks again (the upload screen's "Reintentar"); resolves to whether it answered. */
  api.recheck = () => (api.checked = checkWithRetries(api.url).then((ok) => (api.ok = ok)));
  return api;
}
