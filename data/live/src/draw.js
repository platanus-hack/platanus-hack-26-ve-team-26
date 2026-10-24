// Draws MediaPipe's 2D landmarks over the camera image, same bones and colors as data/overlay.py.

// MediaPipe Pose body connections (face left out to keep the drawing readable).
const BONES = [
  [11, 12], [11, 13], [13, 15], [12, 14], [14, 16], [11, 23], [12, 24], [23, 24],
  [23, 25], [25, 27], [27, 29], [29, 31], [27, 31], [24, 26], [26, 28], [28, 30], [30, 32], [28, 32],
];

/**
 * @param ctx        2D context of a canvas laid over the video, with the video's pixel size
 * @param landmarks  33 points normalized to the image ({ x, y, visibility }), from onPose
 * @param visible    false draws in red: the body is too occluded for the clip
 */
export function drawSkeleton(ctx, landmarks, visible = true) {
  const { width, height } = ctx.canvas;
  ctx.clearRect(0, 0, width, height);
  if (!landmarks) return;
  const color = visible ? 'rgb(80, 220, 80)' : 'rgb(230, 60, 60)';
  const thick = Math.max(2, height / 300);
  const pt = (i) => [landmarks[i].x * width, landmarks[i].y * height];
  ctx.strokeStyle = color;
  ctx.lineWidth = thick;
  ctx.lineCap = 'round';
  for (const [a, b] of BONES) {
    ctx.beginPath();
    ctx.moveTo(...pt(a));
    ctx.lineTo(...pt(b));
    ctx.stroke();
  }
  ctx.fillStyle = 'white';
  for (let i = 11; i < 33; i++) {
    ctx.beginPath();
    ctx.arc(...pt(i), thick + 1, 0, Math.PI * 2);
    ctx.fill();
  }
}
