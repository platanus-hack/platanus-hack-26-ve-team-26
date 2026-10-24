// Point samplers for the dot robots: each returns `n` points as [x, y, z] arrays.
// Surfaces only, not volumes: a hollow shell of dots reads as a solid shape from any angle.

const rand = (a, b) => a + Math.random() * (b - a);

/** Capsule hanging down from the origin along -y: a limb from its joint. */
export function capsule(length, radius, n) {
  const points = [];
  for (let i = 0; i < n; i++) {
    const angle = rand(0, 2 * Math.PI);
    points.push([radius * Math.cos(angle), -rand(0, length), radius * Math.sin(angle)]);
  }
  return points;
}

/** Surface of a box centered at `c` with size [w, h, d]; faces get points by area. */
export function box(c, [w, h, d], n) {
  const faces = [
    [w * h, (u, v) => [u * w, v * h, d / 2]],
    [w * h, (u, v) => [u * w, v * h, -d / 2]],
    [d * h, (u, v) => [w / 2, v * h, u * d]],
    [d * h, (u, v) => [-w / 2, v * h, u * d]],
    [w * d, (u, v) => [u * w, h / 2, v * d]],
    [w * d, (u, v) => [u * w, -h / 2, v * d]],
  ];
  const total = faces.reduce((sum, [area]) => sum + area, 0);
  const points = [];
  for (let i = 0; i < n; i++) {
    let pick = rand(0, total);
    const [, at] = faces.find(([area]) => (pick -= area) <= 0) ?? faces[0];
    const [x, y, z] = at(rand(-0.5, 0.5), rand(-0.5, 0.5));
    points.push([c[0] + x, c[1] + y, c[2] + z]);
  }
  return points;
}

/** Surface of an ellipsoid centered at `c` with radii [rx, ry, rz]. */
export function ellipsoid(c, [rx, ry, rz], n, keep = () => true) {
  const points = [];
  while (points.length < n) {
    // Uniform direction on the sphere, then stretched.
    const z = rand(-1, 1);
    const angle = rand(0, 2 * Math.PI);
    const r = Math.sqrt(1 - z * z);
    const p = [r * Math.cos(angle), r * Math.sin(angle), z];
    if (!keep(p)) continue;
    points.push([c[0] + rx * p[0], c[1] + ry * p[1], c[2] + rz * p[2]]);
  }
  return points;
}

/**
 * A flat screen of w × h facing +z, as a jittered grid so it reads as pixels.
 * Returns points with their [u, v] in 0..1, for the shader to animate the picture.
 */
export function screen(c, [w, h], n) {
  const cols = Math.max(2, Math.round(Math.sqrt((n * w) / h)));
  const rows = Math.max(2, Math.round(n / cols));
  const points = [];
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const u = (i + 0.5) / cols;
      const v = (j + 0.5) / rows;
      points.push({ p: [c[0] + (u - 0.5) * w, c[1] + (v - 0.5) * h, c[2]], uv: [u, v] });
    }
  }
  return points;
}
