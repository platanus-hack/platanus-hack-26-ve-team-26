"""Temporal smoothing of the 33 MediaPipe points, offline (Savitzky-Golay).

MediaPipe estimates every frame on its own, so each point shakes a few centimeters from frame to
frame. In a PoseClip that noise is worse than it looks: the retargeting puts the lowest foot on the
floor every frame, so ankle noise becomes pelvis noise (the walk's pelvis jumped up to 2.4 m/s in
height between frames). More points do not help (MediaPipe gives 33, fixed); filtering in time does.

Why Savitzky-Golay and not a moving average: it fits a polynomial to each window instead of
averaging it, so it keeps the shape of fast but real motion (a heel strike, the turn at the top of
a swing) while removing the frame-to-frame noise. A moving average of the same window would round
those corners and shorten the step; the polynomial follows them. A planted foot (constant position)
passes through unchanged, so contacts with the ground are not flattened nor made to slide.

The camera (data/live) has no future frames, so it uses a causal One Euro filter instead.
"""

from __future__ import annotations

import numpy as np

# 0.4 s window, quartic fit (13 frames at 30 fps). Swept on the three preloaded clips with
# data/jitter.py (numbers in data/README.md): 0.4 s / order 4 removes as much shake as 0.3 s / cubic
# (p95 ankle acceleration down ~3x) but keeps more of the swing of the feet (the run lost 20% of its
# foot lift with the cubic, 20% -> 15% here); 0.6 s and longer start shortening the steps.
WINDOW_S = 0.4
ORDER = 4


def savgol(x: np.ndarray, window: int, order: int = ORDER) -> np.ndarray:
    """Savitzky-Golay filter along axis 0 (frames), any trailing shape.

    At the edges the polynomial of the first and last full window is evaluated at the missing
    frames, so the clip's first and last frames are fitted too instead of held flat.
    """
    n = len(x)
    window = min(window, n if n % 2 else n - 1)  # odd and no longer than the clip
    if window <= order:
        return x.copy()
    half = window // 2
    t = np.arange(-half, half + 1)
    fit = np.linalg.pinv(t[:, None] ** np.arange(order + 1))  # [order+1, window]: window -> coefficients
    windows = np.lib.stride_tricks.sliding_window_view(x, window, axis=0)  # [n-window+1, ..., window]
    out = np.empty_like(x, dtype=float)
    out[half : n - half] = windows @ fit[0]
    vander = t[:, None] ** np.arange(order + 1)
    out[:half] = np.moveaxis((windows[0] @ fit.T) @ vander[:half].T, -1, 0)
    out[n - half :] = np.moveaxis((windows[-1] @ fit.T) @ vander[half + 1 :].T, -1, 0)
    return out


def smooth_points(points: np.ndarray, fps: float, window_s: float = WINDOW_S) -> np.ndarray:
    """[F, 33, 3] positions -> the same, smoothed in time."""
    window = int(round(window_s * fps)) | 1  # odd, so the window is centered on its frame
    return savgol(points, window)
