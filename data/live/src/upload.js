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

// --- Camera clips and training (docs/contrato.md, "Clips de la cámara y entrenamiento") -----------

// The contract asks the web to poll a training every ~2 s: a checkpoint takes minutes.
const TRAIN_POLL_MS = 2000;

// A training is followed for half an hour or more, through a tunnel that can drop for a moment:
// network errors are retried, and only 5 in a row (about 10 s of silence) end the watch.
const TRAIN_NETWORK_RETRIES = 5;

/** Sends a camera PoseClip to the server, which stores it under its own id. Returns that id. */
export async function sendClip(baseUrl, clip, { signal } = {}) {
  const { clip_id } = await call(`${baseUrl.replace(/\/$/, '')}/clips`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(clip),
    signal,
  });
  return clip_id;
}

/** Queues a server clip for training. Returns its train id (the same one if it was already queued or trained). */
export async function trainClip(baseUrl, clipId, { signal } = {}) {
  const { train_id } = await call(`${baseUrl.replace(/\/$/, '')}/clips/${clipId}/train`, { method: 'POST', signal });
  return train_id;
}

/** Stops a training, queued or running (DELETE /train/{id}): it stops using the server's CPU at once. */
export async function cancelTraining(baseUrl, trainId) {
  const res = await fetch(`${baseUrl.replace(/\/$/, '')}/train/${trainId}`, { method: 'DELETE' });
  // 404: it was already gone (cancelled from another tab, or the server forgot it), which is what we wanted.
  if (!res.ok && res.status !== 404) throw new UploadError(`el servidor respondió ${res.status}`);
}

/**
 * Follows a training until it is "done" or "failed", calling onUpdate with every state
 * (the JSON of GET /train/{id}). Returns the last state.
 */
export async function watchTraining(baseUrl, trainId, { onUpdate, signal } = {}) {
  const base = baseUrl.replace(/\/$/, '');
  for (let failures = 0; ; ) {
    let train;
    try {
      train = await call(`${base}/train/${trainId}`, { signal });
      failures = 0;
    } catch (e) {
      if (e instanceof UploadError || signal?.aborted || ++failures > TRAIN_NETWORK_RETRIES) throw e;
    }
    if (train) {
      onUpdate?.(train);
      if (train.state === 'done' || train.state === 'failed') return train;
    }
    await new Promise((r) => setTimeout(r, TRAIN_POLL_MS));
  }
}
