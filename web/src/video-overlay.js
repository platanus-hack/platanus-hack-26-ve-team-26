// The person's pane, for a clip whose source video is in the repo: the recording the robot learned
// from, with its skeleton drawn over it in the signal lime (the 2D points MediaPipe found in each frame,
// scripts/make-video-overlay.py). Clips without a video keep the 3D skeleton (skeleton.js).
const BASE = import.meta.env.BASE_URL;

// Clip id -> its source video and 2D skeleton (public/media).
export const VIDEOS = {
  'clip_2026-10-23_caminar-perfil_01': { video: 'media/caminar.mp4', pose: 'media/caminar.pose2d.json', credit: 'Mixkit 4855' },
};

// The bones to draw, as MediaPipe Pose indices: shoulders, arms, torso, hips, legs and feet.
const BONES = [
  [11, 12], [11, 13], [13, 15], [12, 14], [14, 16], [11, 23], [12, 24], [23, 24],
  [23, 25], [25, 27], [27, 29], [29, 31], [27, 31], [24, 26], [26, 28], [28, 30], [30, 32], [28, 32],
];
const MIN_VISIBILITY = 0.5; // as data/live's drawSkeleton and MediaPipe's own drawing
const SIGNAL = '#c8ff2e'; // the brand's signal color, as the 3D skeleton

/**
 * The 2D skeleton drawn over a video, frame by frame: on the frame nearest to `time` of the pose file
 * (scripts/make-video-overlay.py), placed the way CSS fits the video in its box.
 * @param fit  'contain' (the whole picture, bars around it) or 'cover' (it fills the box, cropped)
 * @returns {{ load(url): Promise<void>, draw(time): void, clear(): void, ready(): boolean, duration(): number }}
 */
export function createPoseDrawing(video, canvas, { fit = 'contain' } = {}) {
  const ctx = canvas.getContext('2d');
  let pose = null; // { fps, points, frames }
  let index = null; // MediaPipe index -> position in a frame's list

  // The video's picture inside the canvas's box, as object-fit places it.
  function frameRect() {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    const ratio = video.videoWidth / video.videoHeight || 16 / 9;
    const fitW = fit === 'cover' ? Math.max(w, h * ratio) : Math.min(w, h * ratio);
    const fitH = fitW / ratio;
    return { x: (w - fitW) / 2, y: (h - fitH) / 2, w: fitW, h: fitH };
  }

  function clear() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  function draw(time) {
    const dpr = Math.min(devicePixelRatio, 2);
    if (canvas.width !== Math.round(canvas.clientWidth * dpr) || canvas.height !== Math.round(canvas.clientHeight * dpr)) {
      canvas.width = Math.round(canvas.clientWidth * dpr);
      canvas.height = Math.round(canvas.clientHeight * dpr);
    }
    clear();
    if (!pose) return;
    const frame = pose.frames[Math.min(pose.frames.length - 1, Math.max(0, Math.round(time * pose.fps)))];
    if (!frame) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const r = frameRect();
    const at = (p) => frame[index.get(p)];
    const seen = (p) => at(p) && at(p)[2] >= MIN_VISIBILITY;
    const xy = (p) => [r.x + at(p)[0] * r.w, r.y + at(p)[1] * r.h];
    ctx.strokeStyle = SIGNAL;
    ctx.lineWidth = Math.max(2.5, r.h / 160);
    ctx.lineCap = 'round';
    for (const [a, b] of BONES) {
      if (!seen(a) || !seen(b)) continue;
      ctx.beginPath();
      ctx.moveTo(...xy(a));
      ctx.lineTo(...xy(b));
      ctx.stroke();
    }
    ctx.fillStyle = '#ffffff';
    for (const p of pose.points) {
      if (p < 11 || !seen(p)) continue;
      ctx.beginPath();
      ctx.arc(...xy(p), ctx.lineWidth * 0.9, 0, 2 * Math.PI);
      ctx.fill();
    }
  }

  return {
    async load(url) {
      pose = null;
      clear();
      if (!url) return;
      pose = await (await fetch(url)).json();
      index = new Map(pose.points.map((p, i) => [p, i]));
    },
    draw,
    clear,
    ready: () => Boolean(pose),
    duration: () => (pose ? pose.frames.length / pose.fps : 0),
  };
}

/**
 * @param pane  the person's pane; a <video> and a <canvas> are added to it
 * @returns {{ show(clipId): Promise<boolean>, sync(time, playing, speed): void, dispose(): void }}
 */
export function createVideoOverlay(pane) {
  const video = Object.assign(document.createElement('video'), { muted: true, playsInline: true, loop: true, preload: 'auto' });
  video.className = 'source-video';
  const canvas = Object.assign(document.createElement('canvas'), { className: 'source-overlay' });
  pane.prepend(video, canvas);
  const drawing = createPoseDrawing(video, canvas, { fit: 'contain' });

  async function show(clipId) {
    const entry = VIDEOS[clipId];
    pane.classList.toggle('has-video', Boolean(entry));
    if (!entry) {
      await drawing.load(null); // no bones of the previous clip
      video.removeAttribute('src');
      video.load();
      return false;
    }
    video.src = BASE + entry.video;
    await drawing.load(BASE + entry.pose);
    return true;
  }

  /**
   * Keeps the video on the stage's clock: it plays on its own and is only nudged when it drifts
   * more than a few frames, so playback stays smooth. Call every animation frame.
   */
  function sync(time, playing, speed) {
    if (!drawing.ready()) return;
    const duration = video.duration || drawing.duration();
    const target = duration ? time % duration : time;
    if (Math.abs(video.currentTime - target) > 0.15) video.currentTime = target;
    video.playbackRate = speed;
    if (playing && video.paused) video.play().catch(() => {});
    if (!playing && !video.paused) video.pause();
    drawing.draw(video.currentTime);
  }

  return {
    show,
    sync,
    dispose() {
      video.pause();
      video.remove();
      canvas.remove();
    },
  };
}
