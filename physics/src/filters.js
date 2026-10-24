// One Euro filter (Casiez, Roussel and Vogel, CHI 2012), the standard for smoothing motion
// capture: while the signal is still it cuts almost all the jitter, and as it moves faster the
// cutoff rises so the output does not lag. Carried over from Sombra (src/filters.js there).
//   minCutoff: cutoff in Hz at rest. Lower = less jitter when still, more lag.
//   beta: how much the cutoff rises per unit/s of speed. Higher = less lag when moving fast.
export class OneEuroFilter {
  constructor({ minCutoff, beta, dCutoff = 1 }) {
    this.minCutoff = minCutoff;
    this.beta = beta;
    this.dCutoff = dCutoff;
    this.reset();
  }

  reset() {
    this.x = null;
    this.dx = 0;
    this.t = null;
  }

  filter(value, t) {
    if (this.x === null || t <= this.t) {
      this.x = value;
      this.t = t;
      return value;
    }
    const dt = t - this.t;
    this.t = t;
    const dx = (value - this.x) / dt;
    this.dx += alpha(this.dCutoff, dt) * (dx - this.dx);
    const cutoff = this.minCutoff + this.beta * Math.abs(this.dx);
    this.x += alpha(cutoff, dt) * (value - this.x);
    return this.x;
  }
}

function alpha(cutoff, dt) {
  const tau = 1 / (2 * Math.PI * cutoff);
  return 1 / (1 + tau / dt);
}
