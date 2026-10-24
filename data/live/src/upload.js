// Client for the video server (data/server.py, API in docs/contrato.md): chunked upload with
// retries, then the job's progress until it ends. Works in the browser and in Node 18+.

// A failed chunk is retried up to 4 times, waiting 1, 2, 4 and 8 s: covers a phone switching
// networks or the tunnel reconnecting, without hiding a server that is really down.
const RETRIES = 4;

// The web polls the job twice a second: progress looks live and the server barely notices.
const POLL_MS = 500;

export class UploadError extends Error {}

async function call(url, init) {
  const res = await fetch(url, init);
  if (!res.ok) {
    const detail = await res.json().then((b) => b.detail).catch(() => null);
    throw new UploadError(detail ?? `el servidor respondió ${res.status}`);
  }
  return res.json();
}

/**
 * Uploads a File or Blob (a video or a .zip of videos) and returns its job id.
 * @param baseUrl   the server's public URL, e.g. https://xxxx.trycloudflare.com
 * @param file      File (its name is sent) or Blob with options.filename
 * @param options.onProgress  ({ sent, total }) in bytes, after every chunk
 * @param options.signal      AbortSignal to cancel
 */
export async function uploadVideo(baseUrl, file, { filename = file.name, onProgress, signal } = {}) {
  const base = baseUrl.replace(/\/$/, '');
  const up = await call(`${base}/uploads`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ filename, size: file.size }),
    signal,
  });
  let sent = 0;
  for (let i = 0; i < up.total_chunks; i++) {
    const chunk = file.slice(i * up.chunk_size, (i + 1) * up.chunk_size);
    for (let attempt = 0; ; attempt++) {
      try {
        await call(`${base}/uploads/${up.upload_id}/chunks/${i}`, {
          method: 'PUT',
          headers: { 'content-type': 'application/octet-stream' },
          body: chunk,
          signal,
        });
        break;
      } catch (e) {
        // Server-side refusals (UploadError) will not change on retry; network errors may.
        if (e instanceof UploadError || signal?.aborted || attempt === RETRIES) throw e;
        await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
      }
    }
    sent += chunk.size;
    onProgress?.({ sent, total: file.size });
  }
  const { job_id } = await call(`${base}/uploads/${up.upload_id}/complete`, { method: 'POST', signal });
  return job_id;
}

/**
 * Follows a job until it is "done" or "failed", calling onUpdate with every new state
 * (the JSON of GET /jobs/{id}). Returns the last state.
 */
export async function watchJob(baseUrl, jobId, { onUpdate, signal } = {}) {
  const base = baseUrl.replace(/\/$/, '');
  for (;;) {
    const job = await call(`${base}/jobs/${jobId}`, { signal });
    onUpdate?.(job);
    if (job.state === 'done' || job.state === 'failed') return job;
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
}

/** Picks another person (pixels of the video's first_frame) and re-processes that video. */
export async function chooseSubject(baseUrl, jobId, videoIndex, x, y) {
  const base = baseUrl.replace(/\/$/, '');
  return call(`${base}/jobs/${jobId}/videos/${videoIndex}/subject`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ x, y }),
  });
}

/** URL of the first frame with people, to draw the `people` boxes over it. */
export const firstFrameUrl = (baseUrl, jobId, videoIndex) =>
  `${baseUrl.replace(/\/$/, '')}/jobs/${jobId}/videos/${videoIndex}/first-frame.jpg`;

/** The finished PoseClip. */
export const fetchClip = (baseUrl, clipId) => call(`${baseUrl.replace(/\/$/, '')}/clips/${clipId}.json`);
