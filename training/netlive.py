"""A live picture of the policy network while it trains, for the web (GET /train/{id}/net).

Every NET_EVERY_S, ppo.py calls NetLive.write(): it runs the actor, exactly as it is at that moment,
on the last observations of one robot of the rollout, and writes training/runs/<run>/net.json with
what each neuron did, the strongest connections and how much each layer changed since the last
picture. Nothing here is made up for the show: it is the same network that becomes the ONNX.

A failure here never stops training: write() logs once and gives up on the picture.
"""

from __future__ import annotations

import json
import os
import time
from pathlib import Path

import numpy as np
import torch

# ~0.35 s per PPO update on an M2 (4096 steps at ~11.8k steps/s): a picture every 2 s is every ~6
# updates, and the web asks every ~2 s, the same cadence as GET /train.
NET_EVERY_S = 2.0
# 16 control steps of one robot (0.32 s at 50 Hz): the web plays them in a loop between pictures,
# so the neurons move with a real stretch of motion instead of blinking once every 2 s.
FRAMES = 16
# Strongest connections per layer by |weight|. All of them are ~90k (190x256 + 256x128 + 128x64 +
# 64x29), too many to send through the tunnel every 2 s or to read on screen; 500 per layer keep
# the structure visible and the JSON under ~60 KB.
TOP_EDGES = 500
# Points of the reward and episode-length curves sent along: enough for a smooth line.
HISTORY = 200


def _r(x: np.ndarray, digits: int = 2) -> list:
    return np.round(x.astype(np.float64), digits).tolist()


class NetLive:
    def __init__(self, run_dir: Path, task: str, total_steps: int):
        self.path = run_dir / "net.json"
        self.task = task
        self.total_steps = total_steps
        self.last = 0.0
        self.prev: list[np.ndarray] | None = None
        self.history: list[tuple[int, float, float]] = []
        self.broken = False

    def record(self, step: int, reward: float, episode_s: float) -> None:
        self.history.append((step, reward, episode_s))

    def due(self) -> bool:
        return not self.broken and time.time() - self.last >= NET_EVERY_S

    def write(self, model, obs: np.ndarray, step: int) -> None:
        """obs: (FRAMES or more, obs_dim) observations of one robot, oldest first."""
        try:
            self._write(model, obs[-FRAMES:], step)
        except Exception as e:  # the picture is a nicety; training is the product
            self.broken = True
            print(f"\nnetlive: no live picture of the network ({e})")
        self.last = time.time()

    @torch.no_grad()
    def _write(self, model, obs: np.ndarray, step: int) -> None:
        linears = [m for m in model.actor if isinstance(m, torch.nn.Linear)]
        x = model.norm(torch.as_tensor(obs, dtype=torch.float32))
        acts = [x.numpy()]  # the normalized input, what the first layer actually sees
        for i, layer in enumerate(model.actor):
            x = layer(x)
            if isinstance(layer, torch.nn.ELU) or i == len(model.actor) - 1:
                acts.append(x.numpy())

        weights = [l.weight.numpy().copy() for l in linears]  # (out, in)
        edges, change = [], []
        for k, w in enumerate(weights):
            flat = np.abs(w).ravel()
            n = min(TOP_EDGES, flat.size)
            top = np.argpartition(flat, -n)[-n:]
            out_i, in_i = np.unravel_index(top, w.shape)
            edges.append({"from": in_i.tolist(), "to": out_i.tolist(), "w": _r(w[out_i, in_i], 3)})
            # Relative change since the last picture: how hard PPO is moving this layer right now.
            if self.prev is not None:
                change.append(float(np.linalg.norm(w - self.prev[k]) / (np.linalg.norm(self.prev[k]) + 1e-8)))
        self.prev = weights

        hist = self.history
        if len(hist) > HISTORY:
            idx = np.linspace(0, len(hist) - 1, HISTORY).round().astype(int)
            hist = [hist[i] for i in idx]
        snapshot = {
            "step": step,
            "total_steps": self.total_steps,
            "task": self.task,
            "created_at": time.time(),
            "sizes": [a.shape[1] for a in acts],
            # frames x neurons per layer; hidden layers are ELU outputs, the last one the actions
            "activations": [_r(a) for a in acts],
            "edges": edges,
            "change": _r(np.array(change), 5) if change else None,
            "std": round(float(model.log_std.exp().mean()), 4),
            "history": {
                "step": [h[0] for h in hist],
                "reward": [round(h[1], 4) for h in hist],
                "episode_s": [None if np.isnan(h[2]) else round(h[2], 2) for h in hist],
            },
        }
        tmp = self.path.with_suffix(".json.tmp")
        tmp.write_text(json.dumps(snapshot, separators=(",", ":")))
        os.replace(tmp, self.path)  # the server never reads half a file
