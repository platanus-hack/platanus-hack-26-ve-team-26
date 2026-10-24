// The video server (data/server.py on Juan's Mac, behind a tunnel). Checked once when the page
// opens: if it does not answer, "Subir" hides and the camera and gallery remain, the fallback the
// team agreed on. Imported from data/live's own files, not from 'tridi-live', so this check does
// not pull in MediaPipe.
import { checkApi, resolveApiUrl } from '../../data/live/src/api.js';

// While developing, data/server.py runs on this port by default (data/README.md).
const DEV_SERVER = 'http://127.0.0.1:8000';

export function createApi() {
  const url = resolveApiUrl({ fallback: import.meta.env.DEV ? DEV_SERVER : null });
  const api = { url, ok: null };
  api.checked = checkApi(url).then((ok) => (api.ok = ok));
  return api;
}
