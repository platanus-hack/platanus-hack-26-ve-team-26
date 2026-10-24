// The video server (data/server.py on a teammate's Mac, behind a tunnel). Found when the page opens
// (?api=, the last one that worked, or the one data/serve.sh published: findApiUrl) and checked
// with retries: if it does not answer, "Subir" says so and the camera and gallery remain, the
// fallback the team agreed on. Imported from data/live's own files, not from 'tridi-live', so this check does
// not pull in MediaPipe.
import { checkApi, findApiUrl, resolveApiUrl } from '../../data/live/src/api.js';

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

// api.url starts as what the page address or this browser already knows, and is final once
// api.checked resolves: read it after awaiting that.
export function createApi() {
  const fallback = import.meta.env.DEV ? DEV_SERVER : null;
  const api = { url: resolveApiUrl({ fallback }), ok: null };
  const find = async () => {
    api.url = await findApiUrl({ fallback });
    return (api.ok = await checkWithRetries(api.url));
  };
  api.checked = find();
  /** Asks again (the upload screen's "Reintentar"), looking for the server anew in case it moved; resolves to whether it answered. */
  api.recheck = () => (api.checked = find());
  return api;
}
